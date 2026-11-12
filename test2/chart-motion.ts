export type Point = { time: number; value: number };
export type ChartView = "round" | "detail";
export type XY = { x: number; y: number };
export const KEYFRAME_MS = 650;
export const ema = (previous: number, raw: number) => previous + 0.25 * (raw - previous);
export const blend = (factor: number, elapsed: number) => 1 - (1 - factor) ** (Math.min(100, Math.max(0, elapsed)) / (1000 / 60));
export function viewport(start: number, now: number, mode: ChartView = "detail") {
  const end = Math.min(start + 900, Math.max(start + 0.001, now));
  return { begin: mode === "round" ? start : Math.max(start, end - 10), end };
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
  if (!last || point.time > last.time) points.push(point);
}

// Fit only the visible curve, not offscreen extrema or the round target.
export function detailRange(points: Point[], begin: number, tip: number, raw: number, end = begin + 10) {
  let low = Math.min(tip, raw), high = Math.max(tip, raw);
  const curve = [...points.filter(p => p.time < end), { time: end, value: tip }];
  const first = curve.findIndex(p => p.time >= begin);
  for (let i = Math.max(0, first); i < curve.length; i++) {
    low = Math.min(low, curve[i].value); high = Math.max(high, curve[i].value);
  }
  if (first > 0 && curve[first].time > begin) {
    const i = first - 1;
    const neighborhood = curve.slice(Math.max(0, i - 1), Math.min(curve.length, i + 3)).map(p => ({ x: p.time, y: p.value }));
    const index = i > 0 ? 1 : 0;
    const a = neighborhood[index], b = neighborhood[index + 1], c = controls(neighborhood, index);
    const t = (begin - a.x) / (b.x - a.x), u = 1 - t;
    const boundary = u*u*u*a.y + 3*u*u*t*c.c1y + 3*u*t*t*c.c2y + t*t*t*b.y;
    low = Math.min(low, boundary); high = Math.max(high, boundary);
  }
  return paddedRange(low, high);
}
export function visiblePoints(points: Point[], begin: number, end: number) {
  let first = points.findIndex(point => point.time >= begin);
  if (first < 0) first = points.length;
  return points.slice(Math.max(0, first - 2)).filter(point => point.time < end);
}

export type TickGrid = { step: number; values: number[] };
export function stableDetailTicks(min: number, max: number, previous?: TickGrid): TickGrid {
  const span = max - min;
  const lower = min + span * 0.1, upper = max - span * 0.1;
  if (previous) {
    const visible = previous.values.filter(value => value >= lower && value <= upper).length;
    // Keep exact labels while useful; hysteresis prevents small zoom changes churning digits.
    if (visible >= 2 && span >= previous.step * 2 && span <= previous.step * 8) return previous;
  }
  const ideal = Math.max(0.01, span / 5);
  const power = 10 ** Math.floor(Math.log10(ideal));
  const step = Math.max(0.01, ([1, 2, 5, 10].find(n => n * power >= ideal) ?? 10) * power);
  const first = Math.floor(upper / step + 1e-8) * step;
  return { step, values: Array.from({ length: 4 }, (_, i) => Math.round((first - i * step) * 100) / 100) };
}

// Preserve reversals between regular keyframes; never rewrite a committed sample.
export function recordMotion(points: Point[], previous: Point | undefined, point: Point, direction: number) {
  const nextDirection = previous ? Math.sign(point.value - previous.value) : 0;
  if (previous && direction && nextDirection && direction !== nextDirection) appendKeyframe(points, previous);
  const last = points.at(-1);
  if (!last || (point.time - last.time) * 1000 >= KEYFRAME_MS) appendKeyframe(points, point);
  return nextDirection || direction;
}
