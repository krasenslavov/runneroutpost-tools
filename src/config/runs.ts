/** Run options. Limits live in limits.ts; this file holds the choices the forms offer. */
export const EFFORTS = ["easy", "comfortable", "hard", "all_out"] as const;
export type Effort = (typeof EFFORTS)[number];

/** Pace choices in seconds per km: a fixed range selector, every 15 s from 3:00 to 9:00. */
export const PACE_MIN_S_KM = 180;
export const PACE_MAX_S_KM = 540;
export const PACE_STEP_S = 15;

/** A run counts as upcoming until this long after it starts. */
export const RUN_GRACE_HOURS = 3;
/** The furthest ahead a run may be set. */
export const MAX_DAYS_AHEAD = 366;

export const DISTANCE_MAX_KM = 100;

/** Times of day for the filter, as local hours: [from, to). */
export const TIMES_OF_DAY = {
  morning: [4, 12],
  afternoon: [12, 17],
  evening: [17, 24],
} as const;
export type TimeOfDay = keyof typeof TIMES_OF_DAY;

/** How long a calendar entry lasts when the run has no distance and pace to work it out from. */
export const DEFAULT_RUN_MINUTES = 60;
export const MAX_RUN_MINUTES = 6 * 60;
/** A weekly run is written into a calendar file for this many weeks ahead. */
export const CALENDAR_WEEKS = 52;
