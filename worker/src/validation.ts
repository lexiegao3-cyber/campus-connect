import { z } from "zod";
import { CATEGORIES } from "./types";

const HOUR = 3_600_000;

export const credentials = z.object({
  email: z.email().max(254).transform((e) => e.toLowerCase()),
  password: z.string().min(8).max(128),
});

export const registration = credentials.extend({
  displayName: z.string().trim().min(1).max(60),
});

const eventFields = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(4000).default(""),
  category: z.enum(CATEGORIES),
  location: z.string().trim().min(2).max(200),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  startsAt: z.iso.datetime({ offset: true }).transform((s) => Date.parse(s)),
  endsAt: z.iso.datetime({ offset: true }).transform((s) => Date.parse(s)),
  capacity: z.number().int().min(1).max(10_000).nullable().default(null),
};

function eventRules<T extends { startsAt?: number; endsAt?: number; latitude?: number | null; longitude?: number | null }>(
  e: T,
  ctx: z.RefinementCtx,
) {
  if (e.startsAt !== undefined && e.endsAt !== undefined) {
    if (e.endsAt <= e.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "must be after startsAt" });
    if (e.endsAt - e.startsAt > 14 * 24 * HOUR)
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "events may last at most 14 days" });
  }
  if (e.latitude !== undefined && e.longitude !== undefined && (e.latitude === null) !== (e.longitude === null)) {
    ctx.addIssue({ code: "custom", path: ["longitude"], message: "latitude and longitude must be given together" });
  }
}

export const createEvent = z.object(eventFields).superRefine((e, ctx) => {
  eventRules(e, ctx);
  if (e.startsAt < Date.now() - HOUR) ctx.addIssue({ code: "custom", path: ["startsAt"], message: "must not be in the past" });
});

export const updateEvent = z
  .object({
    title: eventFields.title.optional(),
    description: z.string().trim().max(4000).optional(),
    category: eventFields.category.optional(),
    location: eventFields.location.optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    startsAt: eventFields.startsAt.optional(),
    endsAt: eventFields.endsAt.optional(),
    capacity: z.number().int().min(1).max(10_000).nullable().optional(),
  })
  .superRefine(eventRules)
  .refine((u) => Object.keys(u).length > 0, { message: "no fields to update" });

export const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORIES).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  mine: z.enum(["going", "organizing"]).optional(),
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
