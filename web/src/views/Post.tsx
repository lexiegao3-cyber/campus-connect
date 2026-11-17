import { useState, type FormEvent } from "react";
import { api, CATEGORIES, LEVELS, SPORTS, type Activity, type Category, type Level, type Matched, type Point } from "../api";
import { useI18n } from "../i18n";
import { MapView } from "../MapView";
import { useStore } from "../store";
import { Chips, emojiFor, Icon, Reasons, useKindLabel } from "../ui";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function useLocate() {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    locate: (set: (p: Point) => void) => {
      if (!navigator.geolocation) return;
      setBusy(true);
      navigator.geolocation.getCurrentPosition(
        (p) => (set({ lat: p.coords.latitude, lng: p.coords.longitude }), setBusy(false)),
        () => setBusy(false),
        { timeout: 8000 },
      );
    },
  };
}

export function Post({ initialKind, prefill }: { initialKind?: "activity" | "seek"; prefill?: Record<string, unknown> }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<"activity" | "seek" | undefined>(initialKind);
  if (!kind)
    return (
      <>
        <section className="hero"><h1>{t("post.title")}</h1></section>
        <div className="choose">
          <button className="card choice c-sports" onClick={() => setKind("activity")}>
            <span className="big-emoji">🏸</span><b>{t("post.activity")}</b><small>{t("post.activitySub")}</small>
          </button>
          <button className="card choice c-study" onClick={() => setKind("seek")}>
            <span className="big-emoji">🙋</span><b>{t("post.seek")}</b><small>{t("post.seekSub")}</small>
          </button>
        </div>
      </>
    );
  return kind === "activity" ? <ActivityForm prefill={prefill} onBack={() => setKind(undefined)} /> : <SeekForm onBack={() => setKind(undefined)} />;
}

function KindPicker({ category, sport, level, set }: {
  category: Category; sport: string; level: Level; set(p: { category?: Category; sport?: string; level?: Level }): void;
}) {
  const { t } = useI18n();
  return (
    <>
      <label className="label">{t("form.category")}</label>
      <Chips options={CATEGORIES} value={category} onChange={(c) => set({ category: c as Category })}
        label={(c) => <><span className="emoji">{emojiFor(c)}</span> {t(`cat.${c}` as "cat.sports")}</>} />
      {category === "sports" && (
        <>
          <label className="label">{t("form.sport")}</label>
          <Chips options={SPORTS} value={sport as (typeof SPORTS)[number]} onChange={(s) => set({ sport: s as string })}
            label={(s) => <><span className="emoji">{emojiFor("sports", s)}</span> {t(`sport.${s}` as "sport.badminton")}</>} />
          <label className="label">{t("form.level")}</label>
          <Chips options={LEVELS} value={level} onChange={(l) => set({ level: l as Level })} label={(l) => t(`level.${l}` as "level.any")} />
        </>
      )}
    </>
  );
}

const FILL = [["30m", 30], ["1h", 60], ["2h", 120], ["6h", 360], ["1d", 1440]] as const;

function ActivityForm({ prefill, onBack }: { prefill?: Record<string, unknown>; onBack(): void }) {
  const s = useStore();
  const { t } = useI18n();
  const kindLabel = useKindLabel();
  const tomorrow = new Date(Date.now() + 864e5);
  const pStart = prefill?.start ? new Date(String(prefill.start)) : null;
  const pEnd = prefill?.end ? new Date(String(prefill.end)) : null;
  const [f, setF] = useState({
    category: (prefill?.category as Category) ?? "sports", sport: (prefill?.sport as string) ?? "badminton", level: (prefill?.level as Level) ?? "intermediate",
    title: "", date: ymd(pStart ?? tomorrow), start: pStart ? hm(pStart) : "18:00", end: pEnd ? hm(pEnd) : "20:00",
    capacity: 4, fill: 120, area: "", exact: "", notes: "", point: null as Point | null,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ activity: Activity; matched: Matched[] } | null>(null);
  const loc = useLocate();
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const startsAt = new Date(`${f.date}T${f.start}`);
    let endsAt = new Date(`${f.date}T${f.end}`);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 864e5);
    const fillBy = new Date(Math.max(startsAt.getTime() - f.fill * 60_000, Date.now() + 5 * 60_000));
    setBusy(true);
    try {
      const r = await api.createActivity({
        title: f.title.trim() || kindLabel(f.category, f.category === "sports" ? f.sport : null),
        category: f.category, sport: f.category === "sports" ? f.sport : null, level: f.category === "sports" ? f.level : "any",
        startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), fillBy: fillBy.toISOString(), capacity: f.capacity,
        area: { name: f.area.trim() || "Campus", point: f.point ?? undefined }, exactLocation: f.exact.trim(), notes: f.notes.trim(),
      });
      setDone(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <section className="result">
        <span className="big-emoji">{emojiFor(done.activity.category, done.activity.sport)}</span>
        <h1>{done.activity.title}</h1>
        <p className="lead">{done.matched.length ? t("result.notified", { n: done.matched.length }) : t("result.none")}</p>
        <div className="list">
          {done.matched.map((m) => (
            <article key={m.seek} className="card person">
              <span className="avatar">{m.user.name.slice(0, 1)}</span>
              <div className="grow"><b>{m.user.name}</b><Reasons reasons={m.reasons} /></div>
              <span className="score">{Math.round(m.score * 100)}</span>
            </article>
          ))}
        </div>
        <button className="btn primary wide" onClick={() => s.go({ name: "activity", id: done.activity.id })}>{t("result.view")}</button>
      </section>
    );

  return (
    <form className="form" onSubmit={submit}>
      <button type="button" className="link back" onClick={onBack}><Icon name="back" size={18} /> {t("common.back")}</button>
      <h1>{t("post.activity")}</h1>
      <KindPicker category={f.category} sport={f.sport} level={f.level} set={set} />
      <label className="field"><span>{t("form.title")}</span>
        <input maxLength={80} value={f.title} onChange={(e) => set({ title: e.target.value })} placeholder={t("form.titlePh")} />
      </label>
      <div className="grid3">
        <label className="field"><span>{t("form.date")}</span><input type="date" required value={f.date} min={ymd(new Date())} onChange={(e) => set({ date: e.target.value })} /></label>
        <label className="field"><span>{t("form.from")}</span><input type="time" required value={f.start} onChange={(e) => set({ start: e.target.value })} /></label>
        <label className="field"><span>{t("form.to")}</span><input type="time" required value={f.end} onChange={(e) => set({ end: e.target.value })} /></label>
      </div>
      <div className="row between center">
        <label className="label">{t("form.people")}</label>
        <div className="stepper">
          <button type="button" onClick={() => set({ capacity: Math.max(2, f.capacity - 1) })} aria-label="−">−</button>
          <b>{f.capacity}</b>
          <button type="button" onClick={() => set({ capacity: Math.min(50, f.capacity + 1) })} aria-label="+">+</button>
        </div>
      </div>
      <label className="label">{t("form.fillBy")} · <span className="muted">{t("form.fill.before")}</span></label>
      <Chips options={FILL.map(([k]) => k)} value={FILL.find(([, m]) => m === f.fill)![0]} onChange={(k) => set({ fill: FILL.find(([kk]) => kk === k)![1] })}
        label={(k) => t(`form.fill.${k}` as "form.fill.1h")} />
      <p className="small muted">{t("form.fillByHint")}</p>
      <label className="field"><span>{t("form.area")}</span>
        <input maxLength={120} value={f.area} onChange={(e) => set({ area: e.target.value })} placeholder={t("form.areaPh")} />
      </label>
      <div className="row gap-s">
        <button type="button" className="btn ghost small" onClick={() => loc.locate((p) => set({ point: p }))} disabled={loc.busy}>
          <Icon name="locate" size={16} /> {f.point ? t("form.located") : t("form.useLocation")}
        </button>
      </div>
      <MapView pick={f.point} onPick={(p) => set({ point: p })} height={200} />
      <label className="field"><span>{t("form.exact")}</span>
        <input maxLength={200} value={f.exact} onChange={(e) => set({ exact: e.target.value })} placeholder={t("form.exactPh")} />
      </label>
      <label className="field"><span>{t("form.notes")}</span>
        <textarea maxLength={500} rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary wide" disabled={busy}>{t("form.publish")}</button>
    </form>
  );
}

const TIMES = { morning: ["08:00", "12:00"], afternoon: ["12:00", "17:00"], evening: ["18:00", "22:00"] } as const;
const DAYS = [1, 2, 3, 4, 5, 6, 7];

function SeekForm({ onBack }: { onBack(): void }) {
  const s = useStore();
  const { t, lang } = useI18n();
  const today = new Date();
  const [f, setF] = useState({
    category: "sports" as Category, sport: "badminton", level: "intermediate" as Level, range: "week" as "week" | "weekend" | "2w",
    days: [1, 2, 3, 4, 5], time: "evening" as keyof typeof TIMES | "custom", start: "18:00", end: "22:00",
    point: null as Point | null, km: 5, note: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loc = useLocate();
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const dayName = (d: number) => new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { weekday: "short" }).format(new Date(2024, 0, d)); // Jan 1 2024 was a Monday

  function range(): [string, string] {
    if (f.range === "weekend") {
      const toSat = (6 - today.getDay() + 7) % 7;
      const sat = new Date(today.getTime() + toSat * 864e5);
      return [ymd(today.getDay() === 0 ? today : sat), ymd(new Date(sat.getTime() + 864e5))];
    }
    return [ymd(today), ymd(new Date(today.getTime() + (f.range === "2w" ? 13 : 6) * 864e5))];
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const [from, to] = range();
    const [start, end] = f.time === "custom" ? [f.start, f.end] : TIMES[f.time];
    setBusy(true);
    try {
      const r = await api.createSeek({
        category: f.category, sport: f.category === "sports" ? f.sport : null, level: f.category === "sports" ? f.level : "any",
        availability: { from, to, days: f.range === "weekend" ? [6, 7] : f.days, start, end, tz: tz() },
        area: f.point ? { name: "Me", point: f.point } : undefined, maxDistanceKm: f.km, note: f.note.trim(),
      });
      s.go({ name: "seek", id: r.seek.id });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <button type="button" className="link back" onClick={onBack}><Icon name="back" size={18} /> {t("common.back")}</button>
      <h1>{t("post.seek")}</h1>
      <KindPicker category={f.category} sport={f.sport} level={f.level} set={set} />
      <h2 className="sub">{t("form.when")}</h2>
      <label className="label">{t("form.range")}</label>
      <Chips options={["week", "weekend", "2w"] as const} value={f.range} onChange={(r) => set({ range: r as typeof f.range })} label={(r) => t(`form.range.${r}` as "form.range.week")} />
      {f.range !== "weekend" && (
        <>
          <label className="label">{t("form.days")}</label>
          <div className="days">
            {DAYS.map((d) => (
              <button type="button" key={d} className={`day ${f.days.includes(d) ? "on" : ""}`} aria-pressed={f.days.includes(d)}
                onClick={() => set({ days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d].sort() })}>{dayName(d)}</button>
            ))}
          </div>
        </>
      )}
      <Chips options={["morning", "afternoon", "evening", "custom"] as const} value={f.time} onChange={(v) => set({ time: v as typeof f.time })}
        label={(v) => <>{t(`form.time.${v}` as "form.time.morning")}{v !== "custom" && <small> {TIMES[v][0]}–{TIMES[v][1]}</small>}</>} />
      {f.time === "custom" && (
        <div className="grid2">
          <label className="field"><span>{t("form.from")}</span><input type="time" value={f.start} onChange={(e) => set({ start: e.target.value })} /></label>
          <label className="field"><span>{t("form.to")}</span><input type="time" value={f.end} onChange={(e) => set({ end: e.target.value })} /></label>
        </div>
      )}
      <div className="row gap-s center wrap">
        <button type="button" className="btn ghost small" onClick={() => loc.locate((p) => set({ point: p }))} disabled={loc.busy}>
          <Icon name="locate" size={16} /> {f.point ? t("form.located") : t("form.useLocation")}
        </button>
        {f.point && (
          <label className="range-field">{t("form.distance", { km: f.km })}
            <input type="range" min={1} max={20} value={f.km} onChange={(e) => set({ km: Number(e.target.value) })} />
          </label>
        )}
      </div>
      <label className="field"><span>{t("form.note")}</span>
        <input maxLength={300} value={f.note} onChange={(e) => set({ note: e.target.value })} placeholder={t("form.notePh")} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary wide" disabled={busy || (f.range !== "weekend" && !f.days.length)}>{t("form.find")}</button>
    </form>
  );
}
