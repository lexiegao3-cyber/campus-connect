import { beforeEach, describe, expect, it } from "vitest";
import app from "../src/index";
import { foldLine, toICalendar } from "../src/ics";
import { likePattern } from "../src/events";
import { verifyPassword, hashPassword } from "../src/crypto";
import { createD1 } from "./d1-shim";

const SECRET = "x".repeat(40);
let env: { DB: D1Database; SESSION_SECRET: string };

beforeEach(() => {
  env = { DB: createD1(), SESSION_SECRET: SECRET };
});

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const soon = (h: number) => Date.now() + h * HOUR;

async function call(method: string, path: string, opts: { token?: string; json?: unknown } = {}) {
  const res = await app.request(
    `/api${path}`,
    {
      method,
      headers: {
        ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.json !== undefined ? JSON.stringify(opts.json) : undefined,
    },
    env,
  );
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON (ics) */
  }
  return { status: res.status, data };
}

async function user(name: string) {
  const r = await call("POST", "/auth/register", { json: { email: `${name}@upenn.edu`, password: "password123", displayName: name } });
  expect(r.status).toBe(201);
  return r.data.token as string;
}

async function event(token: string, over: Record<string, unknown> = {}) {
  const r = await call("POST", "/events", {
    token,
    json: {
      title: "Quant Club: Market Making 101",
      description: "Intro talk, pizza provided",
      category: "career",
      location: "Huntsman Hall G06",
      latitude: 39.9529,
      longitude: -75.1983,
      startsAt: iso(soon(24)),
      endsAt: iso(soon(26)),
      ...over,
    },
  });
  expect(r.status).toBe(201);
  return r.data;
}

describe("auth", () => {
  it("hashes with PBKDF2 and rejects wrong passwords", async () => {
    const h = await hashPassword("password123");
    expect(h.startsWith("pbkdf2$100000$")).toBe(true);
    expect(await verifyPassword("password123", h)).toBe(true);
    expect(await verifyPassword("password124", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("register, duplicate, login and token checks", async () => {
    await user("ada");
    expect((await call("POST", "/auth/register", { json: { email: "ADA@upenn.edu", password: "password123", displayName: "A" } })).status).toBe(409);
    expect((await call("POST", "/auth/login", { json: { email: "ada@upenn.edu", password: "wrong-pass" } })).status).toBe(401);
    const ok = await call("POST", "/auth/login", { json: { email: "ada@upenn.edu", password: "password123" } });
    expect(ok.status).toBe(200);
    expect((await call("GET", "/me", { token: ok.data.token })).data.email).toBe("ada@upenn.edu");
    expect((await call("GET", "/me", { token: "bad.token.here" })).status).toBe(401);
    expect((await call("POST", "/events", { json: {} })).status).toBe(401);
  });
});

describe("events", () => {
  it("validates input with field-level errors", async () => {
    const t = await user("ada");
    const base = { title: "Study group", category: "academic", location: "Van Pelt Library" };
    const shape = await call("POST", "/events", { token: t, json: { ...base, title: "x", category: "party", startsAt: iso(soon(1)), endsAt: iso(soon(2)) } });
    expect(shape.status).toBe(400);
    expect(shape.data.issues.map((i: { path: string }) => i.path)).toEqual(["title", "category"]);

    const rules = await call("POST", "/events", { token: t, json: { ...base, latitude: 10, startsAt: iso(soon(2)), endsAt: iso(soon(1)) } });
    expect(rules.data.issues.map((i: { path: string }) => i.path)).toEqual(["endsAt", "longitude"]);

    const past = await call("POST", "/events", { token: t, json: { ...base, startsAt: iso(soon(-48)), endsAt: iso(soon(-47)) } });
    expect(past.data.issues[0].path).toBe("startsAt");
    expect((await call("POST", "/events", { token: t, json: "not-an-object" })).status).toBe(400);
  });

  it("filters by category, searches literally, and paginates with a keyset cursor", async () => {
    const t = await user("ada");
    for (let i = 0; i < 5; i++) await event(t, { title: `Tech talk ${i}`, category: "tech", startsAt: iso(soon(10 + i)), endsAt: iso(soon(11 + i)) });
    await event(t, { title: "100% attendance social", category: "social" });

    const p1 = await call("GET", "/events?category=tech&limit=2");
    expect(p1.data.items.map((e: any) => e.title)).toEqual(["Tech talk 0", "Tech talk 1"]);
    const p2 = await call("GET", `/events?category=tech&limit=2&cursor=${encodeURIComponent(p1.data.nextCursor)}`);
    expect(p2.data.items.map((e: any) => e.title)).toEqual(["Tech talk 2", "Tech talk 3"]);
    const p3 = await call("GET", `/events?category=tech&limit=2&cursor=${encodeURIComponent(p2.data.nextCursor)}`);
    expect(p3.data.items).toHaveLength(1);
    expect(p3.data.nextCursor).toBeNull();

    expect((await call("GET", "/events?q=100%25")).data.items.map((e: any) => e.title)).toEqual(["100% attendance social"]);
    expect((await call("GET", "/events?q=%25")).data.items).toHaveLength(1); // '%' is literal, not a wildcard
    expect(likePattern("a_b%")).toBe("%a\\_b\\%%");
    expect((await call("GET", "/events?cursor=!!!")).status).toBe(400);
  });

  it("returns map links and only lets the organizer edit or cancel", async () => {
    const ada = await user("ada");
    const bob = await user("bob");
    const e = await event(ada);
    expect(e.maps.openStreetMap).toContain("mlat=39.9529");
    expect((await call("PATCH", `/events/${e.id}`, { token: bob, json: { title: "Hijacked" } })).status).toBe(403);
    const upd = await call("PATCH", `/events/${e.id}`, { token: ada, json: { title: "Market Making 101 (moved)", latitude: null, longitude: null } });
    expect(upd.data.title).toBe("Market Making 101 (moved)");
    expect(upd.data.maps.openStreetMap).toContain("search?query=Huntsman");
    expect((await call("DELETE", `/events/${e.id}`, { token: ada })).status).toBe(204);
    expect((await call("GET", "/events")).data.items).toHaveLength(0);
    expect((await call("PUT", `/events/${e.id}/rsvp`, { token: bob })).status).toBe(409);
  });
});

describe("RSVPs", () => {
  it("are duplicate-safe", async () => {
    const ada = await user("ada");
    const bob = await user("bob");
    const e = await event(ada);
    const first = await call("PUT", `/events/${e.id}/rsvp`, { token: bob });
    const again = await call("PUT", `/events/${e.id}/rsvp`, { token: bob });
    expect([first.status, again.status]).toEqual([201, 200]);
    expect(again.data.status).toBe("going");
    const detail = await call("GET", `/events/${e.id}`, { token: bob });
    expect(detail.data.goingCount).toBe(1);
    expect(detail.data.myStatus).toBe("going");
  });

  it("enforce capacity with a FIFO waitlist and promote on cancellation", async () => {
    const org = await user("org");
    const [a, b, c] = [await user("a"), await user("b"), await user("c")];
    const e = await event(org, { capacity: 1 });

    expect((await call("PUT", `/events/${e.id}/rsvp`, { token: a })).data.status).toBe("going");
    expect((await call("PUT", `/events/${e.id}/rsvp`, { token: b })).data.status).toBe("waitlist");
    expect((await call("PUT", `/events/${e.id}/rsvp`, { token: c })).data.status).toBe("waitlist");

    expect((await call("DELETE", `/events/${e.id}/rsvp`, { token: a })).status).toBe(204);
    expect((await call("GET", `/events/${e.id}`, { token: b })).data.myStatus).toBe("going");
    expect((await call("GET", `/events/${e.id}`, { token: c })).data.myStatus).toBe("waitlist");

    // A waitlisted user leaving must not promote anyone past capacity.
    expect((await call("DELETE", `/events/${e.id}/rsvp`, { token: c })).status).toBe(204);
    const after = (await call("GET", `/events/${e.id}`)).data;
    expect([after.goingCount, after.waitlistCount, after.seatsLeft]).toEqual([1, 0, 0]);
    expect((await call("DELETE", `/events/${e.id}/rsvp`, { token: c })).status).toBe(404);
  });

  it("raising capacity admits the waitlist; lowering below attendance is rejected", async () => {
    const org = await user("org");
    const people = [await user("p1"), await user("p2"), await user("p3")];
    const e = await event(org, { capacity: 1 });
    for (const p of people) await call("PUT", `/events/${e.id}/rsvp`, { token: p });

    expect((await call("PATCH", `/events/${e.id}`, { token: org, json: { capacity: 2 } })).data.goingCount).toBe(2);
    expect((await call("PATCH", `/events/${e.id}`, { token: org, json: { capacity: 1 } })).status).toBe(409);
    const open = (await call("PATCH", `/events/${e.id}`, { token: org, json: { capacity: null } })).data;
    expect([open.goingCount, open.waitlistCount, open.seatsLeft]).toEqual([3, 0, null]);
  });

  it("report schedule conflicts and power personal lists and calendar export", async () => {
    const org = await user("org");
    const me = await user("me");
    const a = await event(org, { title: "Algorithms review", startsAt: iso(soon(5)), endsAt: iso(soon(7)) });
    const b = await event(org, { title: "Career fair; Day 1", startsAt: iso(soon(6)), endsAt: iso(soon(8)) });
    await event(org, { title: "Later thing", startsAt: iso(soon(7)), endsAt: iso(soon(9)) });

    await call("PUT", `/events/${a.id}/rsvp`, { token: me });
    const r = await call("PUT", `/events/${b.id}/rsvp`, { token: me });
    expect(r.data.conflicts.map((x: any) => x.title)).toEqual(["Algorithms review"]);

    const mine = await call("GET", "/events?mine=going", { token: me });
    expect(mine.data.items.map((e: any) => e.title)).toEqual(["Algorithms review", "Career fair; Day 1"]);
    expect((await call("GET", "/events?mine=going")).status).toBe(401);

    const ics = await call("GET", "/me/calendar.ics", { token: me });
    expect(ics.status).toBe(200);
    expect(ics.data).toContain("SUMMARY:Career fair\\; Day 1");
    expect(ics.data.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });
});

describe("iCalendar", () => {
  it("folds long lines at 75 octets without splitting characters", () => {
    const line = "DESCRIPTION:" + "é".repeat(80);
    const folded = foldLine(line).split("\r\n");
    for (const l of folded) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(line);
    expect(toICalendar([], "x")).toMatch(/^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
  });
});
