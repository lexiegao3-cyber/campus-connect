import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { ZodError, type ZodType } from "zod";
import { auth, issueSession, secretOf } from "./auth";
import { hashPassword, verifyPassword } from "./crypto";
import * as events from "./events";
import { toICalendar } from "./ics";
import * as rsvp from "./rsvp";
import { CATEGORIES, type AppEnv, type EventRow } from "./types";
import * as v from "./validation";

const app = new Hono<AppEnv>().basePath("/api");

app.use("*", secureHeaders());

async function body<T>(c: { req: { json: () => Promise<unknown> } }, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  return schema.parse(raw);
}

function eventId(raw: string): number {
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HTTPException(404, { message: "Event not found" });
  return id;
}

function present(e: EventRow) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    category: e.category,
    location: e.location,
    latitude: e.latitude,
    longitude: e.longitude,
    startsAt: new Date(e.starts_at).toISOString(),
    endsAt: new Date(e.ends_at).toISOString(),
    capacity: e.capacity,
    status: e.status,
    organizer: { id: e.organizer_id, name: e.organizer_name },
    goingCount: e.going_count,
    waitlistCount: e.waitlist_count,
    seatsLeft: rsvp.seatsLeft(e),
    myStatus: e.my_status,
    maps: events.mapLinks(e),
  };
}

// ---- auth -----------------------------------------------------------------

app.post("/auth/register", async (c) => {
  const { email, password, displayName } = await body(c, v.registration);
  const hash = await hashPassword(password);
  const row = await c.env.DB.prepare(
    `INSERT INTO users (email, display_name, password_hash, created_at) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (email) DO NOTHING RETURNING id`,
  )
    .bind(email, displayName, hash, Date.now())
    .first<{ id: number }>();
  if (!row) throw new HTTPException(409, { message: "Email is already registered" });
  return c.json({ token: await issueSession(row.id, secretOf(c.env)), user: { id: row.id, email, displayName } }, 201);
});

app.post("/auth/login", async (c) => {
  const { email, password } = await body(c, v.credentials);
  const user = await c.env.DB.prepare(`SELECT id, display_name, password_hash FROM users WHERE email = ?1`)
    .bind(email)
    .first<{ id: number; display_name: string; password_hash: string }>();
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new HTTPException(401, { message: "Invalid email or password" });
  }
  return c.json({ token: await issueSession(user.id, secretOf(c.env)), user: { id: user.id, email, displayName: user.display_name } });
});

app.get("/me", auth({ required: true }), async (c) => {
  const user = await c.env.DB.prepare(`SELECT id, email, display_name AS displayName FROM users WHERE id = ?1`)
    .bind(c.get("userId"))
    .first();
  if (!user) throw new HTTPException(401, { message: "Account no longer exists" });
  return c.json(user);
});

// ---- events ---------------------------------------------------------------

app.get("/categories", (c) => c.json(CATEGORIES));

app.get("/events", auth({ required: false }), async (c) => {
  const q = v.listQuery.parse(c.req.query());
  const viewerId = c.get("userId") ?? null;
  if (q.mine && viewerId === null) throw new HTTPException(401, { message: "Sign in to see your events" });
  const cursor = q.cursor ? events.decodeCursor(q.cursor) : undefined;
  if (cursor === null) throw new HTTPException(400, { message: "Invalid cursor" });
  const page = await events.listEvents(c.env.DB, {
    viewerId,
    q: q.q || undefined,
    category: q.category,
    from: q.from ? Date.parse(q.from) : Date.now(),
    to: q.to ? Date.parse(q.to) : undefined,
    mine: q.mine,
    cursor,
    limit: q.limit,
  });
  return c.json({ items: page.items.map(present), nextCursor: page.nextCursor });
});

app.get("/events/:id", auth({ required: false }), async (c) => {
  const e = await events.getEvent(c.env.DB, eventId(c.req.param("id")), c.get("userId") ?? null);
  if (!e) throw new HTTPException(404, { message: "Event not found" });
  return c.json(present(e));
});

app.post("/events", auth({ required: true }), async (c) => {
  const input = await body(c, v.createEvent);
  const id = await events.insertEvent(c.env.DB, c.get("userId")!, input);
  return c.json(present((await events.getEvent(c.env.DB, id, c.get("userId")!))!), 201);
});

async function ownedEvent(c: { env: AppEnv["Bindings"]; get: (k: "userId") => number | undefined }, id: number) {
  const e = await events.getEvent(c.env.DB, id, c.get("userId")!);
  if (!e) throw new HTTPException(404, { message: "Event not found" });
  if (e.organizer_id !== c.get("userId")) throw new HTTPException(403, { message: "Only the organizer can change this event" });
  return e;
}

app.patch("/events/:id", auth({ required: true }), async (c) => {
  const id = eventId(c.req.param("id"));
  const patch = await body(c, v.updateEvent);
  const current = await ownedEvent(c, id);
  if (current.status === "cancelled") throw new HTTPException(409, { message: "Event is cancelled" });

  const startsAt = patch.startsAt ?? current.starts_at;
  const endsAt = patch.endsAt ?? current.ends_at;
  if (endsAt <= startsAt) throw new HTTPException(400, { message: "endsAt must be after startsAt" });
  const lat = patch.latitude === undefined ? current.latitude : patch.latitude;
  const lon = patch.longitude === undefined ? current.longitude : patch.longitude;
  if ((lat === null) !== (lon === null)) throw new HTTPException(400, { message: "latitude and longitude must be given together" });
  if (patch.capacity != null && patch.capacity < current.going_count) {
    throw new HTTPException(409, { message: `Capacity cannot drop below the ${current.going_count} people already going` });
  }

  await events.updateEvent(c.env.DB, id, patch);
  // Raising or removing the cap admits waitlisted people in FIFO order.
  if (patch.capacity === null) {
    await c.env.DB.prepare(`UPDATE rsvps SET status = 'going' WHERE event_id = ?1 AND status = 'waitlist'`).bind(id).run();
  } else if (patch.capacity !== undefined && current.capacity !== null && patch.capacity > current.capacity) {
    await rsvp.fillFreedSeats(c.env.DB, id, Math.min(current.waitlist_count, patch.capacity - current.going_count));
  }
  return c.json(present((await events.getEvent(c.env.DB, id, c.get("userId")!))!));
});

app.delete("/events/:id", auth({ required: true }), async (c) => {
  const id = eventId(c.req.param("id"));
  await ownedEvent(c, id);
  await events.cancelEvent(c.env.DB, id);
  return c.body(null, 204);
});

// ---- RSVPs ----------------------------------------------------------------

app.put("/events/:id/rsvp", auth({ required: true }), async (c) => {
  const id = eventId(c.req.param("id"));
  const result = await rsvp.join(c.env.DB, id, c.get("userId")!);
  if (result.outcome === "closed") {
    const exists = await events.getEvent(c.env.DB, id, null);
    if (!exists) throw new HTTPException(404, { message: "Event not found" });
    throw new HTTPException(409, { message: "This event is no longer accepting RSVPs" });
  }
  return c.json(
    {
      status: result.status,
      conflicts: result.conflicts.map((x) => ({
        id: x.id,
        title: x.title,
        startsAt: new Date(x.starts_at).toISOString(),
        endsAt: new Date(x.ends_at).toISOString(),
      })),
    },
    result.outcome === "joined" ? 201 : 200,
  );
});

app.delete("/events/:id/rsvp", auth({ required: true }), async (c) => {
  const { removed } = await rsvp.leave(c.env.DB, eventId(c.req.param("id")), c.get("userId")!);
  if (!removed) throw new HTTPException(404, { message: "You have not RSVP'd to this event" });
  return c.body(null, 204);
});

app.get("/me/calendar.ics", auth({ required: true }), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT e.*, u.display_name AS organizer_name, 0 AS going_count, 0 AS waitlist_count, r.status AS my_status
     FROM rsvps r JOIN events e ON e.id = r.event_id JOIN users u ON u.id = e.organizer_id
     WHERE r.user_id = ?1 AND r.status = 'going' ORDER BY e.starts_at`,
  )
    .bind(c.get("userId"))
    .all<EventRow>();
  return c.body(toICalendar(results, new URL(c.req.url).host), 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'attachment; filename="campus-connect.ics"',
  });
});

// ---- errors ---------------------------------------------------------------

app.notFound((c) => c.json({ error: "Not found" }, 404));

app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json(
      { error: "Invalid request", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      400,
    );
  }
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

export default app;
