export const CATEGORIES = ["sports", "meal", "study", "movie", "travel", "other"];
export const SPORTS = ["badminton", "basketball", "tennis", "table-tennis", "soccer", "volleyball", "running", "gym", "swimming", "hiking", "cycling", "yoga"];
export const LEVELS = ["any", "beginner", "intermediate", "advanced"];

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TOKEN = "spotme.token";
let token = (() => {
  try {
    return localStorage.getItem(TOKEN);
  } catch {
    return null;
  }
})();
export const getToken = () => token;
export function setToken(t) {
  token = t;
  try {
    if (t) localStorage.setItem(TOKEN, t);
    else localStorage.removeItem(TOKEN);
  } catch {
    /* private mode */
  }
}

async function call(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) setToken(null);
    const detail = data.issues?.map((i) => `${i.path}: ${i.message}`).join("; ");
    throw new ApiError(res.status, detail || data.error || res.statusText, data.code);
  }
  return data;
}

const qs = (o) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();

export const api = {
  config: () => call("GET", "/api/config"),
  lookupSchool: (email) => call("GET", `/api/schools/lookup?${qs({ email })}`),
  devLogin: (email, name) => call("POST", "/api/auth/dev", { email, name }),
  google: (credential) => call("POST", "/api/auth/google", { credential }),
  me: () => call("GET", "/api/me"),
  updateMe: (p) => call("PATCH", "/api/me", p),
  activities: (q) => call("GET", `/api/activities?${qs(q)}`),
  mine: () => call("GET", "/api/activities/mine"),
  activity: (id) => call("GET", `/api/activities/${id}`),
  createActivity: (b) => call("POST", "/api/activities", b),
  join: (id) => call("POST", `/api/activities/${id}/join`),
  leave: (id) => call("POST", `/api/activities/${id}/leave`),
  decide: (id, action) => call("POST", `/api/activities/${id}/decision`, { action }),
  createSeek: (b) => call("POST", "/api/seeks", b),
  mySeeks: () => call("GET", "/api/seeks/mine"),
  seekMatches: (id) => call("GET", `/api/seeks/${id}/matches`),
  closeSeek: (id) => call("DELETE", `/api/seeks/${id}`),
  notifications: () => call("GET", "/api/notifications"),
  readAll: () => call("POST", "/api/notifications/read"),
  block: (userId) => call("POST", `/api/users/${userId}/block`),
  report: (b) => call("POST", "/api/reports", b),
};
