import type { EventRow } from "./types";

/**
 * RSVP state machine with capacity limits and a FIFO waitlist.
 *
 *            join (seat free)              cancel (going) → promote head of waitlist
 *   none ───────────────────────► going ─────────────────────────────────────────► none
 *     │      join (event full)                       ▲
 *     └─────────────────────────► waitlist ──────────┘  promoted when a seat frees up
 *
 * Correctness under concurrency relies on two properties of SQLite / D1:
 *  - each statement runs atomically against a single writer, so the
 *    "count seats, then insert" check inside one INSERT…SELECT cannot race;
 *  - db.batch() executes its statements in one transaction, so a cancel and
 *    the resulting promotion commit together or not at all.
 * The (event_id, user_id) primary key makes a double-click or retried
 * request a no-op instead of a duplicate row.
 */

export type JoinResult =
  | { outcome: "joined"; status: "going" | "waitlist"; conflicts: Conflict[] }
  | { outcome: "already"; status: "going" | "waitlist"; conflicts: Conflict[] }
  | { outcome: "closed" };

export interface Conflict {
  id: number;
  title: string;
  starts_at: number;
  ends_at: number;
}

export async function join(db: D1Database, eventId: number, userId: number, now = Date.now()): Promise<JoinResult> {
  const inserted = await db
    .prepare(
      `INSERT INTO rsvps (event_id, user_id, status, created_at)
       SELECT e.id, ?2,
              CASE WHEN e.capacity IS NULL
                     OR (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id AND r.status = 'going') < e.capacity
                   THEN 'going' ELSE 'waitlist' END,
              ?3
       FROM events e
       WHERE e.id = ?1 AND e.status = 'scheduled' AND e.ends_at > ?3
       ON CONFLICT (event_id, user_id) DO NOTHING
       RETURNING status`,
    )
    .bind(eventId, userId, now)
    .first<{ status: "going" | "waitlist" }>();

  if (inserted) return { outcome: "joined", status: inserted.status, conflicts: await conflicts(db, eventId, userId) };

  const existing = await db
    .prepare(`SELECT status FROM rsvps WHERE event_id = ?1 AND user_id = ?2`)
    .bind(eventId, userId)
    .first<{ status: "going" | "waitlist" }>();
  if (existing) return { outcome: "already", status: existing.status, conflicts: await conflicts(db, eventId, userId) };
  return { outcome: "closed" };
}

/** Removes the user's RSVP and, in the same transaction, promotes the earliest waitlisted user if a seat opened. */
export async function leave(db: D1Database, eventId: number, userId: number): Promise<{ removed: boolean; promotedUserId: number | null }> {
  const [removed, promoted] = await db.batch<{ status?: string; user_id?: number }>([
    db.prepare(`DELETE FROM rsvps WHERE event_id = ?1 AND user_id = ?2 RETURNING status`).bind(eventId, userId),
    promoteStatement(db, eventId),
  ]);
  return {
    removed: removed.results.length > 0,
    promotedUserId: (promoted.results[0]?.user_id as number | undefined) ?? null,
  };
}

/**
 * Promote as many waitlisted users as there are free seats (used after an
 * organizer raises capacity). Each statement promotes at most one user and
 * re-checks capacity, so running it N times is safe.
 */
export async function fillFreedSeats(db: D1Database, eventId: number, maxPromotions: number): Promise<number[]> {
  if (maxPromotions <= 0) return [];
  const res = await db.batch<{ user_id: number }>(Array.from({ length: maxPromotions }, () => promoteStatement(db, eventId)));
  return res.flatMap((r) => r.results.map((x) => x.user_id));
}

function promoteStatement(db: D1Database, eventId: number) {
  return db
    .prepare(
      `UPDATE rsvps SET status = 'going'
       WHERE event_id = ?1
         AND user_id = (SELECT user_id FROM rsvps WHERE event_id = ?1 AND status = 'waitlist'
                        ORDER BY created_at, user_id LIMIT 1)
         AND (SELECT capacity FROM events WHERE id = ?1) IS NOT NULL
         AND (SELECT COUNT(*) FROM rsvps WHERE event_id = ?1 AND status = 'going')
             < (SELECT capacity FROM events WHERE id = ?1)
       RETURNING user_id`,
    )
    .bind(eventId);
}

/** Other events the user is attending whose time range overlaps this one (half-open intervals). */
export async function conflicts(db: D1Database, eventId: number, userId: number): Promise<Conflict[]> {
  const { results } = await db
    .prepare(
      `SELECT o.id, o.title, o.starts_at, o.ends_at
       FROM events e
       JOIN rsvps r ON r.user_id = ?2 AND r.status = 'going'
       JOIN events o ON o.id = r.event_id
       WHERE e.id = ?1 AND o.id <> e.id AND o.status = 'scheduled'
         AND o.starts_at < e.ends_at AND e.starts_at < o.ends_at
       ORDER BY o.starts_at`,
    )
    .bind(eventId, userId)
    .all<Conflict>();
  return results;
}

export function seatsLeft(e: Pick<EventRow, "capacity" | "going_count">): number | null {
  return e.capacity === null ? null : Math.max(0, e.capacity - e.going_count);
}
