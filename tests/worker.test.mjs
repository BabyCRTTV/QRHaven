import test from "node:test";
import assert from "node:assert/strict";
import worker, { validateDestination, validateTitle } from "../src/worker.js";

class FakeDb {
  constructor() { this.rows = new Map(); }
  prepare(query) {
    const database = this;
    return { bind(...params) { return {
      async first() {
        const row = database.rows.get(params[0]);
        return query.startsWith("SELECT destination FROM links")
          ? (row ? { destination: row.destination } : null)
          : (row || null);
      },
      async run() {
        if (query.startsWith("INSERT INTO links")) {
          const [id, destination, title, owner_hash] = params;
          database.rows.set(id, { id, destination, title, owner_hash,
            created_at: "2026-10-19T00:00:00Z", updated_at: "2026-10-19T00:00:00Z", scan_count: 0 });
        } else if (query.startsWith("UPDATE links SET destination")) {
          const [destination, title, id] = params;
          Object.assign(database.rows.get(id), { destination, title });
        } else if (query.startsWith("UPDATE links SET scan_count")) {
          database.rows.get(params[0]).scan_count++;
        } else { throw new Error("Unrecognized query " + query); }
        return { success: true };
      }
    }; } };
  }
}
function fixture() {
  const env = { DB: new FakeDb(), ASSETS: { fetch: async () => new Response("asset") },
    CREATE_LIMITER: { limit: async () => ({ success: true }) },
    FRONTEND_BASE_URL: "https://babycrttv.github.io/QRHaven/",
    CORS_ALLOWED_ORIGIN: "https://babycrttv.github.io" };
  const pending = [];
  const ctx = { waitUntil: p => pending.push(p) };
  const call = (path, init) => worker.fetch(new Request("https://qr.example" + path, init), env, ctx);
  return { call, pending, env };
}
test("validates destinations and labels", () => {
  assert.equal(validateDestination(" https://example.com/a "), "https://example.com/a");
  assert.throws(() => validateDestination("javascript:alert(1)"));
  assert.throws(() => validateDestination("ftp://example.com"));
  assert.throws(() => validateDestination("https://user:pass@example.com"));
  assert.throws(() => validateTitle("a".repeat(81)));
});
test("creation, management, updates and same QR scan destination", async () => {
  const { call, pending } = fixture();
  const createdResponse = await call("/api/links", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destination: "https://example.com/old", title: "First" })
  });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.match(created.scanUrl, /^https:\/\/qr\.example\/r\/[A-Za-z0-9_-]{18}$/);
  assert.match(created.manageUrl, /^https:\/\/babycrttv\.github\.io\/QRHaven\/#\/manage\//);
  assert.equal((await call("/api/links/" + created.id)).status, 404);
  const token = created.manageUrl.split("/").at(-1);
  const headers = { Authorization: "Bearer " + token };
  const details = await call("/api/links/" + created.id, { headers });
  assert.equal((await details.json()).destination, "https://example.com/old");
  const scan = await call("/r/" + created.id);
  assert.equal(scan.status, 302);
  assert.equal(scan.headers.get("Location"), "https://example.com/old");
  assert.match(scan.headers.get("Cache-Control"), /no-store/);
  await Promise.all(pending);
  const saved = await call("/api/links/" + created.id, {
    method: "PATCH", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ destination: "https://example.org/new", title: "Second" })
  });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).scanUrl, created.scanUrl);
  const secondScan = await call("/r/" + created.id);
  assert.equal(secondScan.headers.get("Location"), "https://example.org/new");
});
test("cross-origin API requests from approved Pages origin", async () => {
  const { call } = fixture();
  const opts = await call("/api/links", { method: "OPTIONS", headers: {
    Origin: "https://babycrttv.github.io", "Access-Control-Request-Method": "POST" } });
  assert.equal(opts.status, 204);
  assert.equal(opts.headers.get("Access-Control-Allow-Origin"), "https://babycrttv.github.io");
  const post = await call("/api/links", { method: "POST", headers: {
    Origin: "https://babycrttv.github.io", "Content-Type": "application/json" },
    body: JSON.stringify({ destination: "https://example.com" }) });
  assert.equal(post.status, 201);
  assert.equal(post.headers.get("Access-Control-Allow-Origin"), "https://babycrttv.github.io");
});
test("invalid requests and unknown redirects", async () => {
  const { call } = fixture();
  const invalid = await call("/api/links", { method: "POST", body: JSON.stringify({ destination: "file:///private" }) });
  assert.equal(invalid.status, 400);
  const oversize = await call("/api/links", { method: "POST", body: "z".repeat(4200) });
  assert.equal(oversize.status, 413);
  assert.equal((await call("/r/AAAAAAAAAAAAAAAAAA")).status, 404);
  assert.equal((await call("/health")).status, 200);
});

test("creation protection rejects untrusted origins and rate limits before database writes", async () => {
  const { call, env } = fixture();
  const post = headers => call("/api/links", { method: "POST", headers,
    body: JSON.stringify({ destination: "https://example.com" }) });
  assert.equal((await post({ Origin: "https://untrusted.example" })).status, 403);
  env.CREATE_LIMITER = { limit: async ({ key }) => {
    assert.equal(key, "create:192.0.2.1");
    return { success: false };
  } };
  const response = await post({ "CF-Connecting-IP": "192.0.2.1", Origin: env.CORS_ALLOWED_ORIGIN });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "60");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), env.CORS_ALLOWED_ORIGIN);
  assert.equal(env.DB.rows.size, 0);
  delete env.CREATE_LIMITER;
  assert.equal((await post({})).status, 503);
});

test("API-only Worker redirects its homepage to Pages", async () => {
  const { call, env } = fixture();
  delete env.ASSETS;
  const response = await call("/");
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("Location"), env.FRONTEND_BASE_URL);
});
