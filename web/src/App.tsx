import { useCallback, useEffect, useState } from "react";
import { api, type CampusEvent, type User } from "./api";
import { EventCard } from "./components/EventCard";

type View = "all" | "going" | "organizing";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [week, setWeek] = useState(false);
  const [view, setView] = useState<View>("all");
  const [items, setItems] = useState<CampusEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.categories().then(setCategories);
    if (api.signedIn()) api.me().then(setUser).catch(() => api.logout());
  }, []);

  const filters = useCallback(
    () => ({
      q: q || undefined,
      category: category || undefined,
      to: week ? new Date(Date.now() + 7 * 864e5).toISOString() : undefined,
      mine: view === "all" ? undefined : view,
      limit: "10",
    }),
    [q, category, week, view],
  );

  const load = useCallback(async () => {
    const page = await api.list(filters());
    setItems(page.items);
    setCursor(page.nextCursor);
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(() => load().catch((e) => setToast(e.message)), 200);
    return () => clearTimeout(t);
  }, [load, user]);

  async function more() {
    if (!cursor) return;
    const page = await api.list({ ...filters(), cursor });
    setItems((prev) => [...prev, ...page.items]);
    setCursor(page.nextCursor);
  }

  async function act(fn: () => Promise<string | void>) {
    try {
      const msg = await fn();
      if (msg) setToast(msg);
      await load();
    } catch (e) {
      setToast(e instanceof Error ? e.message : String(e));
    }
  }

  async function downloadCalendar() {
    const ics = await api.calendar();
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    Object.assign(document.createElement("a"), { href: url, download: "campus-connect.ics" }).click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page">
      <header className="top">
        <h1>Campus Connect</h1>
        <div className="top-actions">
          {user ? (
            <>
              <button onClick={() => setShowCreate(true)}>+ Create event</button>
              <span className="hello">Hi, {user.displayName}</span>
              <button className="ghost" onClick={() => { api.logout(); setUser(null); setView("all"); }}>Sign out</button>
            </>
          ) : (
            <button onClick={() => setShowAuth(true)}>Sign in</button>
          )}
        </div>
      </header>

      <div className="toolbar">
        <input className="search" placeholder="Search events, rooms, topics…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={week} onChange={(e) => setWeek(e.target.checked)} /> Next 7 days</label>
        {user && (
          <div className="seg">
            {(["all", "going", "organizing"] as View[]).map((v) => (
              <button key={v} className={view === v ? "on" : ""} onClick={() => setView(v)}>
                {v === "all" ? "All" : v === "going" ? "My RSVPs" : "Hosting"}
              </button>
            ))}
          </div>
        )}
        {user && view === "going" && <button className="ghost" onClick={downloadCalendar}>Add to calendar (.ics)</button>}
      </div>
      <div className="cats">
        <button className={category === "" ? "on" : ""} onClick={() => setCategory("")}>All</button>
        {categories.map((c) => (
          <button key={c} className={`cat-${c} ${category === c ? "on" : ""}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      <main className="list">
        {items.length === 0 && <p className="empty">No upcoming events match. Why not host one?</p>}
        {items.map((e) => (
          <EventCard
            key={e.id}
            event={e}
            signedIn={!!user}
            isOrganizer={user?.id === e.organizer.id}
            onRsvp={() =>
              act(async () => {
                const r = await api.rsvp(e.id);
                const base = r.status === "going" ? `You're going to ${e.title}.` : `Event is full — you're on the waitlist.`;
                return r.conflicts.length ? `${base} Heads up: overlaps with ${r.conflicts.map((c) => c.title).join(", ")}.` : base;
              })
            }
            onLeave={() => act(async () => { await api.unrsvp(e.id); return "RSVP removed."; })}
            onCancel={() => confirm(`Cancel "${e.title}"?`) && act(async () => { await api.cancel(e.id); return "Event cancelled."; })}
          />
        ))}
        {cursor && <button className="ghost more" onClick={more}>Load more</button>}
      </main>

      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
      {showAuth && <AuthDialog onClose={() => setShowAuth(false)} onAuthed={(u) => { setUser(u); setShowAuth(false); }} />}
      {showCreate && (
        <CreateDialog
          categories={categories}
          onClose={() => setShowCreate(false)}
          onCreated={async (ev) => { setShowCreate(false); setToast(`Created "${ev.title}".`); await load(); }}
        />
      )}
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-head"><h2>{title}</h2><button className="ghost" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

function AuthDialog({ onClose, onAuthed }: { onClose: () => void; onAuthed: (u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [f, setF] = useState({ email: "", password: "", name: "" });
  const [err, setErr] = useState("");
  return (
    <Dialog title={mode === "login" ? "Sign in" : "Create account"} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            onAuthed(mode === "login" ? await api.login(f.email, f.password) : await api.register(f.email, f.password, f.name));
          } catch (x) {
            setErr(x instanceof Error ? x.message : String(x));
          }
        }}
      >
        {mode === "register" && <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>}
        <label>Email<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label>Password<input type="password" required minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        {err && <p className="error">{err}</p>}
        <button>{mode === "login" ? "Sign in" : "Create account"}</button>
        <button type="button" className="ghost" onClick={() => setMode(mode === "login" ? "register" : "login")}>
          {mode === "login" ? "New here? Create an account" : "Have an account? Sign in"}
        </button>
      </form>
    </Dialog>
  );
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

function CreateDialog({ categories, onClose, onCreated }: { categories: string[]; onClose: () => void; onCreated: (e: CampusEvent) => void }) {
  const start = new Date(Date.now() + 864e5);
  start.setMinutes(0, 0, 0);
  const [f, setF] = useState({
    title: "", description: "", category: categories[0] ?? "social", location: "", lat: "", lon: "",
    start: toLocalInput(start), end: toLocalInput(new Date(start.getTime() + 36e5)), capacity: "",
  });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Dialog title="Create event" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            onCreated(
              await api.create({
                title: f.title,
                description: f.description,
                category: f.category,
                location: f.location,
                latitude: f.lat ? Number(f.lat) : null,
                longitude: f.lon ? Number(f.lon) : null,
                startsAt: new Date(f.start).toISOString(),
                endsAt: new Date(f.end).toISOString(),
                capacity: f.capacity ? Number(f.capacity) : null,
              }),
            );
          } catch (x) {
            setErr(x instanceof Error ? x.message : String(x));
          }
        }}
      >
        <label>Title<input required minLength={3} value={f.title} onChange={set("title")} /></label>
        <div className="grid2">
          <label>Category<select value={f.category} onChange={set("category")}>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Capacity (optional)<input type="number" min={1} value={f.capacity} onChange={set("capacity")} /></label>
          <label>Starts<input type="datetime-local" required value={f.start} onChange={set("start")} /></label>
          <label>Ends<input type="datetime-local" required value={f.end} onChange={set("end")} /></label>
        </div>
        <label>Location<input required value={f.location} onChange={set("location")} placeholder="Building and room" /></label>
        <div className="grid2">
          <label>Latitude (optional)<input type="number" step="any" value={f.lat} onChange={set("lat")} /></label>
          <label>Longitude (optional)<input type="number" step="any" value={f.lon} onChange={set("lon")} /></label>
        </div>
        <label>Description<textarea rows={3} value={f.description} onChange={set("description")} /></label>
        {err && <p className="error">{err}</p>}
        <button>Publish</button>
      </form>
    </Dialog>
  );
}
