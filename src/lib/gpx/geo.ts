const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two lat/lon pairs. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Length in metres of a [lon, lat] polyline. */
export function lineLength(line: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (let i = 1; i < line.length; i++) {
    total += haversine(line[i - 1][1], line[i - 1][0], line[i][1], line[i][0]);
  }
  return total;
}

/**
 * Removes `meters` from both ends of a [lon, lat] polyline, cutting inside a segment where needed.
 * Returns an empty line when the route is too short to keep anything (under twice the trim).
 * Used for the "hide the first and last 200 m" home-privacy option.
 */
export function trimLineEnds(
  line: readonly (readonly [number, number])[],
  meters: number,
): [number, number][] {
  if (meters <= 0) return line.map(([x, y]) => [x, y]);
  const total = lineLength(line);
  if (line.length < 2 || total <= 2 * meters) return [];
  return sliceLine(line, meters, total - meters);
}

/** The part of the line between two distances (metres) from its start. */
function sliceLine(
  line: readonly (readonly [number, number])[],
  from: number,
  to: number,
): [number, number][] {
  const out: [number, number][] = [];
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    const seg = haversine(y0, x0, y1, x1);
    const start = walked;
    const end = walked + seg;
    walked = end;
    if (seg === 0 || end <= from || start >= to) continue;

    const at = (d: number): [number, number] => {
      const t = (d - start) / seg;
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    };
    if (out.length === 0) out.push(start >= from ? [x0, y0] : at(from));
    out.push(end <= to ? [x1, y1] : at(to));
  }
  return out;
}
