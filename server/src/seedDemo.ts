// Demo data for one school (Penn): a few people, upcoming activities in every
// category, and "looking for" posts, so a fresh install has something to show.
//   MONGODB_URI=... npm run seed:demo [-- --reset]
import { DateTime } from "luxon";
import mongoose from "mongoose";
import { connect } from "./db.js";
import { Activity, Notification, Seek, toPoint, User } from "./models.js";
import { schoolForEmail } from "./schools.js";

const TZ = "America/New_York";
const P = {
  pottruck: { lat: 39.9534, lng: -75.1966 }, vanPelt: { lat: 39.9525, lng: -75.1932 }, houston: { lat: 39.9509, lng: -75.1938 },
  franklinField: { lat: 39.9502, lng: -75.1899 }, schuylkill: { lat: 39.9481, lng: -75.1824 }, cinema: { lat: 39.9524, lng: -75.1757 },
  chinatown: { lat: 39.9555, lng: -75.1550 }, thirtieth: { lat: 39.9557, lng: -75.1820 },
};

await connect(process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/campus-connect");
if (process.argv.includes("--reset")) await mongoose.connection.dropDatabase();
await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));

const school = schoolForEmail("demo@upenn.edu")!;
const names = ["Maya Chen", "Leo Park", "Priya Shah", "Sam Rivera", "Yuki Tanaka", "Omar Haddad", "Zoe Li", "Ethan Wu", "Ava Brooks", "Noah Kim"];
const users: { _id: mongoose.Types.ObjectId }[] = [];
for (const name of names) {
  const email = `${name.split(" ")[0]!.toLowerCase()}.demo@upenn.edu`;
  users.push((await User.findOneAndUpdate({ email }, { $setOnInsert: { email, name, school, tz: TZ } }, { upsert: true, returnDocument: "after" }))!);
}
const u = (i: number) => users[i]!._id;
const now = DateTime.now().setZone(TZ);
const at = (dayOffset: number, hh: number, mm = 0) => now.plus({ days: dayOffset }).set({ hour: hh, minute: mm, second: 0, millisecond: 0 });

type A = { host: number; title: string; category: string; sport?: string; level?: string; day: number; h: number; dur: number; fillH: number; cap: number; joined: number[]; area: string; at: { lat: number; lng: number }; exact?: string; notes?: string };
const acts: A[] = [
  { host: 0, title: "Badminton doubles, friendly", category: "sports", sport: "badminton", level: "intermediate", day: 1, h: 18, dur: 2, fillH: 2, cap: 4, joined: [1], area: "Near Pottruck Gym", at: P.pottruck, exact: "Court 3, Pottruck 2nd floor", notes: "I'll bring shuttlecocks. Rackets to borrow at the desk." },
  { host: 2, title: "Pickup basketball 3v3", category: "sports", sport: "basketball", level: "any", day: 0, h: 20, dur: 1.5, fillH: 1, cap: 6, joined: [3, 4, 5], area: "Pottruck courts", at: P.pottruck, exact: "Main court" },
  { host: 6, title: "Easy 5K along the Schuylkill", category: "sports", sport: "running", level: "beginner", day: 2, h: 7, dur: 1, fillH: 10, cap: 5, joined: [], area: "Schuylkill River Trail", at: P.schuylkill, exact: "Meet at the Walnut St. bridge stairs" },
  { host: 7, title: "Hotpot dinner in Chinatown", category: "meal", day: 3, h: 19, dur: 2, fillH: 6, cap: 6, joined: [0, 6], area: "Chinatown", at: P.chinatown, exact: "Little Sheep, 1017 Race St", notes: "Splitting the bill, about $30 each." },
  { host: 8, title: "Quiet study session, finals prep", category: "study", day: 1, h: 14, dur: 3, fillH: 3, cap: 4, joined: [9], area: "Van Pelt Library", at: P.vanPelt, exact: "Group study room 422" },
  { host: 4, title: "Late movie on Friday", category: "movie", day: 4, h: 21, dur: 2.5, fillH: 24, cap: 5, joined: [], area: "Theater near campus", at: P.cinema, exact: "Box office at 8:45 pm" },
  { host: 5, title: "Day trip to New York", category: "travel", day: 5, h: 8, dur: 12, fillH: 48, cap: 4, joined: [1], area: "30th Street Station", at: P.thirtieth, exact: "Amtrak departures board", notes: "Train up in the morning, back by 9 pm. Museums + food." },
  { host: 3, title: "Lunch at Houston Hall", category: "meal", day: 0, h: 12, dur: 1, fillH: 0.5, cap: 3, joined: [], area: "Houston Hall", at: P.houston, exact: "Bistro tables by the window" },
];
for (const a of acts) {
  const start = at(a.day, Math.floor(a.h), (a.h % 1) * 60);
  const s = start < now.plus({ minutes: 40 }) ? start.plus({ days: 1 }) : start;
  const fill = DateTime.max(s.minus({ hours: a.fillH }), now.plus({ minutes: 30 }));
  const doc = {
    host: u(a.host), school: school.domain, title: a.title, category: a.category, sport: a.sport ?? null, level: a.level ?? "any",
    startsAt: s.toJSDate(), endsAt: s.plus({ minutes: a.dur * 60 }).toJSDate(), fillBy: fill.toJSDate(), capacity: a.cap,
    participants: a.joined.map((i) => ({ user: u(i), joinedAt: now.toJSDate() })), area: { name: a.area, point: toPoint(a.at) },
    exactLocation: a.exact ?? "", notes: a.notes ?? "", status: a.joined.length + 1 >= a.cap ? "full" : "open",
  };
  await Activity.findOneAndUpdate({ school: school.domain, title: a.title, host: u(a.host) }, doc, { upsert: true });
}

const week = { from: now.toISODate()!, to: now.plus({ days: 7 }).toISODate()!, tz: TZ };
const seeks = [
  { user: 9, category: "sports", sport: "badminton", level: "intermediate", availability: { ...week, days: [1, 2, 3, 4, 5], start: "18:00", end: "22:00" }, note: "Want to get back into badminton", at: P.vanPelt },
  { user: 1, category: "sports", sport: "tennis", level: "advanced", availability: { ...week, days: [6, 7], start: "09:00", end: "12:00" }, note: "Looking for a hitting partner", at: P.franklinField },
  { user: 5, category: "study", sport: null, level: "any", availability: { ...week, days: [1, 2, 3, 4], start: "13:00", end: "18:00" }, note: "CIS 1210 problem sets", at: P.vanPelt },
  { user: 2, category: "meal", sport: null, level: "any", availability: { ...week, days: [1, 2, 3, 4, 5, 6, 7], start: "18:00", end: "21:00" }, note: "Trying new places for dinner", at: P.houston },
];
for (const s of seeks) {
  await Seek.findOneAndUpdate(
    { user: u(s.user), category: s.category, sport: s.sport } as Record<string, unknown>,
    { ...s, user: u(s.user), school: school.domain, area: { name: "Campus", point: toPoint(s.at) }, maxDistanceKm: 5, active: true,
      expiresAt: DateTime.fromISO(week.to, { zone: TZ }).endOf("day").toJSDate() },
    { upsert: true },
  );
}
await Notification.deleteMany({ user: { $in: users.map((x) => x._id) } });
console.log(`seeded ${users.length} people, ${acts.length} activities, ${seeks.length} looking-for posts at ${school.name}`);
await mongoose.disconnect();
