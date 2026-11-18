import { LIMITS } from "@/config/limits";
import { PACE_MAX_S_KM, PACE_MIN_S_KM, type Effort } from "@/config/runs";
import { zonedParts, zonedToUtc } from "@/lib/runs/occurrence";
import { parseCsv, unsafeCell } from "./csv";
import type { ImportRow } from "./schemas";

/**
 * A row as read from a source, before it has a meeting point. `lat` and `lng` come from the source
 * when it has them (a CSV with coordinates, an .ics GEO line); otherwise the import screen fills in
 * the point chosen for the whole import.
 */
export type DraftRow = Omit<ImportRow, "lat" | "lng"> & { lat?: number; lng?: number };

export type ParseError =
  "weekday" | "time" | "empty" | "tooLong" | "past" | "ended" | "allDay" | "noStart" | "invalid";

export type Parsed =
  | { ok: true; line: number; row: DraftRow }
  | { ok: false; line: number; text: string; error: ParseError };

export type ParseOptions = { tz: string; now: Date };

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  sundays: 0,
  mon: 1,
  monday: 1,
  mondays: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  tuesdays: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  wednesdays: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  thursdays: 4,
  fri: 5,
  friday: 5,
  fridays: 5,
  sat: 6,
  saturday: 6,
  saturdays: 6,
};

export function weekdayNumber(word: string): number | null {
  const n = WEEKDAYS[word.trim().toLowerCase().replace(/[.,]$/, "")];
  return n === undefined ? null : n;
}

/** "18:30", "6pm", "6:30 pm" to minutes since midnight, or null. */
export function clockMinutes(text: string): number | null {
  const m = text
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (min > 59) return null;
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "pm" ? 12 : 0);
  } else if (h > 23) return null;
  return h * 60 + min;
}

/** "5:30" to 330 seconds per km, only inside the range the app offers. */
function paceSeconds(text: string): number | null {
  const m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const s = Number(m[1]) * 60 + Number(m[2]);
  return s >= PACE_MIN_S_KM && s <= PACE_MAX_S_KM && Number(m[2]) < 60 ? s : null;
}

/** The first moment at or after `now` that is this weekday at this time on the clock of `tz`. */
export function nextWeekdayStart(weekday: number, minutes: number, tz: string, now: Date): Date {
  const today = zonedParts(now, tz);
  for (let k = 0; k <= 7; k += 1) {
    const day = new Date(Date.UTC(today.y, today.m - 1, today.d + k));
    if (day.getUTCDay() !== weekday) continue;
    const at = zonedToUtc(
      {
        y: day.getUTCFullYear(),
        m: day.getUTCMonth() + 1,
        d: day.getUTCDate(),
        h: Math.floor(minutes / 60),
        mi: minutes % 60,
      },
      tz,
    );
    if (at.getTime() > now.getTime()) return at;
  }
  // Unreachable: within eight days every weekday has a future occurrence.
  throw new Error("no occurrence");
}

const EFFORT_WORDS: [RegExp, Effort][] = [
  [/\ball[\s-]?out\b/i, "all_out"],
  [/\beasy\b/i, "easy"],
  [/\bcomfortable\b/i, "comfortable"],
  [/\bhard\b/i, "hard"],
];

type Fields = {
  weekday: string;
  time: string;
  title?: string;
  place?: string;
  effort?: string;
  pace?: string;
  distance?: string;
  note?: string;
  until?: string;
};

function effortFrom(text: string | undefined): Effort | undefined {
  if (!text) return undefined;
  for (const [re, e] of EFFORT_WORDS) if (re.test(text)) return e;
  return undefined;
}

function paceFrom(text: string | undefined): { min?: number; max?: number } {
  if (!text) return {};
  const m = text.match(/(\d{1,2}:\d{2})(?:\s*(?:-|–|to)\s*(\d{1,2}:\d{2}))?/);
  if (!m) return {};
  const a = paceSeconds(m[1]);
  const b = m[2] ? paceSeconds(m[2]) : a;
  if (a === null || b === null) return {};
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

function build(f: Fields, line: number, raw: string, o: ParseOptions): Parsed {
  const weekday = weekdayNumber(f.weekday);
  if (weekday === null) return { ok: false, line, text: raw, error: "weekday" };
  const minutes = clockMinutes(f.time);
  if (minutes === null) return { ok: false, line, text: raw, error: "time" };

  const title = (f.title ?? "").trim().slice(0, LIMITS.run.titleMaxLength) || "Group run";
  const place = (f.place ?? "").trim().slice(0, 120) || undefined;
  const km = f.distance ? Number(f.distance.replace(",", ".")) : NaN;
  const pace = paceFrom(f.pace);
  const until = f.until && /^\d{4}-\d{2}-\d{2}$/.test(f.until) ? f.until : undefined;
  const note = (f.note ?? "").trim().slice(0, LIMITS.run.noteMaxLength) || undefined;
  const start = nextWeekdayStart(weekday, minutes, o.tz, o.now);

  return {
    ok: true,
    line,
    row: {
      title,
      placeName: place,
      startsAt: start.toISOString(),
      tz: o.tz,
      effort: effortFrom(f.effort) ?? "comfortable",
      paceMin: pace.min,
      paceMax: pace.max,
      distanceKm: Number.isFinite(km) && km > 0 && km <= 100 ? km : undefined,
      note,
      repeatWeekly: true,
      repeatUntil: until,
    },
  };
}

/**
 * Reads a pasted weekly schedule, one run per line:
 *
 *   Tuesday 18:30 Track intervals @ Stade Pierre hard 4:45-5:15/km 8 km
 *   Sat 8am Long run @ Lake pier easy until 2027-03-31
 *
 * The weekday and the time come first. After them: a title, "@" and a meeting place name, and any of
 * an effort word, a pace range ending in "/km", a distance in km, and "until YYYY-MM-DD". Every
 * line becomes a weekly run, starting on the next such day. Lines it cannot read are returned with
 * the reason, so the preview can show them.
 */
export function parseScheduleText(text: string, o: ParseOptions): Parsed[] {
  if (text.length > LIMITS.import.maxTextChars) {
    return [{ ok: false, line: 1, text: "", error: "tooLong" }];
  }
  const out: Parsed[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^(\S+)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(.*)$/i);
    if (!m) {
      const first = line.split(/\s+/)[0];
      out.push({
        ok: false,
        line: i + 1,
        text: line,
        error: weekdayNumber(first) === null ? "weekday" : "time",
      });
      return;
    }
    let rest = m[3];
    const take = (re: RegExp) => {
      const hit = rest.match(re);
      if (hit) rest = rest.replace(re, " ");
      return hit;
    };
    const until = take(/\buntil\s+(\d{4}-\d{2}-\d{2})\b/i);
    const distance = take(/(\d+(?:[.,]\d+)?)\s*km\b(?!\s*\/)/i);
    const pace = take(/(\d{1,2}:\d{2}(?:\s*(?:-|–|to)\s*\d{1,2}:\d{2})?)\s*\/\s*km\b/i);
    const effortHit = EFFORT_WORDS.map(([re]) => rest.match(re)).find(Boolean);
    const effort = effortHit?.[0];
    if (effortHit) rest = rest.replace(effortHit[0], " ");
    const [title, ...placeParts] = rest.split("@");
    out.push(
      build(
        {
          weekday: m[1],
          time: m[2],
          title: title.replace(/\s+/g, " "),
          place: placeParts.join("@").replace(/\s+/g, " "),
          effort,
          pace: pace?.[1],
          distance: distance?.[1],
          until: until?.[1],
        },
        i + 1,
        line,
        o,
      ),
    );
  });
  return out;
}

const SCHEDULE_COLUMNS = [
  "weekday",
  "time",
  "title",
  "place",
  "effort",
  "pace",
  "distance",
  "note",
  "until",
];

/** True when the CSV header is a weekly schedule (a weekday and a time column). */
export function isScheduleCsv(header: readonly string[]): boolean {
  const h = header.map((c) => c.trim().toLowerCase());
  return h.includes("weekday") && h.includes("time");
}

/** A weekly schedule as CSV: columns weekday, time, title, place, effort, pace, distance, note, until. */
export function parseScheduleCsv(text: string, o: ParseOptions): Parsed[] {
  if (text.length > LIMITS.import.maxTextChars * 5) {
    return [{ ok: false, line: 1, text: "", error: "tooLong" }];
  }
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((c) => c.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  return rows.slice(1).map((cells, i): Parsed => {
    const get = (name: string) => {
      const idx = col(name);
      return idx >= 0 ? unsafeCell((cells[idx] ?? "").trim()) : undefined;
    };
    const fields: Fields = { weekday: get("weekday") ?? "", time: get("time") ?? "" };
    for (const k of SCHEDULE_COLUMNS) {
      if (k === "weekday" || k === "time") continue;
      (fields as Record<string, string | undefined>)[k] = get(k);
    }
    return build(fields, i + 2, cells.join(","), o);
  });
}
