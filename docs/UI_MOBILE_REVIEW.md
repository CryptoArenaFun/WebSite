# Mobile Arena UI review

## Reported defects
- Cryptocurrency selectors clipped and compressed on narrow phones.
- Excessively tall header pushed the live chart below the fold.
- Coin icons were arbitrary glyphs rather than recognizable marks.
- Chart controls and numeric labels were difficult to read.

## Implemented changes
- Mobile-specific horizontal, scroll-snap asset selector with explicit item widths and no viewport overflow.
- Compact market header with price and pair on the first row, five-minute UTC boundary timer on the second.
- Self-contained vector icons for BTC, ETH and BNB; no font-glyph dependence or third-party image fetch.
- More legible chart axis labels, a wider price-label region and responsive chart height.
- Compact chart controls and prediction panel; accessible button labels and disabled trading remain unchanged.
- Existing desktop layout is preserved.

## Acceptance checks
1. View at 320, 360, 390, 430, 768, 1024 and 1440 CSS pixels.
2. No horizontal page scrolling; market selector scrolls independently and all three assets are selectable.
3. BTC/ETH/BNB icons are consistently sized, readable and not clipped.
4. Current price, 24h change, countdown and chart are visible without oversized blank regions.
5. Line/candle switch works; chart price axis and live/stale indicators remain legible.
6. Verify external Binance feed and disconnected states; do not fabricate any financial figures.
7. Check reduced-motion, touch targets, Android Chrome and desktop browsers.

## Known limitations
- Chart is a custom SVG renderer, not TradingView Lightweight Charts. It does not yet support pinch zoom, crosshair, drag pan or tooltip. This refinement fixes presentation without adding dependency or introducing a separate chart rewrite. Dedicated chart-library integration should be reviewed and tested separately.
- Exchange market data remains informational and cannot determine outcomes of financial rounds.
