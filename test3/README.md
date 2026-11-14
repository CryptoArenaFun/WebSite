# CryptoArena Version 7 preview

- URL: `/test3/` (both sides funded by default); awaiting design state: `/test3/?pool=awaiting`.
- Figma source: file `p0tQ1WIPr3kUQDBX6Q1srh`, page `261:16`, awaiting frame `261:18`, funded panel `261:290`.
- Original 864 × 2411 artboard proportions scale to narrower viewports; content stays centered at larger widths.
- Static SVGs are exported Figma assets under `public/test3-assets`. Chart history and price geometry are live, not screenshot assets.
- The chart imports `startLiveChart`, `ChartView`, and `RollingPrice` directly from `test2`. No copy of the data engine is maintained. It retains REST round-open/history loading, Binance aggTrade WebSocket updates, reconnect/watchdog, smooth rendering, round rollover and ten-second detail switching.
- Balance and pools are fixtures. Presets, amount validation, direction selection, fee accordion and help/wallet-preview dialogs work locally. Wallet connection and transactions are deliberately not implemented by this design preview.
- The 5% preview fee and 15-minute interval match Version 7 and `/test2`; they do not change a smart-contract configuration or define final production economics.
- Entry countdown follows the next round's boundary. No separate contract entry cutoff is configured in this preview.
- Checks: `npm run check` (lint, 29 tests, TypeScript and Vite build). Live browser verification includes asset loading, geometry, changing amount/direction, accordion, funded fixture and chart switching.
