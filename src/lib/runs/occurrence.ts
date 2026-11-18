const WEEK_MS = 7 * 24 * 3600 * 1000;

type Parts = { y: number; m: number; d: number; h: number; mi: number };

/** The wall-clock parts of an instant in a time zone. */
export function zonedParts(instant: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const get = (type: string) =>
    Number(f.formatToParts(instant).find((p) => p.type === type)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute") };
}

function offsetMs(instant: Date, tz: string): number {
  const p = zonedParts(instant, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  return asUtc - Math.floor(instant.getTime() / 60000) * 60000;
}

/** The instant at which the wall clock in `tz` reads these parts (DST-safe for ordinary times). */
export function zonedToUtc(p: Parts, tz: string): Date {
  const guess = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz);
  return new Date(t);
}

/** True for an IANA zone name the runtime knows. */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type Repeating = {
  startsAt: Date;
  tz: string;
  repeatWeekly: boolean;
  /** Last day (YYYY-MM-DD) a weekly run may happen, or null for no end. */
  repeatUntil: string | null;
};

/**
 * The first occurrence that has not ended yet (it ends `graceMs` after it starts), or null when
 * a weekly run has run out. A weekly run keeps the same local time all year, across clock changes.
 */
export function nextOccurrence(run: Repeating, now: Date, graceMs: number): Date | null {
  if (!run.repeatWeekly)
    return run.startsAt.getTime() + graceMs >= now.getTime() ? run.startsAt : null;
  const first = zonedParts(run.startsAt, run.tz);
  const behind = now.getTime() - graceMs - run.startsAt.getTime();
  let k = Math.max(0, Math.floor(behind / WEEK_MS) - 1);
  for (;;) {
    const day = new Date(Date.UTC(first.y, first.m - 1, first.d + 7 * k));
    const occ = zonedToUtc(
      {
        y: day.getUTCFullYear(),
        m: day.getUTCMonth() + 1,
        d: day.getUTCDate(),
        h: first.h,
        mi: first.mi,
      },
      run.tz,
    );
    if (run.repeatUntil) {
      const localDay = day.toISOString().slice(0, 10);
      if (localDay > run.repeatUntil) return null;
    }
    if (occ.getTime() + graceMs >= now.getTime()) return occ;
    k += 1;
  }
}

/**
 * The first `count` weekly occurrences from `first` (included), at the same local time in `tz`,
 * stopping after `until` (YYYY-MM-DD, the last local day allowed).
 */
export function weeklyOccurrences(
  first: Date,
  tz: string,
  until: string | null,
  count: number,
): Date[] {
  const p = zonedParts(first, tz);
  const out: Date[] = [];
  for (let k = 0; k < count; k += 1) {
    const day = new Date(Date.UTC(p.y, p.m - 1, p.d + 7 * k));
    if (until && day.toISOString().slice(0, 10) > until) break;
    out.push(
      zonedToUtc(
        {
          y: day.getUTCFullYear(),
          m: day.getUTCMonth() + 1,
          d: day.getUTCDate(),
          h: p.h,
          mi: p.mi,
        },
        tz,
      ),
    );
  }
  return out;
}
