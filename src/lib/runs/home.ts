import "server-only";
import { createHash } from "node:crypto";
import { HOME_HIDE_M } from "@/config/map";
import { haversine } from "@/lib/gpx/geo";

/** Whether a point is inside the Home area. */
export function isNearHome(
  home: { lat: number; lng: number },
  point: { lat: number; lng: number },
): boolean {
  return haversine(home.lat, home.lng, point.lat, point.lng) <= HOME_HIDE_M;
}

/**
 * The centre of the area shown for a run near Home: the real point moved up to 300 m in a fixed
 * direction taken from the run id. The shown circle (radius HOME_HIDE_M) always holds the real
 * start, and the same run always shows in the same place, so asking again reveals nothing more.
 */
export function blurPoint(
  runId: string,
  point: { lat: number; lng: number },
): { lat: number; lng: number } {
  const h = createHash("sha256").update(`area:${runId}`).digest();
  const angle = (h.readUInt16BE(0) / 65535) * 2 * Math.PI;
  const metres = 100 + (h.readUInt16BE(2) / 65535) * 200;
  const dLat = (metres * Math.cos(angle)) / 111_320;
  const dLng =
    (metres * Math.sin(angle)) / (111_320 * Math.max(0.2, Math.cos((point.lat * Math.PI) / 180)));
  return { lat: point.lat + dLat, lng: point.lng + dLng };
}
