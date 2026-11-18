import { LIMITS } from "@/config/limits";
import { lineLength } from "./geo";
import { parseGpx } from "./parse";
import { simplifyToLimit } from "./simplify";

/**
 * Turns GPX text into the line the app keeps: [lon, lat] pairs only, thinned to the point cap.
 * Time and elevation are read by the parser but never leave this function, so they cannot be
 * stored. Throws a GpxError for a file that is not usable.
 */
export function routeFromGpx(xml: string): [number, number][] {
  const points = parseGpx(xml).map((p): [number, number] => [p.lon, p.lat]);
  return simplifyToLimit(points, LIMITS.route.simplifyToleranceM, LIMITS.route.maxPoints);
}

/** Length of a [lon, lat] line in kilometres. */
export function routeKm(line: readonly (readonly [number, number])[]): number {
  return lineLength(line) / 1000;
}
