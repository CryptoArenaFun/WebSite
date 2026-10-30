# CryptoArena professional terminal — UI v2

## Intent
Implement the approved high-density dark terminal layout with mobile-specific composition, recognizable cryptocurrency icons, interactive TradingView Lightweight Charts, verified-only protocol placeholders.

## Data provenance
- Binance public Spot REST: BTC/ETH/BNB 1-second OHLCV candles and 24h ticker.
- Binance public Spot WebSocket: `@kline_1s`, `@ticker` for each pair.
- Trust Wallet community asset repository supplies BTC, ETH and BNB logos by HTTPS; offline fallback glyphs are provided. Verify licensing and exact chain-brand presentation before any marketing use.
- Chart: TradingView Lightweight Charts 5.x. Preserve its required attribution in production according to its license.

## UX states
- Live requires connected WebSocket, a current ticker and an update within 5 seconds.
- When disconnected, prices may remain visible as historical but are explicitly marked stale.
- When a feed is blocked, no fabricated prices, candles, pools, payouts, players or historical rounds are substituted.
- Prediction buttons, wallet, stake amount and all financial actions are disabled pending verified contracts, authoritative settlement feed and security/legal review.
- Five-minute countdown is the next UTC wall-clock boundary, **not** an actual game round.

## Verification checklist
1. Run `npm run check` (lint, TypeScript, production build).
2. Test Android Chrome at 320/360/390/430 CSS pixels, iOS Safari, tablet 768px and desktop 1280/1440px.
3. Verify logo images and fallback, selection for each pair, live price/ticker, candle updates and chart crosshair/drag/pinch.
4. Check no horizontal page overflow, readable chart price scale, sensible tap targets, no clipped headings.
5. Disconnect network and reconnect: feed indicator must not claim live for stale values.
6. Verify chart data and trades are real public exchange data; no fictional protocol activity.
7. Confirm Cloudflare build success and live HTTP response before considering deployment complete.

## Engineering follow-ups
- Commit package lockfile and change CI to `npm ci`.
- Move exchange fan-out to a monitored edge relay for regions where Binance is inaccessible.
- Add Playwright mobile visual regression tests and uptime monitoring.
- Add authoritative round lifecycle and audited smart contracts as a separate project before enabling transactions.

## Candle-first revision
- Removed Binance `@trade` subscription, trade event parsing, trade state and the Live Trades panel at product request.
- Preserved real 1-second OHLCV candles, candlestick/line toggle, volume histogram, historical candle table and live/stale status.
- Expanded chart vertical space, including mobile, and rebalanced the lower panels.
- No trade tape or simulated trades should appear in the interface.
