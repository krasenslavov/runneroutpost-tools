import { LIMITS } from "@/config/limits";
import { lineLength, trimLineEnds } from "@/lib/gpx/geo";

export type RouteInput = {
  source: "drawn" | "gpx";
  hideEnds: boolean;
  points: [number, number][];
};

/** Metres. Points closer than this to the one before are dropped as noise. */
const MIN_STEP_M = 1;

/**
 * The line the server stores, or null when the input cannot become a usable route.
 * Coordinates are rounded to about 1 m, doubled points are dropped, a route over the length cap is
 * refused, and when the owner chose it the first and last 200 m are cut off here, on the server,
 * whatever the browser sent.
 */
export function prepareRoute(input: RouteInput): [number, number][] | null {
  const rounded = input.points.map(([x, y]): [number, number] => [
    Math.round(x * 1e5) / 1e5,
    Math.round(y * 1e5) / 1e5,
  ]);
  const line = rounded.filter((p, i) => {
    if (i === 0) return true;
    const prev = rounded[i - 1];
    return lineLength([prev, p]) >= MIN_STEP_M;
  });
  if (line.length < 2) return null;
  if (lineLength(line) > LIMITS.route.maxKm * 1000) return null;
  const out = input.hideEnds ? trimLineEnds(line, LIMITS.route.hideEndsM) : line;
  return out.length >= 2 ? out : null;
}

/** PostGIS text for a [lon, lat] line. Only numbers reach it, since the input was validated. */
export function toWkt(line: readonly (readonly [number, number])[]): string {
  return `SRID=4326;LINESTRING(${line.map(([x, y]) => `${x} ${y}`).join(",")})`;
}
