import { DateTime, Interval } from "luxon";

const minutes = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Concrete UTC intervals for an availability, clipped to [rangeStart, rangeEnd]. */
export function expand(a, rangeStart, rangeEnd) {
  const out = [];
  const clip = Interval.fromDateTimes(DateTime.fromJSDate(rangeStart), DateTime.fromJSDate(rangeEnd));
  let day = DateTime.fromISO(a.from, { zone: a.tz }).startOf("day");
  const last = DateTime.fromISO(a.to, { zone: a.tz }).startOf("day");
  const s = minutes(a.start), e = minutes(a.end);
  for (let guard = 0; day <= last && guard < 400; guard++, day = day.plus({ days: 1 })) {
    if (!a.days.includes(day.weekday)) continue;
    // Wall-clock times, not elapsed minutes: on a DST day midnight + 21 h is not 9 pm.
    const startAt = day.set({ hour: Math.floor(s / 60), minute: s % 60 });
    const endAt = (e > s ? day : day.plus({ days: 1 })).set({ hour: Math.floor(e / 60), minute: e % 60 });
    const clipped = Interval.fromDateTimes(startAt, endAt).intersection(clip);
    if (clipped && clipped.isValid && clipped.length("minutes") > 0) out.push(clipped);
  }
  return out;
}

/** Minutes of [start, end) covered by the availability. */
export function coveredMinutes(a, start, end) {
  return expand(a, start, end).reduce((sum, i) => sum + i.length("minutes"), 0);
}

/** The longest stretch two people are both free, within the next `horizonDays`. */
export function bestCommonSlot(a, b, now, horizonDays = 14) {
  const until = new Date(now.getTime() + horizonDays * 864e5);
  const A = expand(a, now, until), B = expand(b, now, until);
  let best = null;
  for (const x of A) for (const y of B) {
    const i = x.intersection(y);
    if (i && i.isValid && (!best || i.length() > best.length())) best = i;
  }
  return best;
}

/** True if the window ends before now: nothing left to match. */
export function isPast(a, now) {
  return DateTime.fromISO(a.to, { zone: a.tz }).endOf("day").toJSDate() < now;
}
