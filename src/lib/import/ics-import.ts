import { LIMITS } from "@/config/limits";
import { isTimeZone, nextOccurrence, zonedParts, zonedToUtc } from "@/lib/runs/occurrence";
import type { DraftRow, Parsed, ParseOptions } from "./schedule";

export type IcsResult = {
  rows: Parsed[];
  /** Things worth telling the person that did not stop a row from being read. */
  warnings: ("repeatUnsupported" | "zoneUnknown" | "tooMany")[];
};

type Prop = { name: string; params: Record<string, string>; value: string };

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

function parseLine(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon < 1) return null;
  const [name, ...ps] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of ps) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

type Stamp = { date: Date } | { allDay: true } | null;

/** A DTSTART or RDATE value to an instant, reading floating times on the clock of `fallbackTz`. */
function readStamp(
  value: string,
  params: Record<string, string>,
  fallbackTz: string,
  warn: (w: "zoneUnknown") => void,
): Stamp {
  if (params.VALUE === "DATE" || /^\d{8}$/.test(value)) return { allDay: true };
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  if (m[7]) return { date: new Date(Date.UTC(y, mo - 1, d, h, mi)) };
  let tz = fallbackTz;
  if (params.TZID) {
    if (isTimeZone(params.TZID)) tz = params.TZID;
    else warn("zoneUnknown");
  }
  return { date: zonedToUtc({ y, m: mo, d, h, mi }, tz) };
}

function localDay(date: Date, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/**
 * Reads a club calendar file (.ics). Each VEVENT becomes one run. A weekly repeat (RRULE with
 * FREQ=WEEKLY, or a list of RDATE values a week apart, as our own files write) becomes a weekly run;
 * any other repeat is read as its first date only, with a warning. Events that are over, all-day
 * events and events with no start are returned as errors so the preview can say why.
 */
export function parseIcs(text: string, o: ParseOptions): IcsResult {
  const warnings = new Set<IcsResult["warnings"][number]>();
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const rows: Parsed[] = [];
  let event: Prop[] | null = null;
  let count = 0;

  const finish = (props: Prop[], line: number) => {
    const get = (n: string) => props.find((p) => p.name === n);
    const start = get("DTSTART");
    if (!start)
      return rows.push({ ok: false, line, text: get("SUMMARY")?.value ?? "", error: "noStart" });
    const title =
      unescapeText(get("SUMMARY")?.value ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, LIMITS.run.titleMaxLength) || "Group run";
    const stamp = readStamp(start.value, start.params, o.tz, (w) => warnings.add(w));
    if (!stamp) return rows.push({ ok: false, line, text: title, error: "invalid" });
    if ("allDay" in stamp) return rows.push({ ok: false, line, text: title, error: "allDay" });
    const tz = start.params.TZID && isTimeZone(start.params.TZID) ? start.params.TZID : o.tz;

    // Weekly repeat from RRULE, or from a list of RDATE values a week apart.
    let repeatWeekly = false;
    let repeatUntil: string | undefined;
    const rrule = get("RRULE");
    if (rrule) {
      const parts = Object.fromEntries(
        rrule.value.split(";").map((kv) => kv.split("=") as [string, string]),
      );
      if (parts.FREQ === "WEEKLY" && (!parts.INTERVAL || parts.INTERVAL === "1")) {
        repeatWeekly = true;
        if (parts.UNTIL) {
          const u = readStamp(
            parts.UNTIL.length === 8 ? `${parts.UNTIL}T235959Z` : parts.UNTIL,
            {},
            tz,
            () => {},
          );
          if (u && "date" in u) repeatUntil = localDay(u.date, tz);
        } else if (parts.COUNT && Number(parts.COUNT) > 1) {
          repeatUntil = localDay(
            new Date(stamp.date.getTime() + (Number(parts.COUNT) - 1) * 7 * 86400000),
            tz,
          );
        }
      } else warnings.add("repeatUnsupported");
    }
    const rdates = props
      .filter((p) => p.name === "RDATE")
      .flatMap((p) => p.value.split(",").map((v) => readStamp(v.trim(), p.params, o.tz, () => {})));
    if (!repeatWeekly && rdates.length > 0) {
      const days = rdates.flatMap((s) => (s && "date" in s ? [s.date] : []));
      const all = [stamp.date, ...days].sort((a, b) => a.getTime() - b.getTime());
      const dayNo = (d: Date) => {
        const p = zonedParts(d, tz);
        return Date.UTC(p.y, p.m - 1, p.d) / 86400000;
      };
      const weekly = all.every((d, i) => i === 0 || dayNo(d) - dayNo(all[i - 1]) === 7);
      if (weekly) {
        repeatWeekly = true;
        repeatUntil = localDay(all[all.length - 1], tz);
      } else warnings.add("repeatUnsupported");
    }

    let startsAt = stamp.date;
    if (repeatWeekly) {
      const next = nextOccurrence(
        { startsAt, tz, repeatWeekly: true, repeatUntil: repeatUntil ?? null },
        o.now,
        0,
      );
      if (!next) return rows.push({ ok: false, line, text: title, error: "ended" });
      startsAt = next;
    } else if (startsAt.getTime() < o.now.getTime()) {
      return rows.push({ ok: false, line, text: title, error: "past" });
    }

    const geo = get("GEO")?.value.split(";").map(Number);
    const place = unescapeText(get("LOCATION")?.value ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    const note = unescapeText(get("DESCRIPTION")?.value ?? "")
      .trim()
      .slice(0, LIMITS.run.noteMaxLength);
    const row: DraftRow = {
      title,
      placeName: place || undefined,
      lat: geo && geo.length === 2 && geo.every(Number.isFinite) ? geo[0] : undefined,
      lng: geo && geo.length === 2 && geo.every(Number.isFinite) ? geo[1] : undefined,
      startsAt: startsAt.toISOString(),
      tz,
      effort: "comfortable",
      note: note || undefined,
      repeatWeekly,
      repeatUntil: repeatWeekly ? repeatUntil : undefined,
    };
    rows.push({ ok: true, line, row });
  };

  lines.forEach((raw, i) => {
    const u = raw.trim().toUpperCase();
    if (u === "BEGIN:VEVENT") event = [];
    else if (u === "END:VEVENT" && event) {
      if (count >= LIMITS.import.maxRows) warnings.add("tooMany");
      else {
        count += 1;
        finish(event, i + 1);
      }
      event = null;
    } else if (event) {
      const p = parseLine(raw);
      if (p) event.push(p);
    }
  });
  return { rows, warnings: [...warnings] };
}
