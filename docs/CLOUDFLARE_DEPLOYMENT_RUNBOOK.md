# CryptoArena.fun — Cloudflare Deployment & V64/V68 Incident Runbook

Last updated: 2026-10-30. Repository: `CryptoArenaFun/WebSite`, branch `main`.

## Incident: GitHub and Builds at V68, website still showed V64

**Symptoms:** `https://cryptoarena.fun/test1/` displayed `CHART LAB · V64`, including in private/incognito browsing and after a Cloudflare cache purge. GitHub `public/test1/index.html` contained `CHART LAB · V68`. Cloudflare Workers Builds reported successful builds and deployments.

**Verified root cause:** A separate, higher-priority **Cloudflare Workers Route** intercepted `cryptoarena.fun/test1*` and sent requests to the old `cryptoarena-test1` Worker. The intended, GitHub-connected `cryptoarenawebsite` Worker was deployed successfully but was **bypassed for this path**. Rebuilding, cache-busting query strings, and purging cache could not fix a routing override.

**Fix performed 2026-10-30:** Deleted the obsolete route ID `2078bfb17ce943b992557db90ad05855` from zone `18e426819fdebe905c5ff401075f5bc8`. Cloudflare API returned HTTP 200 / success; subsequent route listing returned `[]`. Main custom domain remained attached to `cryptoarenawebsite`, whose latest deployment served 100% of traffic. User subsequently reported that it appeared fixed. No site source files were modified for this fix.

## Production mapping (as verified on incident date)

- Domain: `cryptoarena.fun`
- Cloudflare account ID: `9f61ad29daa80f91525deb7afeaace86`
- Cloudflare zone ID: `18e426819fdebe905c5ff401075f5bc8`
- **Canonical production Worker:** `cryptoarenawebsite`
- Old Worker (do not route `/test1*` to it): `cryptoarena-test1`
- Production Worker script tag (Cloudflare Builds API): `89e70766dda94f54915f50ea0c771b0d`
- GitHub repository: `CryptoArenaFun/WebSite`, branch `main`
- Chart Lab source: `public/test1/index.html`
- Wrangler config: `wrangler.jsonc`; `assets.directory = "./dist"`, `not_found_handling = "single-page-application"`
- Build: `npm run build` (`tsc -b && vite build`); deploy: `npx wrangler deploy`
- Cloudflare build trigger ID: `91edee1f-56b8-4815-940f-b082a3ce263f`
- GitHub connection existed and auto-build was enabled.
- Last verified production deployment during fix: version ID `030a376d-ae18-470a-9134-c4719ee8637e`, version number 89, created 2026-10-30 05:33:13 UTC, traffic 100%.

## First-response checklist for a future “old version still showing” incident

1. **Confirm source**: Inspect `public/test1/index.html` in GitHub `main`; search for visible version marker. Do not assume GitHub content is what the domain serves.
2. **Confirm build**: Inspect Cloudflare Workers Builds for `cryptoarenawebsite` and the deployed commit, build result, and deployment. A successful build alone does not prove correct routing.
3. **CHECK ROUTES EARLY (critical)**: List `GET /zones/{zone_id}/workers/routes`. Look for `cryptoarena.fun/test1*` or any overlapping path pattern mapped to a different Worker. A path route may take precedence over the domain's default Worker.
4. **Check domain attachment**: `GET /accounts/{account_id}/workers/domains`; confirm `cryptoarena.fun` points to `cryptoarenawebsite` in production.
5. **Check active deployment**: `GET /accounts/{account_id}/workers/scripts/cryptoarenawebsite/deployments`; inspect the newest deployment's version ID and traffic percentage.
6. **Resolve the actual conflict**: If an obsolete route intercepts `/test1/`, remove **only the confirmed obsolete route** with `DELETE /zones/{zone_id}/workers/routes/{route_id}`. Verify route list again. Do not delete the main Worker or unrelated routes. Obtain confirmation before deleting a route if its ownership/purpose is unclear.
7. **Verify externally**: Load `https://cryptoarena.fun/test1/` (and optionally an incognito session) and confirm version marker and chart functionality. Distinguish API-side success from user/browser verification.
8. Only if routing is correct, investigate service workers, CDN/browser cache, assets manifest, SPA fallback, or stale build output. Avoid blind redeploy loops.

## Useful Cloudflare API endpoints

```text
GET    /zones/18e426819fdebe905c5ff401075f5bc8/workers/routes
DELETE /zones/18e426819fdebe905c5ff401075f5bc8/workers/routes/{route_id}
GET    /accounts/9f61ad29daa80f91525deb7afeaace86/workers/domains
GET    /accounts/9f61ad29daa80f91525deb7afeaace86/workers/scripts/cryptoarenawebsite/deployments
GET    /accounts/9f61ad29daa80f91525deb7afeaace86/workers/scripts/cryptoarenawebsite/versions
GET    /accounts/9f61ad29daa80f91525deb7afeaace86/builds/workers/89e70766dda94f54915f50ea0c771b0d
POST   /accounts/9f61ad29daa80f91525deb7afeaace86/builds/triggers/91edee1f-56b8-4815-940f-b082a3ce263f/builds
GET    /accounts/9f61ad29daa80f91525deb7afeaace86/builds/builds/{build_uuid}
GET    /accounts/9f61ad29daa80f91525deb7afeaace86/builds/builds/{build_uuid}/logs
```

For manual build trigger POST, use JSON `{"branch":"main"}` or `{"commit_hash":"<full-40-character-sha>"}`. **Important:** Builds Worker configuration is keyed by the **script tag** `89e70766dda94f54915f50ea0c771b0d`, not by the Worker name. Querying the wrong key can falsely suggest that no build configuration exists.

## Lessons / prevention

- Maintain **one canonical production path owner**: the `cryptoarenawebsite` Worker serves `cryptoarena.fun` and `/test1/` through static assets. Do not create a competing `cryptoarena.fun/test1*` route.
- Document and review Worker Routes whenever adding temporary preview Workers or new deployment methods.
- Before diagnosing “cache”, compare GitHub source, actual production deployment, **route precedence**, and observed live page.
- Do not claim a production fix solely from successful Build/Deploy logs.
- Do not change the TradingView chart or Chart Lab design to solve an infrastructure routing problem.
- Keep this runbook up to date if the production Worker, zone, route topology, or build trigger changes.

## Historical incident evidence

- V68 source commit: `aac79a83120728b42fbc94f527950e16325d98fd`.
- Successful V68 manual build UUID: `4e7959b6-d098-4b66-b6e7-5458bb52be64`.
- Obsolete `/test1*` route: `2078bfb17ce943b992557db90ad05855` → `cryptoarena-test1`.
- Route DELETE returned success, route listing became empty, canonical production Worker still deployed.
- User reported “ظاهرا اوکی شد” after route correction.
