import express from "express";
import { DateTime } from "luxon";
import { Types } from "mongoose";
import { z } from "zod";
import { issueToken, requireAuth, verifyGoogleCredential } from "./auth.js";
import { errorHandler, HttpError } from "./errors.js";
import { Activity, fromPoint, Notification, Report, Seek, toPoint, User } from "./models.js";
import { nullHub } from "./realtime.js";
import { schoolForEmail } from "./schools.js";
import { blockedSet, Services } from "./services.js";
import { CATEGORIES, LEVELS, SPORTS } from "./vocab.js";

const objectId = z.string().refine((s) => Types.ObjectId.isValid(s), "invalid id");
const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const place = z.object({ name: z.string().trim().min(1).max(120), point: point.optional() });
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:mm");
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const tz = z.string().refine((t) => DateTime.local().setZone(t).isValid, "unknown time zone");

const kind = z
  .object({ category: z.enum(CATEGORIES), sport: z.enum(SPORTS).nullish(), level: z.enum(LEVELS).default("any") })
  .transform((k) => ({ ...k, sport: k.category === "sports" ? (k.sport ?? null) : null, level: k.category === "sports" ? k.level : ("any") }));

const activityBody = z
  .object({
    title: z.string().trim().min(2).max(80),
    notes: z.string().trim().max(500).default(""),
    startsAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
    endsAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
    fillBy: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
    capacity: z.number().int().min(2).max(50),
    area: place,
    exactLocation: z.string().trim().max(200).default(""),
  })
  .and(kind)
  .refine((b) => b.endsAt > b.startsAt, { message: "must be after startsAt", path: ["endsAt"] })
  .refine((b) => b.endsAt.getTime() - b.startsAt.getTime() <= 14 * 864e5, { message: "at most 14 days", path: ["endsAt"] })
  .refine((b) => b.fillBy <= b.startsAt, { message: "must be no later than startsAt", path: ["fillBy"] })
  .refine((b) => b.category !== "sports" || b.sport, { message: "pick a sport", path: ["sport"] });

const seekBody = z
  .object({
    note: z.string().trim().max(300).default(""),
    availability: z.object({ from: ymd, to: ymd, days: z.array(z.number().int().min(1).max(7)).min(1).max(7), start: hhmm, end: hhmm, tz }),
    area: place.optional(),
    maxDistanceKm: z.number().min(0.5).max(50).default(5),
  })
  .and(kind)
  .refine((b) => b.availability.from <= b.availability.to, { message: "from must be on or before to", path: ["availability", "to"] })
  .refine((b) => b.availability.start !== b.availability.end, { message: "empty time window", path: ["availability", "end"] })
  .refine((b) => DateTime.fromISO(b.availability.to).diff(DateTime.fromISO(b.availability.from), "days").days <= 60, {
    message: "at most 60 days", path: ["availability", "to"],
  });

/** Simple fixed-window limiter (in memory: fine for one instance). */
function limit(max, windowMs, key) {
  const hits = new Map();
  return (req, _res, next) => {
    const now = Date.now(), k = key(req), e = hits.get(k);
    if (!e || e.reset <= now) {
      if (hits.size > 10_000) for (const [kk, v] of hits) if (v.reset <= now) hits.delete(kk);
      hits.set(k, { n: 1, reset: now + windowMs });
      return next();
    }
    if (++e.n > max) return next(new HttpError(429, "Too many requests, try again later"));
    next();
  };
}

/** The caller's school domain; every query is scoped to it. */
async function schoolOf(userId) {
  const u = await User.findById(userId, { "school.domain": 1 }).lean();
  if (!u?.school?.domain) throw new HttpError(401, "Unknown user");
  return u.school.domain;
}

const userDto = (u) => ({ id: String(u._id), email: u.email, name: u.name, school: u.school, tz: u.tz, lang: u.lang });

export function createApp(cfg, opts = {}) {
  const now = opts.now ?? (() => new Date());
  const services = new Services(opts.hub ?? nullHub, now);
  const auth = requireAuth(cfg);
  const uid = (req) => req.userId;
  const verifyGoogle = opts.verifyGoogle ?? ((c) => verifyGoogleCredential(c, cfg.googleClientId));

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.set({ "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "X-Frame-Options": "DENY" });
    next();
  });
  app.use(express.json({ limit: "32kb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  const maps = opts.maps ?? { apiKey: process.env.GOOGLE_MAPS_API_KEY, mapId: process.env.GOOGLE_MAPS_MAP_ID };
  app.get("/api/config", (_req, res) =>
    res.json({
      googleClientId: cfg.googleClientId ?? null,
      devLogin: cfg.devLogin,
      googleMapsKey: maps.apiKey || null,
      googleMapsMapId: maps.apiKey ? maps.mapId || "DEMO_MAP_ID" : null,
    }),
  );

  // ---- sign in: the email domain decides the school ------------------------------------
  const authLimit = limit(30, 15 * 60_000, (req) => req.ip ?? "?");
  async function signIn(email, name, googleSub) {
    const school = schoolForEmail(email);
    if (!school) throw new HttpError(403, "Use your school email. This address is not on a known university domain.", "not-school");
    const user = await User.findOneAndUpdate(
      { email },
      { $setOnInsert: { email, name: name.slice(0, 60), school }, ...(googleSub ? { $set: { googleSub } } : {}) },
      { upsert: true, returnDocument: "after" },
    ).lean();
    return { token: await issueToken(String(user._id), cfg), user: userDto(user) };
  }
  app.get("/api/schools/lookup", (req, res) => {
    const email = z.string().max(200).parse(req.query.email ?? "");
    res.json({ school: schoolForEmail(email) });
  });
  app.post("/api/auth/google", authLimit, async (req, res) => {
    if (!cfg.googleClientId) throw new HttpError(404, "Google sign-in is not configured");
    const { credential } = z.object({ credential: z.string().min(20).max(5000) }).parse(req.body);
    const g = await verifyGoogle(credential).catch((e) => {
      throw e instanceof HttpError ? e : new HttpError(401, "Google sign-in failed");
    });
    res.json(await signIn(g.email, g.name, g.sub));
  });
  app.post("/api/auth/dev", authLimit, async (req, res) => {
    if (!cfg.devLogin) throw new HttpError(404, "Email sign-in is disabled");
    const b = z.object({ email: z.email().max(200).transform((e) => e.toLowerCase()), name: z.string().trim().min(1).max(60) }).parse(req.body);
    res.json(await signIn(b.email, b.name));
  });

  // ---- me --------------------------------------------------------------------------------
  app.get("/api/me", auth, async (req, res) => {
    const u = await User.findById(uid(req)).lean();
    if (!u) throw new HttpError(401, "Unknown user");
    res.json(userDto(u));
  });
  app.patch("/api/me", auth, async (req, res) => {
    const b = z.object({ name: z.string().trim().min(1).max(60).optional(), tz: tz.optional(), lang: z.enum(["en", "zh"]).optional() }).parse(req.body);
    const u = await User.findByIdAndUpdate(uid(req), b, { returnDocument: "after" }).lean();
    res.json(userDto(u));
  });

  // ---- activities --------------------------------------------------------------------------
  const postLimit = limit(20, 60 * 60_000, (req) => req.userId ?? req.ip ?? "?");

  async function activityDto(a, viewer, extra = {}) {
    const ids = [a.host, ...a.participants.map((p) => p.user)];
    const people = await User.find({ _id: { $in: ids } }, { name: 1 }).lean();
    const nameOf = new Map(people.map((p) => [String(p._id), p.name]));
    const isHost = String(a.host) === viewer;
    const joined = a.participants.some((p) => String(p.user) === viewer);
    return {
      id: String(a._id), title: a.title, notes: a.notes, category: a.category, sport: a.sport, level: a.level,
      startsAt: a.startsAt, endsAt: a.endsAt, fillBy: a.fillBy, capacity: a.capacity, status: a.status,
      host: { id: String(a.host), name: nameOf.get(String(a.host)) ?? "" },
      joinedCount: a.participants.length + 1,
      spotsLeft: Math.max(0, a.capacity - 1 - a.participants.length),
      // Who joined is visible to the group itself; others see the count.
      participants: isHost || joined ? a.participants.map((p) => ({ id: String(p.user), name: nameOf.get(String(p.user)) ?? "" })) : undefined,
      area: { name: a.area.name, point: fromPoint(a.area.point) },
      exactLocation: isHost || joined ? a.exactLocation : undefined,
      youHost: isHost, youJoined: joined,
      ...extra,
    };
  }

  app.post("/api/activities", auth, postLimit, async (req, res) => {
    const b = activityBody.parse(req.body);
    const t = now();
    if (b.fillBy <= t) throw new HttpError(400, "The fill-by deadline must be in the future", "past");
    if (b.startsAt.getTime() - t.getTime() > 60 * 864e5) throw new HttpError(400, "Activities can be at most 60 days ahead", "too-far");
    const a = await Activity.create({
      ...b, host: uid(req), school: await schoolOf(uid(req)), area: { name: b.area.name, point: toPoint(b.area.point) },
    });
    const doc = a.toObject();
    const matched = await services.matchNewActivity(doc);
    services.broadcast(doc);
    res.status(201).json({ activity: await activityDto(doc, uid(req)), matched });
  });

  /** The school's open activities: nearest first when a location is given, else soonest first. */
  app.get("/api/activities", auth, async (req, res) => {
    const q = z.object({
      category: z.enum(CATEGORIES).optional(),
      sport: z.enum(SPORTS).optional(),
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      radiusKm: z.coerce.number().min(0.2).max(50).default(10),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query);
    const blocked = [...(await blockedSet(uid(req)))].map((x) => new Types.ObjectId(x));
    const t = now();
    const filter = {
      school: await schoolOf(uid(req)), status: { $in: ["open", "full"] }, startsAt: { $gt: t }, host: { $nin: blocked },
      ...(q.category ? { category: q.category } : {}), ...(q.sport ? { sport: q.sport } : {}),
    };
    let rows;
    if (q.lat !== undefined && q.lng !== undefined) {
      rows = await Activity.aggregate([
        { $geoNear: { near: { type: "Point", coordinates: [q.lng, q.lat] }, distanceField: "distanceM", maxDistance: q.radiusKm * 1000, spherical: true, query: filter } },
        { $limit: q.limit },
      ]);
    } else {
      rows = await Activity.find(filter).sort({ startsAt: 1 }).limit(q.limit).lean();
    }
    res.json({ items: await Promise.all(rows.map((a) => activityDto(a, uid(req), a.distanceM !== undefined ? { distanceKm: Math.round(a.distanceM / 100) / 10 } : {}))) });
  });

  /** Everything I host or joined that is not over yet, plus recent past ones. */
  app.get("/api/activities/mine", auth, async (req, res) => {
    const t = now();
    const rows = await Activity.find({
      $or: [{ host: uid(req) }, { "participants.user": uid(req) }],
      endsAt: { $gt: new Date(t.getTime() - 7 * 864e5) },
    }).sort({ startsAt: 1 }).limit(100).lean();
    res.json({ items: await Promise.all(rows.map((a) => activityDto(a, uid(req)))) });
  });

  app.get("/api/activities/:id", auth, async (req, res) => {
    const a = await Activity.findById(objectId.parse(req.params.id)).lean();
    if (!a || a.school !== (await schoolOf(uid(req)))) throw new HttpError(404, "Activity not found");
    if ((await blockedSet(uid(req))).has(String(a.host))) throw new HttpError(404, "Activity not found");
    res.json(await activityDto(a, uid(req)));
  });
  app.post("/api/activities/:id/join", auth, async (req, res) => {
    const r = await services.join(objectId.parse(req.params.id), uid(req));
    res.json({ activity: await activityDto(r.activity, uid(req)), conflicts: r.conflicts });
  });
  app.post("/api/activities/:id/leave", auth, async (req, res) => {
    const a = await services.leave(objectId.parse(req.params.id), uid(req));
    res.json(await activityDto(a, uid(req)));
  });
  app.post("/api/activities/:id/decision", auth, async (req, res) => {
    const { action } = z.object({ action: z.enum(["start", "cancel"]) }).parse(req.body);
    const a = await services.decide(objectId.parse(req.params.id), uid(req), action);
    res.json(await activityDto(a, uid(req)));
  });

  // ---- looking for a buddy -----------------------------------------------------------------
  const seekDto = (s) => ({
    id: String(s._id), category: s.category, sport: s.sport, level: s.level, note: s.note, availability: s.availability,
    area: s.area ? { name: s.area.name, point: fromPoint(s.area.point) } : null, maxDistanceKm: s.maxDistanceKm,
    active: s.active, expiresAt: s.expiresAt, createdAt: s.createdAt,
  });
  async function matchesDto(s, viewer, notify) {
    const m = await services.matchNewSeek(s, notify);
    return {
      activities: await Promise.all(m.activities.map((x) => activityDto(x.activity, viewer, { score: x.score, reasons: x.reasons }))),
      buddies: m.buddies,
    };
  }
  app.post("/api/seeks", auth, postLimit, async (req, res) => {
    const b = seekBody.parse(req.body);
    const expiresAt = DateTime.fromISO(b.availability.to, { zone: b.availability.tz }).endOf("day").toJSDate();
    if (expiresAt <= now()) throw new HttpError(400, "The time window is already over", "past");
    const s = await Seek.create({
      ...b, user: uid(req), school: await schoolOf(uid(req)), expiresAt,
      area: b.area ? { name: b.area.name, point: toPoint(b.area.point) } : undefined,
    });
    const doc = s.toObject();
    res.status(201).json({ seek: seekDto(doc), matches: await matchesDto(doc, uid(req), true) });
  });
  app.get("/api/seeks/mine", auth, async (req, res) => {
    const rows = await Seek.find({ user: uid(req), active: true }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ items: rows.map(seekDto) });
  });
  app.get("/api/seeks/:id/matches", auth, async (req, res) => {
    const s = await Seek.findOne({ _id: objectId.parse(req.params.id), user: uid(req) }).lean();
    if (!s) throw new HttpError(404, "Not found");
    res.json({ seek: seekDto(s), matches: await matchesDto(s, uid(req), false) });
  });
  app.delete("/api/seeks/:id", auth, async (req, res) => {
    const r = await Seek.updateOne({ _id: objectId.parse(req.params.id), user: uid(req) }, { active: false });
    if (!r.matchedCount) throw new HttpError(404, "Not found");
    res.status(204).end();
  });

  // ---- notifications, blocking, reports ----------------------------------------------------
  app.get("/api/notifications", auth, async (req, res) => {
    const rows = await Notification.find({ user: uid(req) }).sort({ createdAt: -1 }).limit(50).populate("activity", "title startsAt").lean();
    res.json({
      unread: await Notification.countDocuments({ user: uid(req), read: false }),
      items: rows.map((n) => {
        const a = n.activity;
        return {
          id: String(n._id), type: n.type, read: n.read, createdAt: n.createdAt, params: n.params, seek: n.seek ? String(n.seek) : null,
          activity: a ? { id: String(a._id), title: a.title, startsAt: a.startsAt } : null,
        };
      }),
    });
  });
  app.post("/api/notifications/read", auth, async (req, res) => {
    await Notification.updateMany({ user: uid(req), read: false }, { read: true });
    res.status(204).end();
  });
  app.post("/api/users/:id/block", auth, async (req, res) => {
    const target = objectId.parse(req.params.id);
    if (target === uid(req)) throw new HttpError(400, "You can't block yourself");
    await User.updateOne({ _id: uid(req) }, { $addToSet: { blocked: target } });
    // Leave anything they host that hasn't started, so a blocked host can't keep you in their group.
    const theirs = await Activity.find({ host: target, "participants.user": uid(req), status: { $in: ["open", "full", "deciding", "confirmed"] }, startsAt: { $gt: now() } }, { _id: 1 }).lean();
    for (const a of theirs) await services.leave(String(a._id), uid(req)).catch(() => undefined);
    res.status(204).end();
  });
  app.post("/api/reports", auth, async (req, res) => {
    const b = z.object({ targetUser: objectId.optional(), activity: objectId.optional(), reason: z.string().trim().min(3).max(500) })
      .refine((x) => x.targetUser || x.activity, "say who or what you are reporting").parse(req.body);
    await Report.create({ ...b, reporter: uid(req) });
    res.status(201).json({ ok: true });
  });

  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));
  app.use(errorHandler);
  return { app, services };
}
