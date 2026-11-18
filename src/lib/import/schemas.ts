import { z } from "zod";
import { LIMITS } from "@/config/limits";
import { EFFORTS } from "@/config/runs";
import { pace, plain, routeSchema } from "@/lib/runs/schemas";
import { isTimeZone } from "@/lib/runs/occurrence";
import { DISTANCE_MAX_KM } from "@/config/runs";

/** One run to create from an import. The same checks apply to every source (text, CSV, .ics, file). */
export const importRowSchema = z
  .strictObject({
    title: plain(LIMITS.run.titleMaxLength),
    placeName: plain(120).optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    startsAt: z.iso.datetime({ offset: true }),
    tz: z.string().max(64).refine(isTimeZone),
    effort: z.enum(EFFORTS).default("comfortable"),
    paceMin: pace.optional(),
    paceMax: pace.optional(),
    distanceKm: z.number().positive().max(DISTANCE_MAX_KM).optional(),
    note: z.string().trim().max(LIMITS.run.noteMaxLength).optional(),
    repeatWeekly: z.boolean().default(false),
    repeatUntil: z.iso.date().optional(),
    route: routeSchema.optional(),
  })
  .refine((r) => r.paceMin === undefined || r.paceMax === undefined || r.paceMin <= r.paceMax)
  .refine((r) => r.repeatUntil === undefined || r.repeatWeekly);

export type ImportRow = z.infer<typeof importRowSchema>;

export const importRunsBody = z.strictObject({
  rows: z.array(importRowSchema).min(1).max(LIMITS.import.maxRows),
});

/** The file a group is exported to, and imported from. No ids, no tokens, no hashes. */
export const groupFileSchema = z.strictObject({
  app: z.literal("runneroutpost"),
  version: z.literal(1),
  group: z.strictObject({
    name: plain(LIMITS.group.nameMaxLength),
    areaLabel: plain(LIMITS.group.areaMaxLength).optional(),
  }),
  names: z.array(plain(LIMITS.group.firstNameMaxLength)).max(LIMITS.import.maxNames),
  runs: z.array(importRowSchema).max(LIMITS.import.maxRows),
});

export type GroupFile = z.infer<typeof groupFileSchema>;

export const namesBody = z.strictObject({
  names: z.array(plain(LIMITS.group.firstNameMaxLength)).min(1).max(LIMITS.import.maxNames),
});
