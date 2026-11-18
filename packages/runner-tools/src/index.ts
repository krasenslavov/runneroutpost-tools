/**
 * RunnerOutpost tools: six small functions for running groups. They run anywhere JavaScript runs
 * (browser, Node, an extension) and send nothing anywhere. The same code backs the free tools on
 * the RunnerOutpost blog, the browser extension and the app.
 *
 *   parseSchedule   a pasted weekly schedule -> runs
 *   scheduleToIcs   runs -> a calendar (.ics) file
 *   trimGpx         a GPX file -> the same route without its first and last metres, time or height
 *   meetingTimes    one meeting time -> that moment in other time zones, and a message for the chat
 *   paceWindow      a distance and a pace range -> the finish-time window and the splits
 *   routeStats      a GPX file -> distance, climb, descent, high and low point, loop or not
 *   daylight        a place, a date and a run -> sunrise, sunset, twilight and the minutes in the dark
 */
import { durationMinutes, escapeText, fold } from "../../../src/lib/calendar/ics";
import { haversine, lineLength, trimLineEnds } from "../../../src/lib/gpx/geo";
import { parseGpx } from "../../../src/lib/gpx/parse";
import { simplifyToLimit } from "../../../src/lib/gpx/simplify";
import { parseScheduleText } from "../../../src/lib/import/schedule";
import {
  isTimeZone,
  weeklyOccurrences,
  zonedParts,
  zonedToUtc,
} from "../../../src/lib/runs/occurrence";

export type ScheduleRun = {
  title: string;
  place?: string;
  /** The first start, an ISO instant in UTC. */
  startsAt: string;
  timeZone: string;
  distanceKm?: number;
  paceMin?: number;
  paceMax?: number;
  note?: string;
  /** Last local day (YYYY-MM-DD) the run repeats, if the line said "until". */
  repeatUntil?: string;
};

export type ScheduleProblem = { line: number; text: string; reason: string };

const REASONS: Record<string, string> = {
  weekday: "Start the line with a weekday, such as Tuesday or Tue.",
  time: "Add a start time after the weekday, such as 18:30 or 6:30pm.",
  empty: "Nothing to read on this line.",
  tooLong: "This line is too long.",
  past: "This date is in the past.",
  ended: "This run has already ended.",
  allDay: "A start time is needed, not a whole day.",
  noStart: "No start was found.",
  invalid: "This line could not be read.",
};

/**
 * Reads a pasted weekly schedule, one run per line:
 *
 *   Tuesday 18:30 Track intervals @ Stade Pierre hard 4:45-5:15/km 8 km
 *   Sat 8am Long run @ Lake pier easy until 2027-03-31
 *
 * Every line becomes a weekly run, starting on the next such day in `timeZone`. Lines it cannot
 * read come back as problems with a reason, so a form can show them.
 */
export function parseSchedule(
  text: string,
  options: { timeZone: string; now?: Date },
): { runs: ScheduleRun[]; problems: ScheduleProblem[] } {
  if (!isTimeZone(options.timeZone)) throw new RangeError(`Unknown time zone: ${options.timeZone}`);
  const runs: ScheduleRun[] = [];
  const problems: ScheduleProblem[] = [];
  for (const item of parseScheduleText(text, {
    tz: options.timeZone,
    now: options.now ?? new Date(),
  })) {
    if (!item.ok) {
      problems.push({
        line: item.line,
        text: item.text,
        reason: REASONS[item.error] ?? REASONS.invalid!,
      });
      continue;
    }
    const r = item.row;
    runs.push({
      title: r.title,
      ...(r.placeName ? { place: r.placeName } : {}),
      startsAt: r.startsAt,
      timeZone: r.tz,
      ...(r.distanceKm ? { distanceKm: r.distanceKm } : {}),
      ...(r.paceMin ? { paceMin: r.paceMin } : {}),
      ...(r.paceMax ? { paceMax: r.paceMax } : {}),
      ...(r.note ? { note: r.note } : {}),
      ...(r.repeatUntil ? { repeatUntil: r.repeatUntil } : {}),
    });
  }
  return { runs, problems };
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/**
 * A calendar file (text/calendar) with every run repeating weekly for `weeks` weeks (default 26).
 * Each date is written in UTC, so a run stays at the same local time across clock changes.
 */
export function scheduleToIcs(
  runs: readonly ScheduleRun[],
  options: { name?: string; weeks?: number; now?: Date } = {},
): string {
  const weeks = Math.min(Math.max(Math.floor(options.weeks ?? 26), 1), 104);
  const now = options.now ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RunnerOutpost//Schedule to calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(options.name ? [`X-WR-CALNAME:${escapeText(options.name)}`] : []),
  ];
  runs.forEach((run, i) => {
    const start = new Date(run.startsAt);
    const dates = weeklyOccurrences(start, run.timeZone, run.repeatUntil ?? null, weeks);
    const end = new Date(
      start.getTime() +
        durationMinutes({
          distanceKm: run.distanceKm ?? null,
          paceMin: run.paceMin ?? null,
          paceMax: run.paceMax ?? null,
        }) *
          60000,
    );
    lines.push(
      "BEGIN:VEVENT",
      `UID:${stamp(start)}-${i}@runneroutpost.com`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
    );
    if (dates.length > 1) lines.push(`RDATE:${dates.slice(1).map(stamp).join(",")}`);
    lines.push(`SUMMARY:${escapeText(run.title)}`);
    if (run.place) lines.push(`LOCATION:${escapeText(run.place)}`);
    const note = [run.distanceKm ? `${run.distanceKm} km` : "", run.note ?? ""]
      .filter(Boolean)
      .join("\n");
    if (note) lines.push(`DESCRIPTION:${escapeText(note)}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

export type TrimResult =
  | {
      ok: true;
      /** The trimmed route as GPX 1.1: latitude and longitude only. */
      gpx: string;
      km: number;
      trimmedKm: number;
      pointsIn: number;
      pointsOut: number;
      /** Whether the input carried time or elevation, which are never written out. */
      hadTimeOrElevation: boolean;
    }
  | { ok: false; reason: "invalid" | "empty" | "tooShort" | "tooLarge" };

/**
 * Hides the first and last `meters` (default 200) of a GPX route, so a shared file does not show
 * where you live. The result has no time, no elevation, no heart rate and no waypoints: only the
 * remaining track, thinned to at most `maxPoints` (default 2000) points.
 */
export function trimGpx(
  xml: string,
  options: { meters?: number; maxPoints?: number } = {},
): TrimResult {
  const meters = Math.min(Math.max(options.meters ?? 200, 0), 5000);
  let points;
  try {
    points = parseGpx(xml);
  } catch (error) {
    const code = (error as { code?: string }).code;
    return {
      ok: false,
      reason: code === "tooLarge" ? "tooLarge" : code === "invalidXml" ? "invalid" : "empty",
    };
  }
  const full = points.map((p): [number, number] => [p.lon, p.lat]);
  if (full.length < 2) return { ok: false, reason: "empty" };
  const thin = simplifyToLimit(full, 2, Math.max(options.maxPoints ?? 2000, 10));
  const trimmed = trimLineEnds(thin, meters);
  if (trimmed.length < 2) return { ok: false, reason: "tooShort" };
  const body = trimmed
    .map(([lon, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>`)
    .join("\n");
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RunnerOutpost GPX privacy trimmer" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>Route</name>
    <trkseg>
${body}
    </trkseg>
  </trk>
</gpx>
`;
  return {
    ok: true,
    gpx,
    km: lineLength(thin) / 1000,
    trimmedKm: lineLength(trimmed) / 1000,
    pointsIn: full.length,
    pointsOut: trimmed.length,
    hadTimeOrElevation: points.some((p) => p.time !== null || p.ele !== null),
  };
}

export type MeetingTime = {
  timeZone: string;
  /** The local date and time, for example "Sat, 5 Dec 2026, 08:00". */
  local: string;
  /** Whether it falls the day before or after the meeting day in this zone. */
  dayShift: -1 | 0 | 1;
};

/**
 * Where a meeting time falls in other time zones. `date` is YYYY-MM-DD and `time` is HH:MM, both in
 * `timeZone`. Throws on a bad date, time or zone. Daylight saving is handled by the zone database.
 */
export function meetingTimes(
  meeting: { date: string; time: string; timeZone: string },
  zones: readonly string[],
  locale = "en-GB",
): { startsAt: string; times: MeetingTime[]; message: (place?: string) => string } {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(meeting.date);
  const time = /^(\d{2}):(\d{2})$/.exec(meeting.time);
  if (!date || !time || !isTimeZone(meeting.timeZone))
    throw new RangeError("Invalid meeting date, time or zone");
  const parts = { y: +date[1]!, m: +date[2]!, d: +date[3]!, h: +time[1]!, mi: +time[2]! };
  if (parts.h > 23 || parts.mi > 59) throw new RangeError("Invalid meeting time");
  const instant = zonedToUtc(parts, meeting.timeZone);
  const base = Date.UTC(parts.y, parts.m - 1, parts.d);
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant);
  const times = [meeting.timeZone, ...zones.filter((z) => z !== meeting.timeZone)]
    .filter(isTimeZone)
    .map((tz): MeetingTime => {
      const p = zonedParts(instant, tz);
      const shift = Math.round((Date.UTC(p.y, p.m - 1, p.d) - base) / 86400000);
      return { timeZone: tz, local: fmt(tz), dayShift: shift < 0 ? -1 : shift > 0 ? 1 : 0 };
    });
  return {
    startsAt: instant.toISOString(),
    times,
    message: (place) =>
      [
        `Run${place ? ` at ${place}` : ""}:`,
        ...times.map(
          (t) =>
            `${t.timeZone.replace(/_/g, " ")}: ${t.local}${t.dayShift ? (t.dayShift > 0 ? " (next day)" : " (day before)") : ""}`,
        ),
      ].join("\n"),
  };
}

// ---------------------------------------------------------------------------------------------
// Pace window

/** Reads a pace such as "4:45", "4:45/km" or "5:30 per mile" as seconds, or null. */
export function parsePace(text: string): number | null {
  const m =
    /^\s*(\d{1,2}):([0-5]\d)\s*(?:\/|per\s*)?\s*(?:km|mi|mile|kilometre|kilometer)?\s*$/i.exec(
      text,
    );
  if (!m) return null;
  const seconds = Number(m[1]) * 60 + Number(m[2]);
  return seconds > 0 ? seconds : null;
}

/** Seconds as H:MM:SS, or M:SS under an hour. */
export function formatDuration(totalSeconds: number): string {
  const t = Math.round(totalSeconds);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

export type PaceWindow = {
  /** The group's quickest and slowest finish, in seconds. */
  fastSeconds: number;
  slowSeconds: number;
  /** How far apart the two ends of the group finish. */
  gapSeconds: number;
  fastKmh: number;
  slowKmh: number;
  /** Elapsed seconds at each whole kilometre (or mile, see `unitKm`), at the quick and slow pace. */
  splits: { km: number; fastSeconds: number; slowSeconds: number }[];
};

/**
 * What a pace range means over a distance. Paces are seconds per kilometre; give the distance in
 * kilometres. `splitEveryKm` is 1 for kilometre splits and 1.609344 for mile splits. Returns null for
 * a distance or pace that is not positive, or a quick pace that is slower than the slow one.
 */
export function paceWindow(
  distanceKm: number,
  fastPaceSecPerKm: number,
  slowPaceSecPerKm: number,
  splitEveryKm = 1,
): PaceWindow | null {
  if (
    !(distanceKm > 0) ||
    !(fastPaceSecPerKm > 0) ||
    !(slowPaceSecPerKm >= fastPaceSecPerKm) ||
    !(splitEveryKm > 0) ||
    distanceKm > 1000
  )
    return null;
  const splits: PaceWindow["splits"] = [];
  for (let i = 1; i * splitEveryKm <= distanceKm + 1e-9 && splits.length < 200; i++) {
    const km = i * splitEveryKm;
    splits.push({ km, fastSeconds: km * fastPaceSecPerKm, slowSeconds: km * slowPaceSecPerKm });
  }
  const fastSeconds = distanceKm * fastPaceSecPerKm;
  const slowSeconds = distanceKm * slowPaceSecPerKm;
  return {
    fastSeconds,
    slowSeconds,
    gapSeconds: slowSeconds - fastSeconds,
    fastKmh: 3600 / fastPaceSecPerKm,
    slowKmh: 3600 / slowPaceSecPerKm,
    splits,
  };
}

// ---------------------------------------------------------------------------------------------
// Route stats

export type RouteStats =
  | {
      ok: true;
      km: number;
      points: number;
      /** Climb and descent in metres, or null when the file has no elevation. */
      gainM: number | null;
      lossM: number | null;
      highM: number | null;
      lowM: number | null;
      /** Straight-line metres between the start and the end. */
      startEndM: number;
      /** True when the route ends within 150 m of where it starts. */
      loop: boolean;
    }
  | { ok: false; reason: "invalid" | "empty" | "tooLarge" };

/** Elevation changes smaller than this are noise from the watch and are not counted. */
const CLIMB_NOISE_M = 3;

/** Distance, climb, descent, highest and lowest point and loop or not, from a GPX file. */
export function routeStats(xml: string): RouteStats {
  let points;
  try {
    points = parseGpx(xml);
  } catch (error) {
    const code = (error as { code?: string }).code;
    return {
      ok: false,
      reason: code === "tooLarge" ? "tooLarge" : code === "invalidXml" ? "invalid" : "empty",
    };
  }
  if (points.length < 2) return { ok: false, reason: "empty" };
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    meters += haversine(a.lat, a.lon, b.lat, b.lon);
  }
  const heights = points.map((p) => p.ele).filter((e): e is number => e !== null);
  let gain = 0;
  let loss = 0;
  if (heights.length > 1) {
    let anchor = heights[0]!;
    for (const h of heights) {
      if (h - anchor >= CLIMB_NOISE_M) {
        gain += h - anchor;
        anchor = h;
      } else if (anchor - h >= CLIMB_NOISE_M) {
        loss += anchor - h;
        anchor = h;
      }
    }
  }
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const startEndM = haversine(first.lat, first.lon, last.lat, last.lon);
  return {
    ok: true,
    km: meters / 1000,
    points: points.length,
    gainM: heights.length > 1 ? gain : null,
    lossM: heights.length > 1 ? loss : null,
    highM: heights.length ? Math.max(...heights) : null,
    lowM: heights.length ? Math.min(...heights) : null,
    startEndM,
    loop: startEndM <= 150,
  };
}

// ---------------------------------------------------------------------------------------------
// Daylight

export type Daylight = {
  /** Null when the sun does not rise or set on that date at that place. */
  sunrise: string | null;
  sunset: string | null;
  /** Civil dawn and dusk: the sun 6 degrees below the horizon, enough light to run without a torch. */
  dawn: string | null;
  dusk: string | null;
  /** "day": the sun stays up. "night": it stays down. "normal": it rises and sets. */
  sun: "day" | "night" | "normal";
  /** The run, in minutes, split by how much light there is. */
  minutes: { total: number; daylight: number; twilight: number; dark: number };
};

const RAD = Math.PI / 180;

/** When the sun crosses `altitudeDeg` on the local day of `date` (noon UTC of that calendar day). */
function sunCrossing(
  y: number,
  m: number,
  d: number,
  lat: number,
  lon: number,
  altitudeDeg: number,
): { rise: number; set: number } | "always" | "never" {
  const n = Math.round(Date.UTC(y, m - 1, d, 12) / 86400000 + 2440587.5 - 2451545.0);
  const jStar = n - lon / 360;
  const mean = (357.5291 + 0.98560028 * jStar) % 360;
  const center =
    1.9148 * Math.sin(mean * RAD) +
    0.02 * Math.sin(2 * mean * RAD) +
    0.0003 * Math.sin(3 * mean * RAD);
  const lambda = (mean + center + 180 + 102.9372) % 360;
  const transit =
    2451545.0 + jStar + 0.0053 * Math.sin(mean * RAD) - 0.0069 * Math.sin(2 * lambda * RAD);
  const sinDec = Math.sin(lambda * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.sqrt(1 - sinDec * sinDec);
  const cosH =
    (Math.sin(altitudeDeg * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
  if (cosH > 1) return "never";
  if (cosH < -1) return "always";
  const h = Math.acos(cosH) / RAD / 360;
  const toMs = (j: number) => (j - 2440587.5) * 86400000;
  return { rise: toMs(transit - h), set: toMs(transit + h) };
}

const overlapMs = (a0: number, a1: number, b0: number, b1: number) =>
  Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/**
 * Sunrise, sunset and civil twilight for a place and a day, and how much of a run falls in daylight,
 * twilight and the dark. `date` is YYYY-MM-DD and `time` HH:MM, both in `timeZone`. Accurate to a
 * couple of minutes away from the poles. Throws on a bad date, time, zone or place.
 */
export function daylight(input: {
  lat: number;
  lon: number;
  date: string;
  time: string;
  timeZone: string;
  runMinutes: number;
}): Daylight {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.date);
  const time = /^(\d{2}):(\d{2})$/.exec(input.time);
  if (
    !date ||
    !time ||
    !isTimeZone(input.timeZone) ||
    !(Math.abs(input.lat) <= 90) ||
    !(Math.abs(input.lon) <= 180) ||
    !(input.runMinutes > 0) ||
    input.runMinutes > 1440
  )
    throw new RangeError("Invalid place, date, time or zone");
  const y = +date[1]!;
  const m = +date[2]!;
  const d = +date[3]!;
  const start = zonedToUtc({ y, m, d, h: +time[1]!, mi: +time[2]! }, input.timeZone).getTime();
  const end = start + input.runMinutes * 60000;
  const dayStart = zonedToUtc({ y, m, d, h: 0, mi: 0 }, input.timeZone).getTime();
  const dayEnd = dayStart + 86400000 * 1.5;

  const sun = sunCrossing(y, m, d, input.lat, input.lon, -0.833);
  const civil = sunCrossing(y, m, d, input.lat, input.lon, -6);
  const span = (c: typeof sun): [number, number] =>
    c === "always" ? [dayStart, dayEnd] : c === "never" ? [0, 0] : [c.rise, c.set];
  const [lightFrom, lightTo] = span(sun);
  const [civilFrom, civilTo] = span(civil);
  const total = input.runMinutes;
  const daylightMin = overlapMs(start, end, lightFrom, lightTo) / 60000;
  const litMin = overlapMs(start, end, civilFrom, civilTo) / 60000;
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    sunrise: typeof sun === "object" ? iso(sun.rise) : null,
    sunset: typeof sun === "object" ? iso(sun.set) : null,
    dawn: typeof civil === "object" ? iso(civil.rise) : null,
    dusk: typeof civil === "object" ? iso(civil.set) : null,
    sun: sun === "always" ? "day" : sun === "never" ? "night" : "normal",
    minutes: {
      total,
      daylight: Math.round(daylightMin),
      twilight: Math.round(Math.max(0, litMin - daylightMin)),
      dark: Math.round(Math.max(0, total - litMin)),
    },
  };
}
