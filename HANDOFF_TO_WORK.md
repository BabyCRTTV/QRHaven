# QRHaven — ChatGPT Work Agent Handoff

Repository: https://github.com/BabyCRTTV/QRHaven
Target live Pages site: https://babycrttv.github.io/QRHaven/
Backend: Cloudflare Workers + D1 (deployed)
Status: GitHub Pages and Cloudflare are connected. Read DEPLOYMENT.md for production resources and verification. Instructions below are retained as the original requirements; do not recreate the production database or change the stable redirect host during routine updates.

## Copy this prompt into ChatGPT Work

> Please finish, test, and deploy QRHaven from my existing repository https://github.com/BabyCRTTV/QRHaven. Read README.md and HANDOFF_TO_WORK.md, keep the interface simple, and preserve all code already present. Enable and publish a working GitHub Pages frontend at https://babycrttv.github.io/QRHaven/. Create/bind the Cloudflare D1 database, deploy the Cloudflare Worker backend, set the GitHub Actions variable QRHAVEN_API_ORIGIN to the real Worker HTTPS origin, and configure Cloudflare FRONTEND_BASE_URL=https://babycrttv.github.io/QRHaven/ and CORS_ALLOWED_ORIGIN=https://babycrttv.github.io. Work through any GitHub/Cloudflare connection authorization with me if needed. Ensure the Pages form actually generates QR images (PNG and SVG), the QR embeds the permanent Worker /r/:id URL rather than the original URL, and the private management link changes the destination in the database without changing that same QR image. Test creation, download, scanning, management, updating, rescanning, and the mobile interface. Fix any build, Actions, API, CORS, and UI errors. Add creation spam/rate-limit protections before promoting the site for arbitrary public use. Keep all features free-tier friendly. Commit verified changes and tell me the actual live Pages URL, redirect hostname, test results, and any remaining steps. Do not claim it is working until you have tested production redirects.

## Required behavior

1. Paste a normal HTTP or HTTPS link (optional friendly label).
2. Click Generate and show QR preview plus high-resolution PNG and SVG downloads.
3. Show a permanent, shareable URL containing only the QRHaven redirect host and a random QR ID.
4. Return a 302 (not 301), with no-store caching, to the current destination in D1.
5. Change that destination through a secret management URL, while keeping the scan URL and existing printed image identical.
6. Keep management token private (stored only as a hash in D1; browser sends it via Authorization, never in scanning URL).
7. Publish frontend via GitHub Pages Actions, not only as source code. GitHub Pages is static and requires the separately deployed Worker.
8. Keep the long-term redirect host stable. If it disappears, printed QR codes cannot be rescued by reconfiguring a different domain.
9. Run and verify tests and production site on Android/mobile and desktop.

## Deployment instructions for Work

- GitHub Settings > Pages > Build and deployment > Source = GitHub Actions.
- From cloned repository: npm install; npm test; npm run build.
- Sign in to Cloudflare through the authorized Wrangler login.
- Run npx wrangler d1 create qrhaven; copy the returned database UUID into wrangler.jsonc (replacing the placeholder).
- Run npm run db:remote; npm run deploy.
- In Cloudflare Worker environment, set FRONTEND_BASE_URL to https://babycrttv.github.io/QRHaven/ and CORS_ALLOWED_ORIGIN to https://babycrttv.github.io. Redeploy after setting values.
- In GitHub Settings > Secrets and variables > Actions > Variables, set QRHAVEN_API_ORIGIN to the actual deployed Worker origin, without trailing slash.
- Re-run Publish QRHaven Pages workflow and verify the Pages site form makes correct API calls.
- Confirm 302, no-store, database durability, proper CORS OPTIONS support, no QR change after changing target.
- Before printing many codes, pick the permanent Worker/custom domain and back up database regularly.
- For a broadly public generator, add Cloudflare WAF/rate limits or Turnstile validation to creation.

## Handoff limitations

The repository can be updated using the GitHub connector, but that alone does not authorize Cloudflare account access or guarantee Pages is configured in GitHub Settings. Once both services are live, test them rather than treating a green GitHub commit as proof of deployment.
