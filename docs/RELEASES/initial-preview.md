# Initial preview release — 2026-10-30

Source: main commit `1ea734eb82dbbc111ea83d3910926c7560dc56d8`.

Cloudflare Worker: `cryptoarenawebsite`.
Build ID: `33af7ca6-3496-449f-9ee3-b5736c02eef4`.
Deployed Worker version: `407e478c-b8da-41aa-bcf7-639aa45e1c26`.

Checks: PR #1 and PR #2 CI succeeded; Cloudflare build and deploy succeeded. Cloudflare API confirms custom domain `cryptoarena.fun` is attached and enabled. The public `workers.dev` endpoint is also enabled. Cloudflare created a proxied apex DNS record; existing MX/TXT records remain.

External HTTP smoke test is not verified because the available web fetch could not reach the URL. Confirm the home page and JS/CSS assets from a browser before treating end-to-end availability as verified.

Known follow-up: commit dependency lockfile, switch to `npm ci`, pin Wrangler, add uptime smoke test, configure branch protection and monitor production.

Rollback: restore previous deployment using Cloudflare Workers Deployments. No real-money functionality is enabled.
