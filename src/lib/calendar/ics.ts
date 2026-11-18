import { APP_DOMAIN, APP_NAME } from "@/config/app";
import { CALENDAR_WEEKS, DEFAULT_RUN_MINUTES, MAX_RUN_MINUTES } from "@/config/runs";
import { weeklyOccurrences } from "@/lib/runs/occurrence";
import type { RunItem } from "@/lib/runs/types";

const CRLF = "\r\n";

/** A UTC instant as 20261205T070000Z. */
function stamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

/** Text values: backslash, semicolon, comma and line breaks are escaped (RFC 5545, section 3.3.11). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines are at most 75 bytes; longer ones continue on the next line after a space. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  // The first line may hold 75 bytes, each continuation 74 (the leading space counts).
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74;
    }
    current += ch;
    bytes += n;
  }
  parts.push(current);
  return parts.join(CRLF + " ");
}

/** How long the entry lasts: distance at the slowest pace when known, else an hour. */
export function durationMinutes(run: Pick<RunItem, "distanceKm" | "paceMin" | "paceMax">): number {
  const pace = run.paceMax ?? run.paceMin;
  if (run.distanceKm && pace) {
    const minutes = Math.round((run.distanceKm * pace) / 60);
    return Math.min(MAX_RUN_MINUTES, Math.max(15, minutes));
  }
  return DEFAULT_RUN_MINUTES;
}

type Options = {
  now: Date;
  /** Free groups put a small RunnerOutpost line in the description; Pro groups do not. */
  mark: boolean;
};

function describe(run: RunItem, t: Labels, mark: boolean): string {
  const lines = [`${t.group}: ${run.groupName}`, `${t.effort}: ${t.effortNames[run.effort]}`];
  if (run.paceMin !== null || run.paceMax !== null) {
    const f = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    const a = run.paceMin ?? run.paceMax!;
    const b = run.paceMax ?? run.paceMin!;
    lines.push(`${t.pace}: ${a === b ? f(a) : `${f(a)} - ${f(b)}`} /km`);
  }
  if (run.distanceKm) lines.push(`${t.distance}: ${run.distanceKm} km`);
  if (run.note) lines.push("", run.note);
  if (mark) lines.push("", `${t.madeWith} ${APP_NAME} (${APP_DOMAIN})`);
  return lines.join("\n");
}

/** The words in the file come from the caller, so they follow the language of the app. */
export type Labels = {
  group: string;
  effort: string;
  pace: string;
  distance: string;
  madeWith: string;
  effortNames: Record<RunItem["effort"], string>;
};

function event(run: RunItem, t: Labels, o: Options): string[] {
  const start = new Date(run.startsAt);
  const dates = run.repeatWeekly
    ? weeklyOccurrences(start, run.tz, run.repeatUntil, CALENDAR_WEEKS)
    : [start];
  const end = new Date(start.getTime() + durationMinutes(run) * 60000);
  // Times are written in UTC, so every calendar shows the right moment for its owner, and a weekly
  // run stays at the same local time in the run's zone across clock changes (each date is listed).
  const out = [
    "BEGIN:VEVENT",
    `UID:${run.id}@${APP_DOMAIN}`,
    `DTSTAMP:${stamp(o.now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
  ];
  if (dates.length > 1) out.push(`RDATE:${dates.slice(1).map(stamp).join(",")}`);
  out.push(`SUMMARY:${escapeText(run.title)}`);
  if (run.placeName) out.push(`LOCATION:${escapeText(run.placeName)}`);
  out.push(`DESCRIPTION:${escapeText(describe(run, t, o.mark))}`);
  out.push("END:VEVENT");
  return out;
}

/** A calendar file (text/calendar) holding one or more runs. Lines end with CRLF, as the format needs. */
export function buildCalendar(runs: readonly RunItem[], t: Labels, o: Options): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${APP_NAME}//Group runs//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...runs.flatMap((r) => event(r, t, o)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}

/** A safe file name from a title: "Saturday long run" becomes "saturday-long-run.ics". */
export function icsFileName(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .slice(0, 40);
  return `${base || "run"}.ics`;
}

/** Hands the file to the browser as a download (phones offer to open it in the calendar). */
export function downloadIcs(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
