import { HttpError } from "./errors.js";
import { matchActivity, matchSeekers } from "./matching.js";
import { Activity, fromPoint, Notification, Seek, User } from "./models.js";

const MAX_NOTIFIED_PER_POST = 20;
const id = (x) => String(x);

export const asActivityLike = a => ({
  id: id(a._id),
  host: id(a.host),
  school: a.school,
  category: a.category,
  sport: a.sport,
  level: a.level,
  startsAt: a.startsAt,
  endsAt: a.endsAt,
  fillBy: a.fillBy,
  point: fromPoint(a.area?.point),
  spotsLeft: a.capacity - 1 - a.participants.length
});

export const asSeekLike = s => ({
  id: id(s._id),
  user: id(s.user),
  school: s.school,
  category: s.category,
  sport: s.sport,
  level: s.level,
  availability: s.availability,
  point: fromPoint(s.area?.point),
  maxDistanceKm: s.maxDistanceKm
});

/** Users either side has blocked: they never see or join each other's posts. */
export async function blockedSet(userId) {
  const [me, blockers] = await Promise.all([
    User.findById(userId, { blocked: 1 }).lean(),
    User.find({ blocked: userId }, { _id: 1 }).lean(),
  ]);
  return new Set([...(me?.blocked ?? []).map(id), ...blockers.map((b) => id(b._id))]);
}

export class Services {
  constructor(hub, now = () => new Date()) {
    this.hub = hub;
    this.now = now;
  }

  async notify(userId, type, refs, params = {}) {
    const n = await Notification.create({ user: userId, type, activity: refs.activity?._id, seek: refs.seek, params });
    this.hub.toUser(userId, "notification", {
      id: id(n._id), type, read: false, createdAt: n.createdAt, params,
      activity: refs.activity ? { id: id(refs.activity._id), title: refs.activity.title, startsAt: refs.activity.startsAt } : null,
      seek: refs.seek ?? null,
    });
  }

  /** Tell the school feed an activity changed, so open screens update without a refresh. */
  broadcast(a) {
    this.hub.toSchool(a.school, "activity", {
      id: id(a._id), status: a.status, joined: a.participants.length + 1, capacity: a.capacity,
    });
  }

  /** New activity: find people whose "looking for" posts fit it, notify the best ones, show the host who. */
  async matchNewActivity(a) {
    const now = this.now();
    const [seeks, blocked] = await Promise.all([
      Seek.find({
        school: a.school, category: a.category, active: true, expiresAt: { $gt: now }, user: { $ne: a.host },
        ...(a.sport ? { sport: { $in: [a.sport, null] } } : {}),
      }).limit(500).lean(),
      blockedSet(id(a.host)),
    ]);
    const act = asActivityLike(a);
    const best = new Map(); // one per person, their best post
    for (const s of seeks) {
      const m = matchActivity(asSeekLike(s), act, now, blocked);
      if (m && (!best.has(id(s.user)) || best.get(id(s.user)).match.score < m.score)) best.set(id(s.user), { seek: s, match: m });
    }
    const top = [...best.values()].sort((x, y) => y.match.score - x.match.score).slice(0, MAX_NOTIFIED_PER_POST);
    await Promise.all(top.map((t) => this.notify(id(t.seek.user), "match", { activity: a, seek: id(t.seek._id) }, { score: t.match.score, reasons: t.match.reasons })));
    const names = await User.find({ _id: { $in: top.map((t) => t.seek.user) } }, { name: 1 }).lean();
    const nameOf = new Map(names.map((u) => [id(u._id), u.name]));
    return top.map((t) => ({ user: { id: id(t.seek.user), name: nameOf.get(id(t.seek.user)) ?? "" }, seek: id(t.seek._id), ...t.match }));
  }

  /** New "looking for" post: open activities that fit, and other people looking for the same thing. */
  async matchNewSeek(s, notifyOthers = true) {
    const now = this.now();
    const sportFilter = s.sport ? { sport: { $in: [s.sport, null] } } : {};
    const [acts, others, blocked] = await Promise.all([
      Activity.find({ school: s.school, category: s.category, status: "open", fillBy: { $gt: now }, startsAt: { $gt: now }, ...sportFilter })
        .sort({ startsAt: 1 }).limit(500).lean(),
      Seek.find({ school: s.school, category: s.category, active: true, expiresAt: { $gt: now }, user: { $ne: s.user }, _id: { $ne: s._id }, ...sportFilter })
        .limit(500).lean(),
      blockedSet(id(s.user)),
    ]);
    const me = asSeekLike(s);
    const activities = acts
      .filter((a) => !a.participants.some((p) => id(p.user) === me.user))
      .map((a) => ({ a, m: matchActivity(me, asActivityLike(a), now, blocked) }))
      .filter(x => x.m !== null)
      .sort((x, y) => y.m.score - x.m.score)
      .slice(0, 10);
    const buddies = others
      .map((o) => ({ o, m: matchSeekers(me, asSeekLike(o), now, blocked) }))
      .filter(x => x.m !== null)
      .sort((x, y) => y.m.score - x.m.score);
    const seen = new Set();
    const topBuddies = buddies.filter((b) => !seen.has(id(b.o.user)) && seen.add(id(b.o.user))).slice(0, 10);
    if (notifyOthers) {
      await Promise.all(topBuddies.slice(0, 5).map((b) =>
        this.notify(id(b.o.user), "seek-match", { seek: id(b.o._id) }, { otherSeek: id(s._id), category: s.category, sport: s.sport, slot: b.m.slot, reasons: b.m.reasons }),
      ));
    }
    const users = await User.find({ _id: { $in: [...topBuddies.map((b) => b.o.user), ...activities.map((x) => x.a.host)] } }, { name: 1 }).lean();
    const nameOf = new Map(users.map((u) => [id(u._id), u.name]));
    return {
      activities: activities.map((x) => ({ activity: x.a, hostName: nameOf.get(id(x.a.host)) ?? "", ...x.m })),
      buddies: topBuddies.map((b) => ({
        user: { id: id(b.o.user), name: nameOf.get(id(b.o.user)) ?? "" }, seek: id(b.o._id), note: b.o.note, level: b.o.level,
        score: b.m.score, reasons: b.m.reasons, slot: b.m.slot,
      })),
    };
  }

  /**
   * Join in one conditional update: open, before the deadline, not already in,
   * and a free spot counted inside the same query, so two people can never take
   * the last spot.
   */
  async join(activityId, userId) {
    const blocked = await blockedSet(userId);
    const now = this.now();
    const a = await Activity.findOneAndUpdate(
      {
        _id: activityId, status: "open", fillBy: { $gt: now }, host: { $nin: [userId, ...blocked] },
        "participants.user": { $ne: userId },
        $expr: { $lt: [{ $add: [{ $size: "$participants" }, 1] }, "$capacity"] },
      },
      { $push: { participants: { user: userId, joinedAt: now } } },
      { returnDocument: "after" },
    ).lean();
    if (!a) {
      const cur = await Activity.findById(activityId).lean();
      if (!cur) throw new HttpError(404, "Activity not found");
      if (id(cur.host) === userId) throw new HttpError(409, "You are hosting this", "host");
      if (cur.participants.some((p) => id(p.user) === userId)) throw new HttpError(409, "You already joined", "joined");
      if (blocked.has(id(cur.host))) throw new HttpError(403, "You can't join this activity", "blocked");
      if (cur.status === "full" || cur.participants.length + 1 >= cur.capacity) throw new HttpError(409, "No spots left", "full");
      throw new HttpError(409, "This activity is no longer taking people", "closed");
    }
    let doc = a;
    if (a.participants.length + 1 >= a.capacity) {
      doc = (await Activity.findOneAndUpdate({ _id: a._id, status: "open" }, { status: "full" }, { returnDocument: "after" }).lean()) ?? a;
    }
    const me = await User.findById(userId, { name: 1 }).lean();
    await this.notify(id(a.host), "joined", { activity: doc }, { name: me?.name ?? "", joined: doc.participants.length + 1, capacity: doc.capacity });
    if (doc.status === "full") {
      await Promise.all([id(doc.host), ...doc.participants.map((p) => id(p.user))].map((u) => this.notify(u, "full", { activity: doc })));
    }
    this.broadcast(doc);
    const conflicts = await Activity.find({
      _id: { $ne: doc._id }, status: { $in: ["open", "full", "deciding", "confirmed"] },
      $or: [{ host: userId }, { "participants.user": userId }],
      startsAt: { $lt: doc.endsAt }, endsAt: { $gt: doc.startsAt },
    }, { title: 1, startsAt: 1 }).lean();
    return { activity: doc, conflicts: conflicts.map((c) => ({ id: id(c._id), title: c.title, startsAt: c.startsAt })) };
  }

  async leave(activityId, userId) {
    const now = this.now();
    const a = await Activity.findOneAndUpdate(
      { _id: activityId, "participants.user": userId, status: { $in: ["open", "full", "deciding", "confirmed"] }, startsAt: { $gt: now } },
      { $pull: { participants: { user: userId } } },
      { returnDocument: "after" },
    ).lean();
    if (!a) throw new HttpError(409, "You are not in this activity, or it has started", "not-joined");
    let doc = a;
    if (a.status === "full" && a.fillBy > now) {
      doc = (await Activity.findOneAndUpdate({ _id: a._id, status: "full" }, { status: "open" }, { returnDocument: "after" }).lean()) ?? a;
    } else if (a.status === "full") {
      doc = (await Activity.findOneAndUpdate({ _id: a._id, status: "full" }, { status: "deciding" }, { returnDocument: "after" }).lean()) ?? a;
    }
    const me = await User.findById(userId, { name: 1 }).lean();
    await this.notify(id(a.host), "left", { activity: doc }, { name: me?.name ?? "", joined: doc.participants.length + 1, capacity: doc.capacity });
    this.broadcast(doc);
    return doc;
  }

  /** The host starts with whoever joined, or cancels. Allowed any time before the start. */
  async decide(activityId, userId, action) {
    const now = this.now();
    const filter = { _id: activityId, host: userId, status: { $in: ["open", "full", "deciding"] }, startsAt: { $gt: now } };
    const cur = await Activity.findOne(filter).lean();
    if (!cur) throw new HttpError(409, "Only the host can decide, before the activity starts", "not-allowed");
    if (action === "start" && cur.participants.length === 0) throw new HttpError(409, "Nobody has joined yet", "empty");
    const status = action === "start" ? "confirmed" : "cancelled";
    const doc = await Activity.findOneAndUpdate({ ...filter, status: cur.status }, { status, decidedAt: now }, { returnDocument: "after" }).lean();
    if (!doc) throw new HttpError(409, "The activity changed, try again", "conflict");
    await Promise.all(doc.participants.map((p) => this.notify(id(p.user), status, { activity: doc }, { joined: doc.participants.length + 1 })));
    this.broadcast(doc);
    return doc;
  }

  /**
   * Runs every 30 s. Each transition is a conditional update on the current
   * status, so running it twice (or on two servers) never double-notifies.
   *  - fill-by passed (full or not) → "deciding": joining closes and the host
   *    confirms: start with whoever joined, or cancel. Joiners are told.
   *  - start time passed while still deciding → cancelled automatically
   *  - end time passed → done; expired "looking for" posts → inactive
   */
  async sweep() {
    const now = this.now();
    const out = { deciding: 0, autoCancelled: 0, done: 0, seeksClosed: 0 };
    for (let a; (a = await Activity.findOneAndUpdate({ status: { $in: ["open", "full"] }, fillBy: { $lte: now } }, { status: "deciding" }, { returnDocument: "after" }).lean()); ) {
      out.deciding++;
      const params = { joined: a.participants.length + 1, capacity: a.capacity, full: a.participants.length + 1 >= a.capacity };
      await this.notify(id(a.host), "deadline", { activity: a }, params);
      await Promise.all(a.participants.map((p) => this.notify(id(p.user), "closed", { activity: a }, params)));
      this.broadcast(a);
    }
    for (let a; (a = await Activity.findOneAndUpdate({ status: "deciding", startsAt: { $lte: now } }, { status: "cancelled", decidedAt: now }, { returnDocument: "after" }).lean()); ) {
      out.autoCancelled++;
      await Promise.all([id(a.host), ...a.participants.map((p) => id(p.user))].map((u) => this.notify(u, "auto-cancelled", { activity: a })));
      this.broadcast(a);
    }
    out.done = (await Activity.updateMany({ status: "confirmed", endsAt: { $lte: now } }, { status: "done" })).modifiedCount;
    out.seeksClosed = (await Seek.updateMany({ active: true, expiresAt: { $lte: now } }, { active: false })).modifiedCount;
    return out;
  }
}
