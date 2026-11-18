import { PACE_MAX_S_KM, PACE_MIN_S_KM } from "@/config/runs";
import { parseCsv, safeCell, toCsv, unsafeCell } from "./csv";
import { groupFileSchema, type GroupFile, type ImportRow } from "./schemas";
import type { Parsed } from "./schedule";

export const RUN_CSV_COLUMNS = [
  "title",
  "place",
  "lat",
  "lng",
  "starts_at",
  "tz",
  "effort",
  "pace_min",
  "pace_max",
  "distance_km",
  "note",
  "repeat_weekly",
  "repeat_until",
] as const;

/** The runs of a group as CSV (routes are only in the JSON file). */
export function runsToCsv(runs: readonly ImportRow[]): string {
  return toCsv([
    [...RUN_CSV_COLUMNS],
    ...runs.map((r) => [
      safeCell(r.title),
      safeCell(r.placeName ?? ""),
      String(r.lat),
      String(r.lng),
      r.startsAt,
      r.tz,
      r.effort,
      r.paceMin === undefined ? "" : String(r.paceMin),
      r.paceMax === undefined ? "" : String(r.paceMax),
      r.distanceKm === undefined ? "" : String(r.distanceKm),
      safeCell(r.note ?? ""),
      r.repeatWeekly ? "true" : "false",
      r.repeatUntil ?? "",
    ]),
  ]);
}

/** True when the CSV header is the runs file written by `runsToCsv`. */
export function isRunsCsv(header: readonly string[]): boolean {
  const h = header.map((c) => c.trim().toLowerCase());
  return h.includes("starts_at") && h.includes("title");
}

/** Reads a runs CSV back into rows. Values are checked with the same schema as every other source. */
export function runsFromCsv(text: string): Parsed[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((c) => c.trim().toLowerCase());
  return rows.slice(1).map((cells, i): Parsed => {
    const get = (name: string) => {
      const idx = header.indexOf(name);
      return idx >= 0 ? unsafeCell((cells[idx] ?? "").trim()) : "";
    };
    const num = (name: string) => (get(name) === "" ? undefined : Number(get(name)));
    const pace = (name: string) => {
      const n = num(name);
      return n !== undefined && n >= PACE_MIN_S_KM && n <= PACE_MAX_S_KM ? n : undefined;
    };
    const lat = num("lat");
    const lng = num("lng");
    return {
      ok: true,
      line: i + 2,
      row: {
        title: get("title"),
        placeName: get("place") || undefined,
        lat: Number.isFinite(lat) ? lat : undefined,
        lng: Number.isFinite(lng) ? lng : undefined,
        startsAt: get("starts_at"),
        tz: get("tz"),
        effort: (get("effort") || "comfortable") as ImportRow["effort"],
        paceMin: pace("pace_min"),
        paceMax: pace("pace_max"),
        distanceKm: num("distance_km"),
        note: get("note") || undefined,
        repeatWeekly: get("repeat_weekly").toLowerCase() === "true",
        repeatUntil: get("repeat_until") || undefined,
      },
    };
  });
}

export type GroupFileCheck =
  { ok: true; file: GroupFile } | { ok: false; error: "notJson" | "notOurs" };

/** Parses and checks an exported group file. Anything unknown in it is refused. */
export function readGroupFile(text: string): GroupFileCheck {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "notJson" };
  }
  const parsed = groupFileSchema.safeParse(json);
  return parsed.success ? { ok: true, file: parsed.data } : { ok: false, error: "notOurs" };
}
