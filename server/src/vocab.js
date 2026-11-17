/** Shared vocabulary; the client mirrors these ids and translates them. */
export const CATEGORIES = ["sports", "meal", "study", "movie", "travel", "other"];

export const SPORTS = [
  "badminton", "basketball", "tennis", "table-tennis", "soccer", "volleyball",
  "running", "gym", "swimming", "hiking", "cycling", "yoga",
];

/** Only sports use levels; "any" means the poster does not care. */
export const LEVELS = ["any", "beginner", "intermediate", "advanced"];

export const ACTIVITY_STATUS = ["open", "full", "deciding", "confirmed", "cancelled", "done"];

export const NOTIFICATION_TYPES = [
  "match", "seek-match", "joined", "left", "full", "deadline", "confirmed", "cancelled", "auto-cancelled", "closed",
];
