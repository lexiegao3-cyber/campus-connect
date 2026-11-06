export interface CampusEvent {
  id: number;
  title: string;
  description: string;
  category: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  status: "scheduled" | "cancelled";
  organizer: { id: number; name: string };
  goingCount: number;
  waitlistCount: number;
  seatsLeft: number | null;
  myStatus: "going" | "waitlist" | null;
  maps: { openStreetMap: string; googleMaps: string };
}

export interface User {
  id: number;
  email: string;
  displayName: string;
}

export interface Conflict {
  id: number;
  title: string;
  startsAt: string;
}

const KEY = "campus.session";
let session: string | null = null;
try {
  session = localStorage.getItem(KEY);
} catch {
  /* storage blocked */
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function req<T>(method: string, path: string, json?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Authorization: `Bearer ${session}` } : {}),
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) setSession(null);
    const msg = data.issues?.map((i: { path: string; message: string }) => `${i.path || "body"}: ${i.message}`).join("; ");
    throw new ApiError(res.status, msg || data.error || res.statusText);
  }
  const type = res.headers.get("Content-Type") ?? "";
  return (type.includes("json") ? res.json() : res.text()) as Promise<T>;
}

function setSession(token: string | null) {
  session = token;
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const api = {
  signedIn: () => session !== null,
  logout: () => setSession(null),
  async register(email: string, password: string, displayName: string) {
    const r = await req<{ token: string; user: User }>("POST", "/auth/register", { email, password, displayName });
    setSession(r.token);
    return r.user;
  },
  async login(email: string, password: string) {
    const r = await req<{ token: string; user: User }>("POST", "/auth/login", { email, password });
    setSession(r.token);
    return r.user;
  },
  me: () => req<User>("GET", "/me"),
  categories: () => req<string[]>("GET", "/categories"),
  list: (params: Record<string, string | undefined>) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return req<{ items: CampusEvent[]; nextCursor: string | null }>("GET", `/events?${qs}`);
  },
  create: (body: Record<string, unknown>) => req<CampusEvent>("POST", "/events", body),
  cancel: (id: number) => req<void>("DELETE", `/events/${id}`),
  rsvp: (id: number) => req<{ status: "going" | "waitlist"; conflicts: Conflict[] }>("PUT", `/events/${id}/rsvp`),
  unrsvp: (id: number) => req<void>("DELETE", `/events/${id}/rsvp`),
  calendar: () => req<string>("GET", "/me/calendar.ics"),
};
