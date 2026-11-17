import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Activity } from "../src/models.js";
import { GYM, LIBRARY, setupApp } from "./helpers.js";

let t: Awaited<ReturnType<typeof setupApp>>;
beforeAll(async () => (t = await setupApp("api")));
afterAll(() => t.close());

const weekdayEvenings = { from: "2026-11-16", to: "2026-11-22", days: [1, 2, 3, 4, 5], start: "18:00", end: "22:00", tz: "America/New_York" };
const badminton = (over: Record<string, unknown> = {}) => ({
  title: "Badminton doubles", category: "sports", sport: "badminton", level: "intermediate",
  startsAt: "2026-11-18T18:00:00-05:00", endsAt: "2026-11-18T20:00:00-05:00", fillBy: "2026-11-18T16:00:00-05:00",
  capacity: 4, area: { name: "Near Pottruck Gym", point: GYM }, exactLocation: "Court 3, Pottruck", ...over,
});

describe("sign in", () => {
  it("derives the school from the email domain and rejects non-school email", async () => {
    const res = await request(t.app).post("/api/auth/dev").send({ email: "Ann@SEAS.upenn.edu", name: "Ann" }).expect(200);
    expect(res.body.user.school).toMatchObject({ domain: "upenn.edu", name: "University of Pennsylvania" });
    const bad = await request(t.app).post("/api/auth/dev").send({ email: "ann@gmail.com", name: "Ann" }).expect(403);
    expect(bad.body.code).toBe("not-school");
    await request(t.app).get("/api/me").expect(401);
  });

  it("signs in with a verified Google credential", async () => {
    const res = await request(t.app).post("/api/auth/google").send({ credential: "valid-google-credential-xyz" }).expect(200);
    expect(res.body.user).toMatchObject({ email: "gina@upenn.edu", school: { domain: "upenn.edu" } });
    await request(t.app).post("/api/auth/google").send({ credential: "forged-credential-0000000000" }).expect(401);
  });
});

describe("activities, matching and joining", () => {
  it("notifies people whose 'looking for' posts fit a new activity, with reasons", async () => {
    const host = await t.signIn("host@upenn.edu", "Hana");
    const ben = await t.signIn("ben@upenn.edu", "Ben");
    const cat = await t.signIn("cat@upenn.edu", "Cat");
    const tem = await t.signIn("tom@temple.edu", "Tom");
    const seek = (h: Record<string, string>, over: Record<string, unknown> = {}) =>
      request(t.app).post("/api/seeks").set(h).send({ category: "sports", sport: "badminton", level: "intermediate", availability: weekdayEvenings, area: { name: "Library", point: LIBRARY }, ...over });
    await seek(ben.h).expect(201);
    await seek(cat.h, { availability: { ...weekdayEvenings, start: "08:00", end: "12:00" } }).expect(201); // mornings only
    await seek(tem.h).expect(201); // other school

    const res = await request(t.app).post("/api/activities").set(host.h).send(badminton()).expect(201);
    expect(res.body.matched.map((m: { user: { name: string } }) => m.user.name)).toEqual(["Ben"]);
    expect(res.body.matched[0].reasons.map((r: { code: string }) => r.code)).toEqual(expect.arrayContaining(["time.fits", "level.match", "distance"]));
    expect(t.events.some((e) => e.to === `user:${ben.id}` && e.event === "notification")).toBe(true);
    expect(t.events.some((e) => e.to === `user:${cat.id}`)).toBe(false);
  });

  it("a new 'looking for' post finds open activities and other seekers", async () => {
    const dan = await t.signIn("dan@upenn.edu", "Dan");
    const res = await request(t.app).post("/api/seeks").set(dan.h).send({ category: "sports", sport: "badminton", level: "any", availability: weekdayEvenings }).expect(201);
    expect(res.body.matches.activities[0].title).toBe("Badminton doubles");
    expect(res.body.matches.activities[0].exactLocation).toBeUndefined(); // not joined yet
    expect(res.body.matches.buddies.map((b: { user: { name: string } }) => b.user.name)).toContain("Ben");
  });

  it("joins atomically: never more people than capacity, even all at once", async () => {
    const host = await t.signIn("h2@upenn.edu");
    const a = (await request(t.app).post("/api/activities").set(host.h).send(badminton({ capacity: 3, title: "Race test" })).expect(201)).body.activity;
    const people = await Promise.all(Array.from({ length: 8 }, (_, i) => t.signIn(`racer${i}@upenn.edu`)));
    const results = await Promise.all(people.map((p) => request(t.app).post(`/api/activities/${a.id}/join`).set(p.h)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.code === "full")).toBe(true);
    const doc = await Activity.findById(a.id).lean();
    expect(doc!.participants).toHaveLength(2);
    expect(doc!.status).toBe("full");
    const winner = people[results.findIndex((r) => r.status === 200)]!;
    const view = await request(t.app).get(`/api/activities/${a.id}`).set(winner.h).expect(200);
    expect(view.body.exactLocation).toBe("Court 3, Pottruck");
    // Leaving reopens a spot.
    await request(t.app).post(`/api/activities/${a.id}/leave`).set(winner.h).expect(200);
    expect((await Activity.findById(a.id).lean())!.status).toBe("open");
  });

  it("validates times and scopes everything to the school", async () => {
    const host = await t.signIn("h3@upenn.edu");
    await request(t.app).post("/api/activities").set(host.h).send(badminton({ fillBy: "2026-11-18T19:00:00-05:00" })).expect(400);
    await request(t.app).post("/api/activities").set(host.h).send(badminton({ sport: undefined })).expect(400);
    await request(t.app).post("/api/activities").set(host.h).send(badminton({ fillBy: "2026-11-15T10:00:00-05:00" })).expect(400);
    const a = (await request(t.app).post("/api/activities").set(host.h).send(badminton({ title: "Penn only" })).expect(201)).body.activity;
    const other = await t.signIn("x@temple.edu");
    await request(t.app).get(`/api/activities/${a.id}`).set(other.h).expect(404);
    await request(t.app).post(`/api/activities/${a.id}/join`).set(host.h).expect(409);
    const near = await request(t.app).get("/api/activities").set(host.h).query({ lat: LIBRARY.lat, lng: LIBRARY.lng, radiusKm: 2 }).expect(200);
    expect(near.body.items[0].distanceKm).toBeCloseTo(0.3, 0);
    expect((await request(t.app).get("/api/activities").set(other.h).expect(200)).body.items).toHaveLength(0);
  });

  it("blocking hides each other and leaves their activities", async () => {
    const host = await t.signIn("h4@upenn.edu", "Hal");
    const eve = await t.signIn("eve@upenn.edu", "Eve");
    const a = (await request(t.app).post("/api/activities").set(host.h).send(badminton({ title: "Block test" })).expect(201)).body.activity;
    await request(t.app).post(`/api/activities/${a.id}/join`).set(eve.h).expect(200);
    await request(t.app).post(`/api/users/${host.id}/block`).set(eve.h).expect(204);
    expect((await Activity.findById(a.id).lean())!.participants).toHaveLength(0);
    await request(t.app).get(`/api/activities/${a.id}`).set(eve.h).expect(404);
    const list = await request(t.app).get("/api/activities").set(eve.h).expect(200);
    expect(list.body.items.map((x: { id: string }) => x.id)).not.toContain(a.id);
    await request(t.app).post(`/api/activities/${a.id}/join`).set(eve.h).expect(403);
  });
});

describe("fill-by deadline", () => {
  it("not full at the deadline: host decides, joiners are told; undecided at start: auto-cancel", async () => {
    const host = await t.signIn("dl-host@upenn.edu", "Dina");
    const fay = await t.signIn("fay@upenn.edu", "Fay");
    const a = (await request(t.app).post("/api/activities").set(host.h).send(badminton({ title: "Deadline A" })).expect(201)).body.activity;
    await request(t.app).post(`/api/activities/${a.id}/join`).set(fay.h).expect(200);
    t.events.length = 0;
    t.clock.now = new Date("2026-11-18T21:01:00Z"); // 4:01 pm New York, after fill-by
    const out = await t.services.sweep();
    expect(out.deciding).toBeGreaterThanOrEqual(1);
    expect((await Activity.findById(a.id).lean())!.status).toBe("deciding");
    const types = (u: string) => t.events.filter((e) => e.to === `user:${u}`).map((e) => (e.payload as { type: string }).type);
    expect(types(host.id)).toContain("deadline");
    expect(types(fay.id)).toContain("closed");
    expect((await t.services.sweep()).deciding).toBe(0); // idempotent
    const late = await t.signIn("late@upenn.edu");
    await request(t.app).post(`/api/activities/${a.id}/join`).set(late.h).expect(409);

    // Host starts with who joined.
    await request(t.app).post(`/api/activities/${a.id}/decision`).set(fay.h).send({ action: "start" }).expect(409);
    const started = await request(t.app).post(`/api/activities/${a.id}/decision`).set(host.h).send({ action: "start" }).expect(200);
    expect(started.body.status).toBe("confirmed");
    expect(types(fay.id)).toContain("confirmed");
    t.clock.now = new Date("2026-11-16T12:00:00Z");
  });

  it("a full activity also waits for the host; nobody deciding means auto-cancel", async () => {
    const host = await t.signIn("dl2@upenn.edu");
    const g = await t.signIn("g@upenn.edu");
    const full = (await request(t.app).post("/api/activities").set(host.h).send(badminton({ title: "Full one", capacity: 2 })).expect(201)).body.activity;
    await request(t.app).post(`/api/activities/${full.id}/join`).set(g.h).expect(200);
    const lonely = (await request(t.app).post("/api/activities").set(host.h).send(badminton({ title: "Lonely one" })).expect(201)).body.activity;
    t.events.length = 0;
    t.clock.now = new Date("2026-11-18T21:01:00Z");
    await t.services.sweep();
    expect((await Activity.findById(full.id).lean())!.status).toBe("deciding");
    const deadline = t.events.find((e) => e.to === `user:${host.id}` && (e.payload as { type: string; activity: { id: string } }).activity?.id === full.id);
    expect(deadline?.payload).toMatchObject({ type: "deadline", params: { full: true, joined: 2, capacity: 2 } });
    await request(t.app).post(`/api/activities/${full.id}/decision`).set(host.h).send({ action: "start" }).expect(200);
    expect((await Activity.findById(full.id).lean())!.status).toBe("confirmed");
    t.clock.now = new Date("2026-11-18T23:00:01Z"); // start time, host never decided on the other one
    await t.services.sweep();
    expect((await Activity.findById(lonely.id).lean())!.status).toBe("cancelled");
    t.clock.now = new Date("2026-11-19T01:00:01Z");
    expect((await t.services.sweep()).done).toBeGreaterThanOrEqual(1);
    expect((await Activity.findById(full.id).lean())!.status).toBe("done");
    t.clock.now = new Date("2026-11-16T12:00:00Z");
  });
});
