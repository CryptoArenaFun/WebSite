export type Point = { time: number; value: number };
export type XY = { x: number; y: number };
export const KEYFRAME_MS = 650;
export const ema = (previous: number, raw: number) => previous + 0.25 * (raw - previous);
export const blend = (factor: number, elapsed: number) => 1 - (1 - factor) ** (Math.min(100, Math.max(0, elapsed)) / (1000 / 60));
export function viewport(start: number, now: number) {
  const end = Math.min(start + 900, Math.max(start + 0.001, now));
  return { begin: Math.max(start, end - 60), end };
}
export function paddedRange(low: number, high: number) {
  const padding = Math.max(0.01, (high - low) * 0.15);
  return { min: low - padding, max: high + padding };
}
export function controls(points: XY[], index: number, tension = 0.45) {
  const a = points[index], b = points[index + 1];
  const before = points[Math.max(0, index - 1)], after = points[Math.min(points.length - 1, index + 2)];
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  // Bounded Catmull-Rom controls: retain rounded joins without drawing false extremes.
  return {
    c1x: clamp(a.x + (b.x - before.x) * tension / 3, a.x, b.x),
    c1y: clamp(a.y + (b.y - before.y) * tension / 3, minY, maxY),
    c2x: clamp(b.x - (after.x - a.x) * tension / 3, a.x, b.x),
    c2y: clamp(b.y - (after.y - a.y) * tension / 3, minY, maxY),
  };
}
export function appendKeyframe(points: Point[], point: Point) {
  const last = points[points.length - 1];
  if (!last || (point.time > last.time && Math.abs(point.value - last.value) > 0.00001)) points.push(point);
}
