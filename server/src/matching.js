import { DateTime } from "luxon";
import { bestCommonSlot, coveredMinutes } from "./availability.js";

/**
 * Buddy matching. Hard filters first (same school, same activity type, nobody
 * blocked, the times actually overlap), then a weighted score whose parts are
 * returned as reasons, so a match can say why it was suggested.
 */
export const WEIGHTS = { time: 0.4, level: 0.25, distance: 0.25, urgency: 0.1 };

const LEVEL_ORDER = ["beginner", "intermediate", "advanced"];

export function levelFit(a, b) {
  if (a === "any" || b === "any") return 0.8;
  const d = Math.abs(LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b));
  return d === 0 ? 1 : d === 1 ? 0.5 : 0;
}

export function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const sameKind = (a, b) =>
  a.category === b.category && (a.category !== "sports" || !a.sport || !b.sport || a.sport === b.sport);

/** Weighted sum over the factors that have a signal; weights renormalize when one is missing. */
function combine(parts) {
  let s = 0, w = 0;
  for (const [f, v] of Object.entries(parts)) {
    s += WEIGHTS[f] * v;
    w += WEIGHTS[f];
  }
  return w ? Math.round((s / w) * 1000) / 1000 : 0;
}

/** How well an open activity fits someone looking for a buddy; null when a hard filter fails. */
export function matchActivity(seek, act, now, blocked = new Set()) {
  if (seek.school !== act.school || !sameKind(seek, act)) return null;
  if (seek.user === act.host || blocked.has(act.host) || act.spotsLeft <= 0) return null;
  if (act.fillBy <= now || act.startsAt <= now) return null;

  const eventMinutes = (act.endsAt.getTime() - act.startsAt.getTime()) / 60_000;
  const covered = coveredMinutes(seek.availability, act.startsAt, act.endsAt);
  if (covered < Math.min(30, eventMinutes)) return null; // at least half an hour of the event, or all of a short one
  const parts = {};
  const reasons = [];

  parts.time = Math.min(1, covered / eventMinutes);
  const local = DateTime.fromJSDate(act.startsAt).setZone(seek.availability.tz);
  reasons.push({ code: parts.time >= 0.99 ? "time.fits" : "time.partly", params: { when: local.toISO(), pct: Math.round(parts.time * 100) } });

  if (seek.category === "sports") {
    parts.level = levelFit(seek.level, act.level);
    if (parts.level >= 0.8) reasons.push({ code: "level.match", params: { level: act.level === "any" ? seek.level : act.level } });
    else if (parts.level === 0) return null; // beginner vs advanced: not a buddy
  }

  if (seek.point && act.point) {
    const km = haversineKm(seek.point, act.point);
    if (km > seek.maxDistanceKm) return null;
    parts.distance = Math.exp(-km / 2);
    reasons.push({ code: "distance", params: { km: Math.round(km * 10) / 10 } });
  }

  // Posts whose fill-by deadline is close need people now.
  const hoursLeft = (act.fillBy.getTime() - now.getTime()) / 3_600_000;
  parts.urgency = hoursLeft <= 2 ? 1 : hoursLeft <= 24 ? 0.6 : 0.3;
  if (hoursLeft <= 2) reasons.push({ code: "urgent", params: { spots: act.spotsLeft } });

  return { score: combine(parts), components: parts, reasons };
}

/** Two people looking for the same thing: suggest one of them starts an activity in their common slot. */
export function matchSeekers(a, b, now, blocked = new Set()) {
  if (a.school !== b.school || a.user === b.user || !sameKind(a, b) || blocked.has(b.user)) return null;
  const slot = bestCommonSlot(a.availability, b.availability, now);
  if (!slot || slot.length("minutes") < 45) return null;
  const parts = { time: Math.min(1, slot.length("minutes") / 120) };
  const reasons = [{ code: "time.common", params: { when: slot.start.setZone(a.availability.tz).toISO(), minutes: Math.round(slot.length("minutes")) } }];
  if (a.category === "sports") {
    parts.level = levelFit(a.level, b.level);
    if (parts.level === 0) return null;
    if (parts.level >= 0.8) reasons.push({ code: "level.match", params: { level: b.level === "any" ? a.level : b.level } });
  }
  if (a.point && b.point) {
    const km = haversineKm(a.point, b.point);
    if (km > Math.min(a.maxDistanceKm, b.maxDistanceKm)) return null;
    parts.distance = Math.exp(-km / 2);
    reasons.push({ code: "distance", params: { km: Math.round(km * 10) / 10 } });
  }
  return { score: combine(parts), components: parts, reasons, slot: { start: slot.start.toJSDate(), end: slot.end.toJSDate() } };
}
