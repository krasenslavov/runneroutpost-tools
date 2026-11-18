import type { RunItem } from "./types";

/** "Sat 5 Dec, 08:00" in the run's own time zone. */
export function formatWhen(run: Pick<RunItem, "startsAt" | "tz">, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: run.tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(run.startsAt));
}

/** 330 becomes "5:30". */
export function formatPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = secondsPerKm % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "5:00 to 5:30", "5:00" when both ends match, or null when no pace was set. */
export function paceRange(run: Pick<RunItem, "paceMin" | "paceMax">): string | null {
  const { paceMin, paceMax } = run;
  if (paceMin === null && paceMax === null) return null;
  if (paceMin !== null && paceMax !== null && paceMin !== paceMax) {
    return `${formatPace(paceMin)} to ${formatPace(paceMax)}`;
  }
  return formatPace((paceMin ?? paceMax)!);
}
