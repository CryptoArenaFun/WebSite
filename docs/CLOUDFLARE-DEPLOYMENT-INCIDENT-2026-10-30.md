# CryptoArena.fun — Cloudflare deployment incident & recovery runbook

**Incident date:** 2026-10-30  
**Status:** Root cause confirmed, conflicting route removed, user reported site appears fixed.  
**Scope:** `https://cryptoarena.fun/test1/` showed **Chart Lab V64** even though GitHub and Cloudflare deployments contained **V68**.

## Root cause (confirmed by Cloudflare API)

Two separate Workers were configured for the same hostname:

1. **Production custom domain** `cryptoarena.fun` → Worker **`cryptoarenawebsite`**, receiving 100% of its deployment traffic.
2. **Higher-priority Worker route** `cryptoarena.fun/test1*` → Worker **`cryptoarena-test1`** (an older standalone Worker).

The specific route intercepted requests for `/test1/` before they could reach the main website Worker. Rebuilding and redeploying `cryptoarenawebsite`, purging Cloudflare cache, adding query strings, and using incognito did **not** change the displayed V64, because the request went to the *other Worker*.

### Verified evidence

- GitHub `CryptoArenaFun/WebSite`, `main`, `public/test1/index.html` contained `CHART LAB · V68`, not V64.
- Main Worker `cryptoarenawebsite` latest deployed version **89**, version ID `030a376d-ae18-470a-9134-c4719ee8637e`, deployment ID `9cc4a8e7-a0a1-43b3-aaa2-46507c836bd3`, 100% traffic, deployed `2026-10-30T05:33:13Z`.
- Separate Worker `cryptoarena-test1` had its own API-uploaded version history, latest version **23**, version ID `cd27f818-0aca-43af-b0b0-ce8af7f33989`, uploaded `2026-10-30T05:03:23Z`.
- Conflicting route ID **`2078bfb17ce943b992557db90ad05855`** had pattern `cryptoarena.fun/test1*` and script `cryptoarena-test1`.
- After removing this route, the routes list was empty, while the main Worker still showed 100% deployment traffic.
- The user subsequently reported that the website **appeared fixed**. No independent live browser content assertion was made.

## Fix applied (2026-10-30)

Cloudflare API:
```http
DELETE /zones/18e426819fdebe905c5ff401075f5bc8/workers/routes/2078bfb17ce943b992557db90ad05855
```
Response: HTTP 200, `success: true`.

Verification:
```http
GET /zones/18e426819fdebe905c5ff401075f5bc8/workers/routes
GET /accounts/9f61ad29daa80f91525deb7afeaace86/workers/domains
GET /accounts/9f61ad29daa80f91525deb7afeaace86/workers/scripts/cryptoarenawebsite/deployments
```
Results: routes `[]`; custom domain `cryptoarena.fun` still assigned to `cryptoarenawebsite`; latest production version receives 100%.

**Do not recreate `cryptoarena.fun/test1*` → `cryptoarena-test1`.** The main Worker already serves the test page from its static assets.

## Architecture / deployment

- GitHub repo: `CryptoArenaFun/WebSite`; branch: `main`
- Test page source: `public/test1/index.html`
- Public URL: `https://cryptoarena.fun/test1/`
- Worker: `cryptoarenawebsite`
- Worker static assets: `./dist`; Vite copies `public/test1/index.html` to `dist/test1/index.html`
- `wrangler.jsonc`:
```json
{
  "name": "cryptoarenawebsite",
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```
- Build command: `npm run build` (TypeScript + Vite)
- Deploy command: `npx wrangler deploy`
- GitHub-connected Cloudflare Workers Builds is **already configured**, with auto-build enabled. Do not claim it is missing without inspecting the API with the **script tag**, not script name.
- Cloudflare account ID: `9f61ad29daa80f91525deb7afeaace86`
- Zone ID: `18e426819fdebe905c5ff401075f5bc8`
- Worker script tag for Builds API: `89e70766dda94f54915f50ea0c771b0d`
- Build trigger ID: `91edee1f-56b8-4815-940f-b082a3ce263f`

## Runbook: when GitHub shows new version but live site shows old version

1. **Confirm source.** Read `public/test1/index.html` on `main` and check the visible version marker.
2. **Confirm build/deployment.** Inspect Cloudflare Workers Builds status/logs, then `GET /accounts/{account_id}/workers/scripts/cryptoarenawebsite/deployments`; ensure the expected version is at 100%.
3. **Check routing before cache.** Query:
   ```http
   GET /zones/{zone_id}/workers/routes
   GET /accounts/{account_id}/workers/domains
   ```
   Look for route patterns such as `cryptoarena.fun/test1*` pointing to an unexpected Worker. These override the intended custom-domain handling for matching paths.
4. **If a conflicting route exists, identify ownership and remove only the confirmed obsolete route.** Use its actual current route ID:
   ```http
   DELETE /zones/{zone_id}/workers/routes/{route_id}
   ```
   Do **not** delete the production Worker, its custom domain, DNS, or unrelated routes.
5. **Verify again.** Re-fetch routes, domains, deployment status, and the page in a fresh browser. Check the displayed version marker and functionality.
6. **Only if routing is correct**, investigate stale assets, service workers, SPA fallback, CDN/browser cache, or the build output. Do not use repeated redeploys/cache purges as substitutes for routing diagnosis.

### Manual rebuild (only when actually needed)

```http
POST /accounts/{account_id}/builds/triggers/91edee1f-56b8-4815-940f-b082a3ce263f/builds
Content-Type: application/json

{"branch":"main"}
```
Then poll `GET /accounts/{account_id}/builds/builds/{build_uuid}` and read `GET /accounts/{account_id}/builds/builds/{build_uuid}/logs`. Build success is **not proof** that the public URL routes to the intended Worker.

## Prevention

- Treat `cryptoarenawebsite` as the sole serving Worker for `cryptoarena.fun` unless a deliberate documented exception is approved.
- Audit Worker routes after adding test pages or temporary Workers.
- Prefer test pages as static assets under `public/`, not as competing Workers on the same hostname/path.
- Include route/domain checks in any future “deployed but old version still visible” investigation.
- Avoid changing the main chart, deleting unrelated resources, or purging caches indiscriminately.
