import { describe, expect, it } from "vitest";
import { bestCommonSlot, coveredMinutes, expand } from "../src/availability.js";
import { levelFit, matchActivity, matchSeekers } from "../src/matching.js";
import { schoolForEmail } from "../src/schools.js";

// Monday 2026-11-16 … Sunday 2026-11-22. New York is UTC-5 in November.
const weekdayEvenings = { from: "2026-11-16", to: "2026-11-22", days: [1, 2, 3, 4, 5], start: "18:00", end: "22:00", tz: "America/New_York" };
const now = new Date("2026-11-16T12:00:00Z"); // Monday 7 am in New York
const at = (iso) => new Date(iso);

const seek = (over = {}) => ({
  id: "s1",
  user: "u1",
  school: "upenn.edu",
  category: "sports",
  sport: "badminton",
  level: "intermediate",
  availability: weekdayEvenings,
  point: { lat: 39.9522, lng: -75.1932 },
  maxDistanceKm: 5,
  ...over
});
const act = (over = {}) => ({
  id: "a1",
  host: "u2",
  school: "upenn.edu",
  category: "sports",
  sport: "badminton",
  level: "intermediate",
  startsAt: at("2026-11-18T23:00:00Z"),

  // Wed 6–8 pm New York
  endsAt: at("2026-11-19T01:00:00Z"),

  fillBy: at("2026-11-18T21:00:00Z"),
  point: { lat: 39.9500, lng: -75.1900 },
  spotsLeft: 2,
  ...over
});

describe("schools", () => {
  it("maps email domains, including subdomains, to a school", () => {
    expect(schoolForEmail("jane@upenn.edu")?.name).toBe("University of Pennsylvania");
    expect(schoolForEmail("jane@seas.upenn.edu")?.domain).toBe("upenn.edu");
    expect(schoolForEmail("JANE@Alumni.UPenn.edu")?.domain).toBe("upenn.edu");
    expect(schoolForEmail("someone@gmail.com")).toBeNull();
    expect(schoolForEmail("not-an-email")).toBeNull();
  });
});

describe("availability", () => {
  it("expands weekday evenings in the poster's time zone", () => {
    const slots = expand(weekdayEvenings, at("2026-11-16T00:00:00Z"), at("2026-11-23T12:00:00Z"));
    expect(slots).toHaveLength(5);
    expect(slots[0].start.toUTC().toISO()).toBe("2026-11-16T23:00:00.000Z"); // 6 pm EST
  });

  it("handles windows that cross midnight and DST changes", () => {
    const late = { ...weekdayEvenings, from: "2026-03-06", to: "2026-03-09", days: [5, 6, 7, 1], start: "21:00", end: "01:00" };
    const slots = expand(late, at("2026-03-01T00:00:00Z"), at("2026-03-12T00:00:00Z"));
    expect(slots.map((s) => s.length("hours"))).toEqual([4, 4, 4, 4]);
    expect(slots[0].start.toUTC().toISO()).toBe("2026-03-07T02:00:00.000Z"); // Fri 9 pm EST
    expect(slots[3].start.toUTC().toISO()).toBe("2026-03-10T01:00:00.000Z"); // Mon 9 pm EDT, after the switch
  });

  it("measures overlap and the best common slot", () => {
    expect(coveredMinutes(weekdayEvenings, at("2026-11-18T22:00:00Z"), at("2026-11-19T00:00:00Z"))).toBe(60);
    const lunch = { ...weekdayEvenings, start: "19:30", end: "23:00" };
    const slot = bestCommonSlot(weekdayEvenings, lunch, now);
    expect(slot.length("minutes")).toBe(150);
  });
});

describe("matching", () => {
  it("scores a fitting activity and explains why", () => {
    const m = matchActivity(seek(), act(), now);
    expect(m.components.time).toBe(1);
    expect(m.components.level).toBe(1);
    expect(m.score).toBeGreaterThan(0.8);
    expect(m.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["time.fits", "level.match", "distance"]));
  });

  it("applies hard filters", () => {
    expect(matchActivity(seek(), act({ school: "temple.edu" }), now)).toBeNull();
    expect(matchActivity(seek(), act({ sport: "tennis" }), now)).toBeNull();
    expect(matchActivity(seek(), act({ host: "u1" }), now)).toBeNull();
    expect(matchActivity(seek(), act(), now, new Set(["u2"]))).toBeNull();
    expect(matchActivity(seek(), act({ spotsLeft: 0 }), now)).toBeNull();
    expect(matchActivity(seek(), act({ startsAt: at("2026-11-18T15:00:00Z"), endsAt: at("2026-11-18T17:00:00Z") }), now)).toBeNull(); // 10 am
    expect(matchActivity(seek({ level: "beginner" }), act({ level: "advanced" }), now)).toBeNull();
    expect(matchActivity(seek(), act({ point: { lat: 40.1, lng: -75.19 } }), now)).toBeNull(); // 16 km
    expect(matchActivity(seek(), act({ fillBy: at("2026-11-16T11:00:00Z") }), now)).toBeNull();
  });

  it("partial time overlap and urgency change the score", () => {
    const partial = matchActivity(seek(), act({ startsAt: at("2026-11-18T22:00:00Z"), endsAt: at("2026-11-19T00:00:00Z") }), now);
    expect(partial.components.time).toBe(0.5);
    const urgent = matchActivity(seek(), act({ fillBy: at("2026-11-16T13:00:00Z") }), now);
    expect(urgent.reasons.map((r) => r.code)).toContain("urgent");
    expect(levelFit("any", "advanced")).toBe(0.8);
  });

  it("pairs two seekers on their longest common slot", () => {
    const m = matchSeekers(seek(), seek({ id: "s2", user: "u3", availability: { ...weekdayEvenings, start: "20:00", end: "23:00" } }), now);
    expect(m.slot.end.getTime() - m.slot.start.getTime()).toBe(2 * 3600_000);
    expect(matchSeekers(seek(), seek({ id: "s2", user: "u3", category: "study", sport: null }), now)).toBeNull();
  });
});
