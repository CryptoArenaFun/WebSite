// Display-only geometry. Exchange prices, round open and OHLC are never interpolated here.
export function viewport(start: number, now: number) {
  const end = Math.min(start + 900, Math.max(start + 0.1, now));
  const begin = Math.max(start, end - 60);
  const logicalEnd = (end - start) * 10;
  return { begin, end, from: (begin - start) * 10 - 0.5, to: logicalEnd - 0.5, tailSlot: Math.ceil(logicalEnd) };
}

export function frameBlend(elapsed: number) {
  return 1 - Math.pow(1 - 0.22, Math.min(100, Math.max(0, elapsed)) / (1000 / 60));
}
