# Current five-minute candle card

The last section of `/test1/` follows the current UTC BTCUSDT five-minute candle independently of the main chart's selected period and candle. Existing chart scripts, bubbles and styles are unchanged.

## Data

- Header change is `(current - open) / open`, for this five-minute candle, not the 24-hour ticker.
- Binance REST `/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=2` supplies initial OHLC, base/quote volume, trade count and taker-buy base volume.
- Combined `btcusdt@kline_5m` and `btcusdt@trade` streams keep the card live.
- Kline snapshots contain cumulative volume and the last included trade ID (`L`). Only contiguous trades after that ID are replayed. REST has no last-trade ID, so trades are not added to REST volume until a stream snapshot establishes the boundary. Duplicate, missing and older events cannot silently inflate volume.
- A trade with buyer-maker flag `m=false` is taker buy; `m=true` is taker sell. Buy percentage uses BTC base volume, not trader counts. With zero volume, percentages are unavailable rather than a fabricated 50/50.
- Body/range is `abs(close-open)/(high-low)`; a flat candle displays 0%.
- The countdown uses Binance server time with monotonic elapsed time. Each boundary clears old candle values until the new current candle arrives. Disconnected data is marked delayed/offline.

## Runtime

Files: `public/test1/five-minute-model.js`, `five-minute.js`, `five-minute.css`. Only new markup and asset references are added to `index.html`. Reconnect uses backoff; REST requests have timeouts and bounded retries. Pending trades are capped at 10,000; a gap waits for the next authoritative kline. The display respects reduced-motion preferences.

## Validation

`npm run check` runs 26 tests plus lint and build. New unit cases cover clock boundaries, REST/stream parsing, taker direction, snapshot replay, duplicate/gap handling, rollover, zero volume and candle geometry. Browser checks covered real Binance data, 320px and 390px mobile and 1440px desktop, wrong device date, independent main-chart period changes, REST 503, reconnect, and transition into a new five-minute candle. Existing bubble script and CSS hashes still pass.
