import { TIMES_OF_DAY, type Effort, type TimeOfDay } from "@/config/runs";
import { zonedParts } from "./occurrence";
import type { RunItem } from "./types";

export type Filters = {
  /** One group, or "all" for every group I belong to. */
  group: string;
  day: "any" | "today" | "weekend";
  time: TimeOfDay | "any";
  effort: Effort | "any";
  mine: boolean;
};

export const NO_FILTERS: Filters = {
  group: "all",
  day: "any",
  time: "any",
  effort: "any",
  mine: false,
};

function dayNumber(p: { y: number; m: number; d: number }) {
  return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86400000);
}

/** Days from today to the run's date, both read on the wall clock of the run's own time zone. */
function daysAway(run: RunItem, now: Date) {
  return dayNumber(zonedParts(new Date(run.startsAt), run.tz)) - dayNumber(zonedParts(now, run.tz));
}

/** Pure, so the day and time filters can be tested without a browser. */
export function applyFilters(runs: readonly RunItem[], f: Filters, now: Date): RunItem[] {
  return runs.filter((run) => {
    if (f.group !== "all" && run.groupId !== f.group) return false;
    if (f.effort !== "any" && run.effort !== f.effort) return false;
    if (f.mine && !run.mine && !run.imComing) return false;

    const local = zonedParts(new Date(run.startsAt), run.tz);
    if (f.time !== "any") {
      const [from, to] = TIMES_OF_DAY[f.time];
      if (local.h < from || local.h >= to) return false;
    }
    if (f.day === "today" && daysAway(run, now) !== 0) return false;
    if (f.day === "weekend") {
      const weekday = new Date(Date.UTC(local.y, local.m - 1, local.d)).getUTCDay();
      // Saturday or Sunday, within the next week.
      if ((weekday !== 6 && weekday !== 0) || daysAway(run, now) > 6) return false;
    }
    return true;
  });
}
