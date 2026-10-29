# Live market data — preview architecture

## Scope
Read-only Binance Spot BTCUSDT, ETHUSDT and BNBUSDT price dashboard. No bets, pools, on-chain state, settlement price or wallet transactions are connected.

## Data flow
1. Browser bootstraps the most recent 180 one-second candles via `https://data-api.binance.vision/api/v3/klines`.
2. Browser bootstraps 24-hour ticker statistics via `/ticker/24hr`.
3. Browser subscribes to `wss://data-stream.binance.vision:443/stream` for each pair's `@kline_1s` and `@ticker` streams.
4. A bounded in-memory buffer of 180 candles feeds the SVG candlestick/line chart; market statistics are refreshed by stream events.

## Reliability and limitations
- Connection reconnects with capped exponential backoff and jitter; socket is closed and requests aborted on unmount.
- A feed is considered live only if the socket is connected and the last message is less than five seconds old. Otherwise UI shows stale/reconnecting.
- REST or WebSocket can be blocked by geographic restrictions, browser networks, ad blockers or provider outages. UI must never fabricate values or silently replace stale prices with simulations.
- Chart timestamps are displayed in UTC; the five-minute timer is only the next UTC wall-clock boundary, **not** a live game round or price target.
- Binance spot data is informational; it is **not** an approved settlement oracle. Before financial functionality, design an independent authoritative feed, signed round lifecycle, monitoring, recovery and external audit.
- Data feed is accessed directly from each browser, not yet through a central relay. For high user counts or reliability across jurisdictions, use an independently monitored server-side fan-out service.

## Test checklist
- Select BTC/ETH/BNB and verify each pair updates independently.
- Toggle line/candlestick modes and resize to mobile viewport.
- Disconnect network: status must change to stale; reconnect: feed must recover.
- If Binance is blocked: show unavailable without fabricated prices.
- Check the 5-minute UTC boundary and absence of fake pools, participants and payouts.
- Run lint and TypeScript/Vite build before merge.

## Security
Treat all exchange events as untrusted display data. The UI cannot settle markets, place orders or compute payouts. No API credentials are needed for these public endpoints.
