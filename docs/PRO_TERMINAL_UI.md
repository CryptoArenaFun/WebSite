# CryptoArena professional terminal — UI v2

## Intent
Implement the approved high-density dark terminal layout with mobile-specific composition, recognizable cryptocurrency icons, interactive TradingView Lightweight Charts, live market trades and verified-only protocol placeholders.

## Data provenance
- Binance public Spot REST: BTC/ETH/BNB 1-second OHLCV candles and 24h ticker.
- Binance public Spot WebSocket: `@kline_1s`, `@ticker`, `@trade` for each pair.
- Recent trade Buy/Sell labels follow Binance's buyer-is-maker (`m`) field; these are **exchange spot trades**, not CryptoArena bets.
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
3. Verify logo images and fallback, selection for each pair, live price/ticker, trade events and chart crosshair/drag/pinch.
4. Check no horizontal page overflow, readable chart price scale, sensible tap targets, no clipped headings.
5. Disconnect network and reconnect: feed indicator must not claim live for stale values.
6. Verify chart data and trades are real public exchange data; no fictional protocol activity.
7. Confirm Cloudflare build success and live HTTP response before considering deployment complete.

## Engineering follow-ups
- Commit package lockfile and change CI to `npm ci`.
- Move exchange fan-out to a monitored edge relay for regions where Binance is inaccessible.
- Add Playwright mobile visual regression tests and uptime monitoring.
- Add authoritative round lifecycle and audited smart contracts as a separate project before enabling transactions.
