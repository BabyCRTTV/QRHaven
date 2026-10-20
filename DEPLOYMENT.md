# QRHaven production deployment

Verified on October 19, 2026 (America/New_York).

## Live services

| Resource | Production value |
| --- | --- |
| Public app | https://babycrttv.github.io/QRHaven/ |
| Redirect/API origin | https://qrhaven.8bittrade.workers.dev |
| Worker | qrhaven |
| D1 database | qrhaven |
| D1 database UUID | 7355624c-f3a1-4092-85ba-512d43cfe04b |
| Pages publishing source | GitHub Actions |
| Repository variable QRHAVEN_API_ORIGIN | https://qrhaven.8bittrade.workers.dev |
| FRONTEND_BASE_URL | https://babycrttv.github.io/QRHaven/ |
| CORS_ALLOWED_ORIGIN | https://babycrttv.github.io |
| CREATE_LIMITER | Namespace 20261020; 10 attempts per 60 seconds per IP per Cloudflare location |

The Cloudflare connector deployed the module Worker with D1, environment, and rate-limit bindings. Production uses an API-only Worker whose root redirects to Pages; Wrangler also supports deploying the frontend as Worker assets. Neither route changes `/r/:id`.

## Verified behavior

- GitHub Pages workflow builds, runs the six backend tests, and publishes successfully.
- The live Pages form creates a D1-backed link via cross-origin API requests.
- Management requires its private bearer token. Unauthenticated access returns 404, and D1 stores a 64-character SHA-256 token hash.
- Production preflight returns 204 and allows the Pages origin. Creation from an untrusted browser origin returns 403.
- Browser management updates the destination. The same scan URL first reached `https://example.com/`, then `https://example.org/`.
- Production redirects return 302 and `Cache-Control: no-store, max-age=0`.
- Native PNG and SVG download assets are generated in the published app. A downloaded 1200 × 1200 PNG was decoded independently: it contains the Worker `/r/:id` URL, rather than the destination.
- Downloading that PNG again after editing the destination produced identical bytes. Separate production API checks also compared identical PNG buffers before and after an update.
- D1 readback confirmed that edited destinations and scan counts persist across separate requests.
- Creation protection tests cover rejected origins, 429 with Retry-After/CORS, no database writes on rejection, and fail-closed behavior if the limiter is absent. The configured native limiter is approximate; a sequential production probe did not trigger 429 and is not treated as proof of its threshold.

Desktop browser interaction was verified. The layout includes the existing mobile breakpoint, but physical Android/iOS testing was not performed in this environment.

## Updating safely

- Keep the Worker name, account subdomain, and D1 database stable. Printed QR codes depend on them.
- Use `npm ci`, `npm test`, and `npm run build` before publishing.
- Commits to main republish GitHub Pages automatically using QRHAVEN_API_ORIGIN.
- Backend edits require a separate Worker deployment; the Pages workflow does not deploy Cloudflare. Use the connected Cloudflare tooling or authorized `npm run deploy`.
- Apply new migrations to the existing production D1 database. Do not recreate it during updates.
- Back up D1 before schema changes and periodically thereafter. Keep management links private; they are the editing credentials.
- Rate limits reduce creation spam but do not replace abuse monitoring or phishing review before large-scale promotion.
