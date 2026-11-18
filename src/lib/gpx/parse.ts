import { XMLParser } from "fast-xml-parser";
import { GpxError, type TrackPoint } from "./types";

/** Larger than any real race file (a 24 h ultra at 1 Hz is about 15 MB). */
export const MAX_GPX_BYTES = 25 * 1024 * 1024;

// fast-xml-parser works in web workers, where DOMParser does not exist.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false,
  isArray: (name) => ["trk", "trkseg", "trkpt", "rte", "rtept"].includes(name),
});

type RawPoint = { "@_lat"?: string; "@_lon"?: string; ele?: unknown; time?: unknown };
type RawGpx = {
  gpx?: {
    trk?: { trkseg?: { trkpt?: RawPoint[] }[] }[];
    rte?: { rtept?: RawPoint[] }[];
  };
};

function toPoint(raw: RawPoint): TrackPoint | null {
  const lat = Number(raw["@_lat"]);
  const lon = Number(raw["@_lon"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const ele = raw.ele === undefined || raw.ele === "" ? NaN : Number(raw.ele);
  const time = typeof raw.time === "string" ? Date.parse(raw.time) : NaN;
  return {
    lat,
    lon,
    ele: Number.isFinite(ele) ? ele : null,
    time: Number.isFinite(time) ? time : null,
  };
}

/** Reads track points from GPX text. Tracks are preferred; a planned route is the fallback. */
export function parseGpx(xml: string): TrackPoint[] {
  if (xml.length > MAX_GPX_BYTES) throw new GpxError("tooLarge");

  let doc: RawGpx;
  try {
    doc = parser.parse(xml) as RawGpx;
  } catch {
    throw new GpxError("invalidXml");
  }
  if (!doc || !("gpx" in doc)) throw new GpxError("invalidXml");
  // An empty <gpx></gpx> parses to an empty string: valid file, nothing in it.
  const gpx = typeof doc.gpx === "object" && doc.gpx !== null ? doc.gpx : {};

  const raw: RawPoint[] = [];
  for (const trk of gpx.trk ?? []) {
    for (const seg of trk.trkseg ?? []) raw.push(...(seg.trkpt ?? []));
  }
  if (raw.length === 0) {
    for (const rte of gpx.rte ?? []) raw.push(...(rte.rtept ?? []));
  }

  const points = raw.map(toPoint).filter((p): p is TrackPoint => p !== null);
  if (points.length === 0) throw new GpxError("noPoints");
  if (points.length < 2) throw new GpxError("tooFewPoints");
  return points;
}
