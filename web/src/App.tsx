import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type CampusEvent, type User } from "./api";
import { EventCard } from "./components/EventCard";
import { startOfDay, WeekStrip } from "./components/WeekStrip";

type View = "all" | "going" | "organizing";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("all");
  const [items, setItems] = useState<CampusEvent[]>([]);
  const [week, setWeek] = useState<CampusEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);

  useEffect(() => {
    api.categories().then(setCategories);
    if (api.signedIn()) api.me().then(setUser).catch(() => api.logout());
  }, []);

  const filters = useCallback(
    () => ({ q: q || undefined, category: category || undefined, mine: view === "all" ? undefined : view, limit: "15" }),
    [q, category, view],
  );

  const load = useCallback(async () => {
    const [page, wk] = await Promise.all([
      api.list(filters()),
      api.list({ ...filters(), to: new Date(startOfDay(new Date()).getTime() + 7 * 864e5).toISOString(), limit: "50" }),
    ]);
    setItems(page.items);
    setCursor(page.nextCursor);
    setWeek(wk.items);
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(() => load().catch((e) => setToast(e.message)), 200);
    return () => clearTimeout(t);
  }, [load, user]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

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

  function pick(id: number) {
    document.getElementById(`event-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(id);
    setTimeout(() => setHighlight(null), 1700);
  }

  const groups = useMemo(() => {
    const out: { day: Date; events: CampusEvent[] }[] = [];
    for (const e of items) {
      const d = startOfDay(new Date(e.startsAt));
      const last = out[out.length - 1];
      if (last && last.day.getTime() === d.getTime()) last.events.push(e);
      else out.push({ day: d, events: [e] });
    }
    return out;
  }, [items]);

  const dayLabel = (d: Date) => {
    const diff = Math.round((d.getTime() - startOfDay(new Date()).getTime()) / 864e5);
    const base = d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    return diff === 0 ? `Today, ${base}` : diff === 1 ? `Tomorrow, ${base}` : base;
  };

  return (
    <MotionConfig reducedMotion="user">
    <div className="page">
      <header className="top">
        <span className="wordmark">Campus Connect</span>
        <div className="top-actions">
          {user ? (
            <>
              <span className="hello">Signed in as {user.displayName}</span>
              <button className="ghost" onClick={() => { api.logout(); setUser(null); setView("all"); }}>Sign out</button>
              <button className="primary" onClick={() => setShowCreate(true)}>Host an event</button>
            </>
          ) : (
            <button className="primary" onClick={() => setShowAuth(true)}>Sign in to RSVP</button>
          )}
        </div>
      </header>

      <section className="week-wrap">
        <h1>{view === "going" ? "Your week" : view === "organizing" ? "What you're hosting" : "This week on campus"}</h1>
        <WeekStrip events={week} onPick={pick} />
      </section>

      <div className="toolbar">
        <input className="search" aria-label="Search events" placeholder="Search talks, rooms, clubs" value={q} onChange={(e) => setQ(e.target.value)} />
        {user && (
          <div className="seg" role="group" aria-label="Which events">
            {(["all", "going", "organizing"] as View[]).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>
                {v === "all" ? "Everything" : v === "going" ? "My RSVPs" : "Hosting"}
              </button>
            ))}
          </div>
        )}
        {user && view === "going" && <button className="ghost" onClick={downloadCalendar}>Add to my calendar</button>}
      </div>
      <div className="cats" role="group" aria-label="Category">
        <button aria-pressed={category === ""} onClick={() => setCategory("")}>All categories</button>
        {categories.map((c) => (
          <button key={c} aria-pressed={category === c} className={`cat-${c}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      <main className="agenda">
        {items.length === 0 && (
          <p className="empty">
            Nothing matches yet. {user ? "Host something and it will show up here." : "Sign in to host the first one."}
          </p>
        )}
        {groups.map((g) => (
          <section key={g.day.getTime()} className="agenda-day">
            <h2>{dayLabel(g.day)}</h2>
            {g.events.map((e) => (
              <EventCard
                key={e.id}
                event={e}
                signedIn={!!user}
                isOrganizer={user?.id === e.organizer.id}
                highlight={highlight === e.id}
                onRsvp={() =>
                  act(async () => {
                    const r = await api.rsvp(e.id);
                    const base = r.status === "going" ? `You're going to ${e.title}.` : `${e.title} is full, so you're on the waitlist.`;
                    return r.conflicts.length ? `${base} It overlaps with ${r.conflicts.map((c) => c.title).join(" and ")}.` : base;
                  })
                }
                onLeave={() => act(async () => { await api.unrsvp(e.id); return `RSVP for ${e.title} cancelled.`; })}
                onCancel={() => confirm(`Cancel "${e.title}" for everyone?`) && act(async () => { await api.cancel(e.id); return `${e.title} cancelled.`; })}
              />
            ))}
          </section>
        ))}
        {cursor && <button className="ghost more" onClick={more}>Show later events</button>}
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" role="status" onClick={() => setToast(null)} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAuth && <AuthDialog key="auth" onClose={() => setShowAuth(false)} onAuthed={(u) => { setUser(u); setShowAuth(false); }} />}
        {showCreate && (
          <CreateDialog
            key="create"
            categories={categories}
            onClose={() => setShowCreate(false)}
            onCreated={async (ev) => { setShowCreate(false); setToast(`Published ${ev.title}.`); await load(); }}
          />
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div className="backdrop" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.96, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.97, y: 8 }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
      >
        <div className="dialog-head"><h2>{title}</h2><button className="ghost close" aria-label="Close" onClick={onClose}>Close</button></div>
        {children}
      </motion.div>
    </motion.div>
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
        <button className="primary">{mode === "login" ? "Sign in" : "Create account"}</button>
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
    <Dialog title="Host an event" onClose={onClose}>
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
        <button className="primary">Publish event</button>
      </form>
    </Dialog>
  );
}
