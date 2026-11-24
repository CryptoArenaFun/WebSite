// Coordinates are CSS pixels in the layout viewport, not screen pixels.
export function amountViewportFit(top: number, bottom: number, visibleTop: number, visibleBottom: number, scrollY: number, maxScroll: number, gap = 8) {
  const lower = visibleTop + gap;
  const upper = Math.max(lower, visibleBottom - gap);
  const fits = bottom - top <= upper - lower + 0.5;
  // If the whole region cannot fit, show its start and allow normal scrolling.
  const delta = !fits ? top - lower : bottom > upper ? bottom - upper : top < lower ? top - lower : 0;
  const target = Math.max(0, scrollY + delta);
  return { fits, target, extra: Math.max(0, Math.ceil(target - maxScroll + (target > maxScroll ? 2 : 0))) };
}
