import { z } from "zod";
import {
  DISTANCE_MAX_KM,
  EFFORTS,
  MAX_DAYS_AHEAD,
  PACE_MAX_S_KM,
  PACE_MIN_S_KM,
} from "@/config/runs";
import { LIMITS } from "@/config/limits";
import { isTimeZone } from "./occurrence";

// No control characters or angle brackets: this text is shown to other people.
export const plain = (max: number) =>
  z
    .string()
    .trim()
    .regex(/^[^\u0000-\u001f\u007f<>]+$/)
    .max(max);

export const pace = z.number().int().min(PACE_MIN_S_KM).max(PACE_MAX_S_KM);

export const routeSchema = z.strictObject({
  source: z.enum(["drawn", "gpx"]),
  /** Cut the first and last 200 m before the line is stored. */
  hideEnds: z.boolean().default(false),
  /** [lng, lat] pairs only: time and elevation have nowhere to go. */
  points: z
    .array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]))
    .min(2)
    .max(LIMITS.route.maxPoints),
});

export const createRunSchema = z
  .strictObject({
    groupId: z.uuid(),
    title: plain(LIMITS.run.titleMaxLength),
    placeName: plain(120).optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    /** An ISO instant (UTC). The run's own local time is shown from this and `tz`. */
    startsAt: z.iso.datetime({ offset: true }),
    tz: z.string().max(64).refine(isTimeZone),
    paceMin: pace.optional(),
    paceMax: pace.optional(),
    effort: z.enum(EFFORTS),
    distanceKm: z.number().positive().max(DISTANCE_MAX_KM).optional(),
    note: z.string().trim().max(LIMITS.run.noteMaxLength).optional(),
    repeatWeekly: z.boolean().default(false),
    repeatUntil: z.iso.date().optional(),
    route: routeSchema.optional(),
    /** "public" only counts when public search is on and the group allows it. */
    visibility: z.enum(["group", "public"]).default("group"),
    /** Show the route to everyone, for a public run. */
    shareRoute: z.boolean().default(false),
  })
  .refine((r) => r.paceMin === undefined || r.paceMax === undefined || r.paceMin <= r.paceMax)
  .refine((r) => r.repeatUntil === undefined || r.repeatWeekly);

/** A partial change to a run. `null` clears an optional field. The meeting point cannot move. */
export const updateRunSchema = z
  .strictObject({
    title: plain(LIMITS.run.titleMaxLength).optional(),
    placeName: plain(120).nullable().optional(),
    note: z.string().trim().max(LIMITS.run.noteMaxLength).nullable().optional(),
    startsAt: z.iso.datetime({ offset: true }).optional(),
    tz: z.string().max(64).refine(isTimeZone).optional(),
    effort: z.enum(EFFORTS).optional(),
    distanceKm: z.number().positive().max(DISTANCE_MAX_KM).nullable().optional(),
    paceMin: pace.nullable().optional(),
    paceMax: pace.nullable().optional(),
    status: z.enum(["active", "cancelled"]).optional(),
    visibility: z.enum(["group", "public"]).optional(),
    shareRoute: z.boolean().optional(),
  })
  .refine((p) => Object.keys(p).length > 0)
  .refine((p) => !p.paceMin || !p.paceMax || p.paceMin <= p.paceMax);

export const rsvpSchema = z.strictObject({
  /** The occurrence being answered: the run's `startsAt` or, for a weekly run, a later date. */
  startsAt: z.iso.datetime({ offset: true }),
});

export const runIdSchema = z.uuid();

export function latestStart(now: Date): Date {
  return new Date(now.getTime() + MAX_DAYS_AHEAD * 86400000);
}
