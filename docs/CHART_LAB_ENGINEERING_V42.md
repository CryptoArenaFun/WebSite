# CryptoArena Chart Lab — Engineering Documentation v42

**Scope:** standalone BTC/USDT experiment at `public/test1/index.html`, URL https://cryptoarena.fun/test1/. Do not alter the main website.

## Architecture
- Source: `CryptoArenaFun/WebSite` branch `main`, standalone HTML/CSS/JS, TradingView Lightweight Charts v5.
- Main application: React 19, Vite 6, TypeScript. The chart experiment does not use the React app.
- Root Cloudflare Worker: `cryptoarenawebsite` on the custom domain `cryptoarena.fun`.
- Chart-only Worker: `cryptoarena-test1`, Cloudflare route `cryptoarena.fun/test1*`.
- The chart Worker embeds a snapshot of the HTML in its script. **A GitHub commit does not automatically deploy it.** Existing root static assets are untouched.
- Routing: `/test1` → 308 redirect to `/test1/`; `/test1/` and `/test1/index.html` → HTML; other intercepted paths → 404. The wildcard also matches `/test123` (known caveat).

## UI layout
Top brand and experiment version, intro, connection status above BTC/USDT identity, fixed-width top price and 24h change, 1S/1M/5M/15M/1H selectors, Smooth/Candles toggle, chart, custom live price label, trade bubbles, and three current-candle stats. Dark background, green upward movement, pink downward movement, neutral gray at exactly zero. Mobile breakpoint 650px; chartbox 370px desktop / 310px mobile. Chart canvas is offset 28px below the title strip. Quote width 170px desktop / 144px mobile, one natural text run with tabular numerals; do not split price into separate digit spans.

## Data flow
1. Historical OHLC: `GET https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=<period>&limit=120`. Parse timestamp in seconds, OHLC numeric fields. Use `cache: no-store`; reject stale responses with incrementing request ID.
2. Live trades: `wss://data-stream.binance.vision:443/ws/btcusdt@trade`; parse trade price `p` and timestamp `T`. Bucket by selected interval (1/60/300/900/3600 seconds), create/update last candle, retain at most 180 bars in memory.
3. 24h change: `GET https://data-api.binance.vision/api/v3/ticker/24hr?symbol=BTCUSDT`; fetched **once** on startup.
4. Latest actual price is `visualTarget`; smoothed animation price is `visualPrice`. UI number updates approximately every 400ms, chart animation approximately every 32ms.

## Chart engine
`build()` creates chart and series. `render(fit)` applies `setData`. `animatePrice()` uses requestAnimationFrame, with exponential interpolation `alpha=1-exp(-elapsed/185)`. `refreshAreaColor()` compares price against the current candle open. The correct candle mode key is **`'candle'`**, not `'candles'` (a past regression). Smooth series is 2px; live price line 1px. Candles use explicit outlines and bright wicks. Built-in last-value label disabled.

### Responsive candles (v42)
```js
function candleWindowSize() {
 const width = document.getElementById('chart').getBoundingClientRect().width;
 const usable = Math.max(160, width - 82);
 const target = width < 650 ? (period === '1s' ? 15 : 17) : 14;
 const count = Math.floor(usable / target);
 return Math.max(12, Math.min(65, width < 650 ? count : Math.floor(count * 2 / 3)));
}
```
Only the most recent `candleWindowSize()` bars are passed to the candle series, intentionally widening desktop candles to ~1.5x the previous width. Mobile sizing unchanged. Trade-off: older bars cannot be panned to in candle mode.

### Price tag and stats
Custom right-edge marker: fixed 82px width, `series.priceToCoordinate(visualPrice)+28` pixels from chartbox top; `toFixed(2)`; direction relative to current candle open. Stats: `CANDLE OPEN = lastBar.open`; `LIVE PRICE = actual latest trade`; `CHANGE VS OPEN = (actual-open)/open*100`. Exact equality gives `0%` in gray `#b7c3d3`. Adaptive percentage decimals avoid displaying false zero for very small nonzero changes.

### Tick bubbles
Separate IIFE listens to `arena:tick` custom events (trade delta >= $0.005). Aggregates pending deltas. Spawn interval 1000ms, maximum four active, lifetime 6500ms, peak opacity 80%, upward motion, pointer-events disabled. Oldest bubble fades out when over capacity.

## Lifecycle and error handling
WebSocket reconnects with capped exponential delay (roughly 1/2/4/8/16/20s); status messages include Connecting, Live, Reconnecting, and stale feed. If no trade for >12s, stale status is shown. Historical fetch errors appear in notice. Closing page closes socket. Returning to visible tab reconnects if socket closed.

## Engineering chronology
- v09: stable visual baseline.
- v10: invalid JS from fixed-digit experiment; blank chart; recovered in v11.
- v11–14: top-price stability; v14 natural text run, tabular figures, fixed right-aligned box.
- v16–18: bubbles and candle-relative colors; startup initialization repair.
- v19–24: current-candle stats, interval label, bubble tuning, 1px price line, sharper candle borders.
- v25–30: candle zoom investigation; root cause was `mode==='candles'` vs actual `'candle'`; corrected v30.
- v31–33: 7px status dot, 2px smooth line, bubble max four, 28px chart-title strip.
- v34–35: fixed 82px live-price marker; centered stats.
- v36–41: adaptive percent precision, moved status into panel and left-aligned, neutral exact zero.
- v42: desktop candle count reduced to two-thirds; mobile unchanged.

## Safe release procedure
1. Read the exact current `public/test1/index.html`, save blob SHA and prior source.
2. Change only the chart file, keep main app and root Worker untouched.
3. Syntax-check both inline JS blocks with `node --check`; check all DOM IDs and test desktop/mobile.
4. Commit to GitHub. **Then separately update the existing `cryptoarena-test1` Worker** with the latest HTML serialized as a JS string using `JSON.stringify(html)` in a classic `addEventListener('fetch', ...)` handler. Use `Content-Type: application/javascript` for classic scripts.
5. Verify route still targets `cryptoarena-test1`, root custom domain still targets `cryptoarenawebsite`. Do not overwrite the root Worker or deploy a partial static asset manifest.
6. Smoke test `/`, `/test1`, `/test1/`, Smooth/Candles across all intervals, real-time status, 24h metric, mobile layout, price tag, bubbles, reconnect. Record commit, deployed version, and rollback target.
7. If regression occurs, restore prior **chart** Worker version only.

## Known risks
- GitHub-to-Worker deployment is manual and can drift.
- REST history and WebSocket stream are not atomically reconciled during interval changes.
- Open-but-silent sockets are marked stale but not necessarily restarted.
- 24h change only refreshes on reload.
- External Binance/CDN/font/icon dependencies may fail.
- Candle mode intentionally truncates visible history.
- Three stats may overflow extremely narrow screens.
- Reduced-motion accessibility is incomplete.
- Route wildcard can intercept other `test1...` paths.
- Cloudflare API success alone is not proof of successful browser rendering.

**Verification:** This document is based on the current v42 HTML, observed Cloudflare configuration, and development history. It is not a market-data audit or an end-to-end browser-test report.
