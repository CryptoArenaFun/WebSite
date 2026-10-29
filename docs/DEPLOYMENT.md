# Deployment runbook

## Environments
- **Local**: `npm install`, `npm run dev`.
- **Pull requests**: GitHub Actions runs lint and production build. No production deployment.
- **Production**: merge to `main` after green CI and review; Cloudflare Worker `cryptoarenawebsite` serves `dist/` after successful build/deploy.

## Cloudflare build settings
- Git repository: `CryptoArenaFun/WebSite`
- Production branch: `main`
- Root directory: `/`
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Worker name: `cryptoarenawebsite`
- Output directory: `dist/` (configured in `wrangler.jsonc`)

## Preflight checklist
1. Verify Cloudflare's GitHub integration can access this repository; a ChatGPT GitHub connection is **not** the same as Cloudflare's GitHub App permission.
2. Generate and commit `package-lock.json` and switch CI to `npm ci` before production release.
3. Verify CI success on the exact production commit.
4. Configure Git-based build trigger for `main`, using a least-privilege Cloudflare build token.
5. Deploy to a preview or workers.dev URL first and validate response headers, assets, navigation and mobile layout.
6. Attach `cryptoarena.fun` only after successful smoke tests. Preserve existing MX/TXT email records.
7. Confirm HTTPS and redirects; capture deployment version and time.

## Rollback
Use Cloudflare Workers Deployments to restore the last known-good deployment. Re-test the home page and static assets, then document the incident. Never delete unrelated DNS records or workers.

## Current known limitation
The existing Worker was initially created from a dashboard template. Git build triggers and domain routing were not yet verified as configured. Do not assume the production site is live solely because the Worker exists.
