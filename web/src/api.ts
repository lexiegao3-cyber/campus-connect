export type Category = "sports" | "meal" | "study" | "movie" | "travel" | "other";
export type Level = "any" | "beginner" | "intermediate" | "advanced";
export type Status = "open" | "full" | "deciding" | "confirmed" | "cancelled" | "done";
export const CATEGORIES: Category[] = ["sports", "meal", "study", "movie", "travel", "other"];
export const SPORTS = ["badminton", "basketball", "tennis", "table-tennis", "soccer", "volleyball", "running", "gym", "swimming", "hiking", "cycling", "yoga"] as const;
export const LEVELS: Level[] = ["any", "beginner", "intermediate", "advanced"];

export interface Point { lat: number; lng: number }
export interface School { domain: string; name: string; country: string }
export interface Me { id: string; email: string; name: string; school: School; tz: string; lang: "en" | "zh" }
export interface Reason { code: string; params?: Record<string, string | number> }

export interface Activity {
  id: string; title: string; notes: string; category: Category; sport: string | null; level: Level;
  startsAt: string; endsAt: string; fillBy: string; capacity: number; status: Status;
  host: { id: string; name: string }; joinedCount: number; spotsLeft: number;
  participants?: { id: string; name: string }[];
  area: { name: string; point: Point | null }; exactLocation?: string;
  youHost: boolean; youJoined: boolean; distanceKm?: number; score?: number; reasons?: Reason[];
}

export interface Availability { from: string; to: string; days: number[]; start: string; end: string; tz: string }
export interface Seek {
  id: string; category: Category; sport: string | null; level: Level; note: string; availability: Availability;
  area: { name: string; point: Point | null } | null; maxDistanceKm: number; active: boolean; expiresAt: string;
}
export interface Buddy { user: { id: string; name: string }; seek: string; note: string; level: Level; score: number; reasons: Reason[]; slot: { start: string; end: string } }
export interface Matches { activities: Activity[]; buddies: Buddy[] }
export interface Matched { user: { id: string; name: string }; seek: string; score: number; reasons: Reason[] }

export interface Notification {
  id: string; type: string; read: boolean; createdAt: string; params: Record<string, unknown>;
  activity: { id: string; title: string; startsAt: string } | null; seek: string | null;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

const TOKEN = "cc.token";
let token: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN);
  } catch {
    return null;
  }
})();
export const getToken = () => token;
export function setToken(t: string | null) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN, t);
    else localStorage.removeItem(TOKEN);
  } catch {
    /* private mode */
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) setToken(null);
    const detail = data.issues?.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join("; ");
    throw new ApiError(res.status, detail || data.error || res.statusText, data.code);
  }
  return data as T;
}

const qs = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();

export const api = {
  config: () => call<{ googleClientId: string | null; devLogin: boolean; googleMapsKey: string | null; googleMapsMapId: string | null }>("GET", "/api/config"),
  lookupSchool: (email: string) => call<{ school: School | null }>("GET", `/api/schools/lookup?${qs({ email })}`),
  devLogin: (email: string, name: string) => call<{ token: string; user: Me }>("POST", "/api/auth/dev", { email, name }),
  google: (credential: string) => call<{ token: string; user: Me }>("POST", "/api/auth/google", { credential }),
  me: () => call<Me>("GET", "/api/me"),
  updateMe: (p: Partial<Pick<Me, "name" | "tz" | "lang">>) => call<Me>("PATCH", "/api/me", p),
  activities: (q: { category?: Category; lat?: number; lng?: number; radiusKm?: number }) => call<{ items: Activity[] }>("GET", `/api/activities?${qs(q)}`),
  mine: () => call<{ items: Activity[] }>("GET", "/api/activities/mine"),
  activity: (id: string) => call<Activity>("GET", `/api/activities/${id}`),
  createActivity: (b: unknown) => call<{ activity: Activity; matched: Matched[] }>("POST", "/api/activities", b),
  join: (id: string) => call<{ activity: Activity; conflicts: { id: string; title: string; startsAt: string }[] }>("POST", `/api/activities/${id}/join`),
  leave: (id: string) => call<Activity>("POST", `/api/activities/${id}/leave`),
  decide: (id: string, action: "start" | "cancel") => call<Activity>("POST", `/api/activities/${id}/decision`, { action }),
  createSeek: (b: unknown) => call<{ seek: Seek; matches: Matches }>("POST", "/api/seeks", b),
  mySeeks: () => call<{ items: Seek[] }>("GET", "/api/seeks/mine"),
  seekMatches: (id: string) => call<{ seek: Seek; matches: Matches }>("GET", `/api/seeks/${id}/matches`),
  closeSeek: (id: string) => call<void>("DELETE", `/api/seeks/${id}`),
  notifications: () => call<{ unread: number; items: Notification[] }>("GET", "/api/notifications"),
  readAll: () => call<void>("POST", "/api/notifications/read"),
  block: (userId: string) => call<void>("POST", `/api/users/${userId}/block`),
  report: (b: { targetUser?: string; activity?: string; reason: string }) => call<{ ok: true }>("POST", "/api/reports", b),
};
