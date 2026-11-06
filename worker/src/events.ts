import type { Category, EventRow } from "./types";

/**
 * Event queries. Every statement uses numbered bind parameters (?1, ?2 …);
 * no user input is ever concatenated into SQL.
 */

const SELECT_EVENT = `
  SELECT e.id, e.organizer_id, u.display_name AS organizer_name, e.title, e.description, e.category,
         e.location, e.latitude, e.longitude, e.starts_at, e.ends_at, e.capacity, e.status,
         (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going')    AS going_count,
         (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'waitlist') AS waitlist_count,
         (SELECT r.status FROM rsvps r WHERE r.event_id = e.id AND r.user_id = ?1)        AS my_status
  FROM events e JOIN users u ON u.id = e.organizer_id`;

export interface ListFilters {
  viewerId: number | null;
  q?: string;
  category?: Category;
  from: number;
  to?: number;
  mine?: "going" | "organizing";
  cursor?: { startsAt: number; id: number };
  limit: number;
}

/** Escape LIKE wildcards so a search for "100%" matches literally. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export function encodeCursor(e: { starts_at: number; id: number }): string {
  return btoa(`${e.starts_at}:${e.id}`);
}

export function decodeCursor(s: string): { startsAt: number; id: number } | null {
  try {
    const [a, b] = atob(s).split(":").map(Number);
    return Number.isSafeInteger(a) && Number.isSafeInteger(b) ? { startsAt: a, id: b } : null;
  } catch {
    return null;
  }
}

export async function listEvents(db: D1Database, f: ListFilters): Promise<{ items: EventRow[]; nextCursor: string | null }> {
  const where: string[] = ["e.status = 'scheduled'", "e.ends_at >= ?2"];
  const params: unknown[] = [f.viewerId ?? -1, f.from];
  const bind = (v: unknown) => {
    params.push(v);
    return `?${params.length}`;
  };

  if (f.category) where.push(`e.category = ${bind(f.category)}`);
  if (f.to !== undefined) where.push(`e.starts_at <= ${bind(f.to)}`);
  if (f.q) {
    const p = bind(likePattern(f.q));
    where.push(`(e.title LIKE ${p} ESCAPE '\\' OR e.description LIKE ${p} ESCAPE '\\' OR e.location LIKE ${p} ESCAPE '\\')`);
  }
  if (f.mine === "going") where.push(`EXISTS (SELECT 1 FROM rsvps r WHERE r.event_id = e.id AND r.user_id = ?1)`);
  if (f.mine === "organizing") where.push(`e.organizer_id = ?1`);
  if (f.cursor) {
    // Keyset pagination: stable under concurrent inserts, O(log n) with idx_events_starts.
    const s = bind(f.cursor.startsAt);
    const i = bind(f.cursor.id);
    where.push(`(e.starts_at > ${s} OR (e.starts_at = ${s} AND e.id > ${i}))`);
  }
  const limit = bind(f.limit + 1);

  const sql = `${SELECT_EVENT} WHERE ${where.join(" AND ")} ORDER BY e.starts_at, e.id LIMIT ${limit}`;
  const { results } = await db.prepare(sql).bind(...params).all<EventRow>();
  const page = results.slice(0, f.limit);
  return { items: page, nextCursor: results.length > f.limit ? encodeCursor(page[page.length - 1]) : null };
}

export async function getEvent(db: D1Database, id: number, viewerId: number | null): Promise<EventRow | null> {
  return db.prepare(`${SELECT_EVENT} WHERE e.id = ?2`).bind(viewerId ?? -1, id).first<EventRow>();
}

export interface NewEvent {
  title: string;
  description: string;
  category: Category;
  location: string;
  latitude: number | null;
  longitude: number | null;
  startsAt: number;
  endsAt: number;
  capacity: number | null;
}

export async function insertEvent(db: D1Database, organizerId: number, e: NewEvent): Promise<number> {
  const row = await db
    .prepare(
      `INSERT INTO events (organizer_id, title, description, category, location, latitude, longitude, starts_at, ends_at, capacity, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) RETURNING id`,
    )
    .bind(organizerId, e.title, e.description, e.category, e.location, e.latitude, e.longitude, e.startsAt, e.endsAt, e.capacity, Date.now())
    .first<{ id: number }>();
  return row!.id;
}

const COLUMN: Record<keyof NewEvent, string> = {
  title: "title",
  description: "description",
  category: "category",
  location: "location",
  latitude: "latitude",
  longitude: "longitude",
  startsAt: "starts_at",
  endsAt: "ends_at",
  capacity: "capacity",
};

/** Column names come from a fixed whitelist; values are bound. */
export async function updateEvent(db: D1Database, id: number, patch: Partial<NewEvent>): Promise<void> {
  const keys = (Object.keys(patch) as (keyof NewEvent)[]).filter((k) => patch[k] !== undefined);
  if (!keys.length) return;
  const sets = keys.map((k, i) => `${COLUMN[k]} = ?${i + 2}`).join(", ");
  await db
    .prepare(`UPDATE events SET ${sets} WHERE id = ?1`)
    .bind(id, ...keys.map((k) => patch[k]))
    .run();
}

export async function cancelEvent(db: D1Database, id: number): Promise<void> {
  await db.prepare(`UPDATE events SET status = 'cancelled' WHERE id = ?1`).bind(id).run();
}

export function mapLinks(e: Pick<EventRow, "latitude" | "longitude" | "location">) {
  if (e.latitude !== null && e.longitude !== null) {
    const { latitude: lat, longitude: lon } = e;
    return {
      openStreetMap: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`,
      googleMaps: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`,
    };
  }
  const q = encodeURIComponent(e.location);
  return {
    openStreetMap: `https://www.openstreetmap.org/search?query=${q}`,
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
}
