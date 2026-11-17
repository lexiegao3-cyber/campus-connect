/** Shared vocabulary; the client mirrors these ids and translates them. */
export const CATEGORIES = ["sports", "meal", "study", "movie", "travel", "other"] as const;
export type Category = (typeof CATEGORIES)[number];

export const SPORTS = [
  "badminton", "basketball", "tennis", "table-tennis", "soccer", "volleyball",
  "running", "gym", "swimming", "hiking", "cycling", "yoga",
] as const;
export type Sport = (typeof SPORTS)[number];

/** Only sports use levels; "any" means the poster does not care. */
export const LEVELS = ["any", "beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

export const ACTIVITY_STATUS = ["open", "full", "deciding", "confirmed", "cancelled", "done"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUS)[number];

export const NOTIFICATION_TYPES = [
  "match", "seek-match", "joined", "left", "full", "deadline", "confirmed", "cancelled", "auto-cancelled", "closed",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
