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
  const tangent = (left: XY, mid: XY, right: XY) => {
    const dl = mid.x - left.x, dr = right.x - mid.x;
    if (dl <= 0) return dr > 0 ? (right.y - mid.y) / dr * tension * 2 : 0;
    if (dr <= 0) return (mid.y - left.y) / dl * tension * 2;
    const l = (mid.y - left.y) / dl, r = (right.y - mid.y) / dr;
    if (l * r <= 0) return 0;
    const centered = (right.y - left.y) / (right.x - left.x) * tension * 2;
    return Math.sign(centered) * Math.min(Math.abs(centered), 1.5 * Math.abs(l), 1.5 * Math.abs(r));
  };
  const dx = (b.x - a.x) / 3;
  // Shared tangents keep joins C1-continuous, including entry/exit from constant prices.
  return { c1x: a.x + dx, c1y: a.y + tangent(before, a, b) * dx,
    c2x: b.x - dx, c2y: b.y - tangent(a, b, after) * dx };

}
export function appendKeyframe(points: Point[], point: Point) {
  const last = points[points.length - 1];
  if (!last || (point.time > last.time && Math.abs(point.value - last.value) > 0.00001)) points.push(point);
}
