# QRHaven

**Simple dynamic QR codes. Create once, change the destination later.**

QRHaven is a small, mobile-friendly website that creates QR codes and lets you change where each code points without needing to reprint it.

## Main links

- Repository: https://github.com/BabyCRTTV/QRHaven
- Live GitHub Pages app: https://babycrttv.github.io/QRHaven/
- Redirect service: https://qrhaven.8bittrade.workers.dev
- Work-agent build instructions: [HANDOFF_TO_WORK.md](HANDOFF_TO_WORK.md)

## How it works

- Enter a website URL, optionally add a label, and press Generate.
- Download the QR code as PNG or SVG; copy its scan URL.
- The QR only encodes your stable Cloudflare Worker URL: https://qrhaven.8bittrade.workers.dev/r/RANDOM-ID.
- The current destination is saved in Cloudflare D1. When someone scans the QR, a 302 redirect looks up its latest destination.
- You get a secret management link to update its destination without replacing the QR image.
- Changes to the contents of the original webpage require no action if its URL stays the same. If its URL changes, update the QRHaven mapping.

## Architecture

- Frontend: responsive vanilla JavaScript, Vite and qrcode npm package.
- Publishing: GitHub Pages workflow (.github/workflows/pages.yml), for the simple public frontend.
- Backend: Cloudflare Worker (src/worker.js) and D1 database (migrations/0001_create_links.sql).
- Production backend is API-only; its homepage redirects to GitHub Pages. Wrangler development/deployments may also serve frontend static assets.
- The Pages site makes API calls to the separately hosted Worker; cross-origin requests are permitted from the official Pages origin.
- No account required: the edit link is your credential. Anyone who has that private link can edit the code, so save it securely and don't share it.

## Step-by-step deployment

1. Enable GitHub Pages in Repository Settings > Pages > Source > GitHub Actions.
2. Install Node.js 22+. Run npm ci and npm test locally.
3. Authenticate Cloudflare: npx wrangler login.
4. The production qrhaven database already exists. Do not create a replacement when updating this deployment.
5. Keep the production database ID in wrangler.jsonc: 7355624c-f3a1-4092-85ba-512d43cfe04b. For a separate installation, create a new D1 database and use its UUID.
6. Apply schema: npm run db:remote.
7. Configure Cloudflare Worker environment variables FRONTEND_BASE_URL=https://babycrttv.github.io/QRHaven/ and CORS_ALLOWED_ORIGIN=https://babycrttv.github.io. Optionally set PUBLIC_BASE_URL to a stable custom Worker URL.
8. Deploy backend: npm run deploy. Record the real https://....workers.dev URL.
9. GitHub repository Settings > Secrets and variables > Actions > Variables > New repository variable: QRHAVEN_API_ORIGIN = the actual HTTPS Worker origin, no trailing slash.
10. Rerun the Publish QRHaven Pages GitHub Actions workflow. Visit https://babycrttv.github.io/QRHaven/.
11. Verify end-to-end: generate QR to website A, download PNG, scan it; open management link, update to website B, and scan the same PNG again. Both scans use identical QR but have different destinations.

Local development: npm run db:local then npm run dev. Wrangler handles frontend static assets and backend API at one local origin. The Pages workflow automatically uses /QRHaven/ as the Vite build base.

## Caveats

QR codes are only as permanent as their embedded hostname, the redirect service, and the saved D1 mapping. Choose and maintain a stable Worker hostname/domain, retain Cloudflare account access, and back up your production data. A website changing its URL cannot be detected automatically. Scan counts are aggregate only, and scans from crawlers may be included. Creation is limited to 10 attempts per minute per IP per Cloudflare location using a native rate-limit binding. Untrusted browser origins are rejected and request bodies are capped at 4 KiB while streaming. Rate limiting is approximate and is not a complete phishing/spam filter; the operator should monitor abuse before large-scale promotion.

Production configuration and verification results are recorded in [DEPLOYMENT.md](DEPLOYMENT.md). The private management link is the only editing credential; keep it safe.
