import { haversine } from "./geo";

type LonLat = readonly [number, number];

/** Metres from point p to the segment a-b, on a local flat projection (fine at route scale). */
function distanceToSegment(p: LonLat, a: LonLat, b: LonLat): number {
  const midLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat) * 111_320;
  const ky = 110_540;
  const ax = a[0] * kx;
  const ay = a[1] * ky;
  const bx = b[0] * kx - ax;
  const by = b[1] * ky - ay;
  const px = p[0] * kx - ax;
  const py = p[1] * ky - ay;

  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Douglas-Peucker, iterative so very long tracks cannot overflow the call stack. */
export function simplify(points: readonly LonLat[], toleranceM: number): [number, number][] {
  const n = points.length;
  if (n <= 2) return points.map(([x, y]) => [x, y]);

  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];

  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegment(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > toleranceM) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push([points[i][0], points[i][1]]);
  return out;
}

/** Simplifies with a growing tolerance until the line has at most `maxPoints` points. */
export function simplifyToLimit(
  points: readonly LonLat[],
  startToleranceM: number,
  maxPoints: number,
): [number, number][] {
  let tolerance = startToleranceM;
  let line = simplify(points, tolerance);
  while (line.length > maxPoints) {
    tolerance *= 1.6;
    line = simplify(points, tolerance);
  }
  return line;
}

/** Distance in metres between two [lon, lat] points. */
export const between = (a: LonLat, b: LonLat) => haversine(a[1], a[0], b[1], b[0]);
