export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
}

export type Variables = {
  userId?: number;
};

export type AppEnv = { Bindings: Env; Variables: Variables };

export const CATEGORIES = ["academic", "career", "social", "sports", "arts", "tech", "volunteer", "wellness"] as const;
export type Category = (typeof CATEGORIES)[number];

export interface EventRow {
  id: number;
  organizer_id: number;
  organizer_name: string;
  title: string;
  description: string;
  category: Category;
  location: string;
  latitude: number | null;
  longitude: number | null;
  starts_at: number;
  ends_at: number;
  capacity: number | null;
  status: "scheduled" | "cancelled";
  going_count: number;
  waitlist_count: number;
  my_status: "going" | "waitlist" | null;
}
