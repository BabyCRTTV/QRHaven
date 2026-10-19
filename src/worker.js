// QRHaven's backend. Only the stable /r/<id> URL is placed inside QR codes.
const ID_RE = /^[A-Za-z0-9_-]{18}$/;
const MAX_BODY = 4096;

export function validateDestination(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) {
    throw new Error("Enter a link with at most 2,048 characters.");
  }
  const text = value.trim();
  if (!/^https?:\/\//i.test(text)) throw new Error("Link must begin with https:// or http://.");
  let url;
  try { url = new URL(text); }
  catch { throw new Error("Enter a valid website link."); }
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error("Only public-looking HTTP(S) links without embedded passwords are supported.");
  }
  return url.href;
}

export function validateTitle(value) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > 80) {
    throw new Error("The optional label must be 80 characters or fewer.");
  }
  return value.trim();
}

function randomId(bytes) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function hashSecret(secret) {
  const data = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}

function responseJson(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}

async function readBody(request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw Object.assign(new Error("Request is too large."), { status: 413 });
  let json;
  try { json = JSON.parse(raw); }
  catch { throw Object.assign(new Error("Send valid JSON."), { status: 400 }); }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw Object.assign(new Error("Send a JSON object."), { status: 400 });
  }
  return json;
}

function managementBase(request, env) {
  if (!env.FRONTEND_BASE_URL) return publicOrigin(request, env) + "/";
  const url = new URL(env.FRONTEND_BASE_URL);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Invalid FRONTEND_BASE_URL");
  url.hash = ""; url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url.href;
}
function withApiCors(response, request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !new URL(request.url).pathname.startsWith("/api/")) return response;
  const trustedOrigin = env.CORS_ALLOWED_ORIGIN || "https://babycrttv.github.io";
  if (origin !== trustedOrigin && origin !== new URL(request.url).origin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "600");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, headers });
}
function publicOrigin(request, env) {
  if (!env.PUBLIC_BASE_URL) return new URL(request.url).origin;
  const url = new URL(env.PUBLIC_BASE_URL);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Invalid PUBLIC_BASE_URL setting");
  return url.origin;
}

async function authenticatedRecord(request, env, id) {
  const auth = request.headers.get("Authorization") || "";
  const secret = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return null;
  const row = await env.DB.prepare(
    "SELECT id, destination, title, owner_hash, created_at, updated_at, scan_count FROM links WHERE id = ?"
  ).bind(id).first();
  if (!row || (await hashSecret(secret)) !== row.owner_hash) return null;
  return row;
}

const apiError = (message, status = 400) => responseJson({ error: message }, status);

async function handleApi(request, env, path) {
  if (path === "/api/links" && request.method === "POST") {
    const body = await readBody(request);
    const destination = validateDestination(body.destination);
    const title = validateTitle(body.title);
    const id = randomId(13); // 18 URL-safe characters; approx. 104 bits
    const secret = randomId(32); // one-time capability; only its SHA-256 hash is stored
    const ownerHash = await hashSecret(secret);
    await env.DB.prepare(
      "INSERT INTO links (id, destination, title, owner_hash) VALUES (?, ?, ?, ?)"
    ).bind(id, destination, title, ownerHash).run();
    const origin = publicOrigin(request, env);
    return responseJson({
      id,
      title,
      destination,
      scanUrl: origin + "/r/" + id,
      manageUrl: managementBase(request, env) + "#/manage/" + id + "/" + secret
    }, 201);
  }

  const match = path.match(/^\/api\/links\/([A-Za-z0-9_-]{18})$/);
  if (match && ["GET", "PATCH"].includes(request.method)) {
    const row = await authenticatedRecord(request, env, match[1]);
    if (!row) return apiError("Not found or management key is invalid.", 404);
    if (request.method === "GET") {
      return responseJson({
        id: row.id, destination: row.destination, title: row.title,
        createdAt: row.created_at, updatedAt: row.updated_at, scans: row.scan_count,
        scanUrl: publicOrigin(request, env) + "/r/" + row.id
      });
    }

    const body = await readBody(request);
    const destination = validateDestination(body.destination);
    const title = validateTitle(body.title);
    await env.DB.prepare(
      "UPDATE links SET destination = ?, title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
    ).bind(destination, title, row.id).run();
    return responseJson({
      id: row.id, destination, title,
      scanUrl: publicOrigin(request, env) + "/r/" + row.id
    });
  }

  return apiError("Endpoint not found.", 404);
}

async function handleRedirect(request, env, ctx, id) {
  const row = await env.DB.prepare("SELECT destination FROM links WHERE id = ?").bind(id).first();
  if (!row) return new Response("This QRHaven link was not found.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
  });
  if (request.method === "GET") {
    ctx.waitUntil(
      env.DB.prepare("UPDATE links SET scan_count = scan_count + 1 WHERE id = ?")
        .bind(id).run().catch(error => console.warn("Scan count update failed:", error))
    );
  }
  return new Response(null, {
    status: 302,
    headers: {
      "Location": row.destination,
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex"
    }
  });
}

async function fetchInternal(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      if (path === "/health" && request.method === "GET") {
        return responseJson({ status: "ok", service: "QRHaven" });
      }
      if (path === "/api" || path.startsWith("/api/")) {
        if (request.method === "OPTIONS") return new Response(null, { status: 204 });
        return await handleApi(request, env, path);
      }
      const redirect = path.match(/^\/r\/([A-Za-z0-9_-]{18})$/);
      if (redirect && ["GET", "HEAD"].includes(request.method)) {
        return await handleRedirect(request, env, ctx, redirect[1]);
      }
      if (path.startsWith("/r/")) return new Response("QR code not found.", { status: 404 });
      if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed.", { status: 405 });
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("X-Content-Type-Options", "nosniff");
      if ((headers.get("Content-Type") || "").includes("text/html")) {
        headers.set("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      }
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    } catch (error) {
      if (error.status) return apiError(error.message, error.status);
      if (error.message && /^(Enter |Link must|Only public-looking|The optional label)/.test(error.message)) {
        return apiError(error.message, 400);
      }
      console.error("QRHaven server error", error);
      return apiError("Server error. Please try again.", 500);
    }
 }
export default {
  async fetch(request, env, ctx) {
    return withApiCors(await fetchInternal(request, env, ctx), request, env);
  }
};
