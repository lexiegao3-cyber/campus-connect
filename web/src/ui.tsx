import { useEffect, useState, type ReactNode } from "react";
import type { Activity, Category, Notification, Reason } from "./api";
import { hasKey, useI18n } from "./i18n";

const PATHS: Record<string, string> = {
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5 5-2Z",
  plus: "M12 5v14M5 12h14",
  calendar: "M4 7h16v13H4zM4 11h16M9 4v4M15 4v4",
  bell: "M6 10a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Zm4 9a2 2 0 0 0 4 0",
  pin: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2",
  users: "M16 19v-1a4 4 0 0 0-8 0v1M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 8v-1a3 3 0 0 0-2-2.8M17 5.2a3 3 0 0 1 0 5.6",
  back: "M15 5l-7 7 7 7",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12M18 6 6 18",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Zm0 0v14m6-12v14",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  locate: "M12 2v3m0 14v3M2 12h3m14 0h3M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  slash: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.6 5.6l12.8 12.8",
  spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 3-4.5-4.5",
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}

const SPORT_EMOJI: Record<string, string> = {
  badminton: "🏸", basketball: "🏀", tennis: "🎾", "table-tennis": "🏓", soccer: "⚽", volleyball: "🏐",
  running: "🏃", gym: "🏋️", swimming: "🏊", hiking: "🥾", cycling: "🚴", yoga: "🧘",
};
const CAT_EMOJI: Record<Category, string> = { sports: "🏸", meal: "🍜", study: "📚", movie: "🎬", travel: "🧳", other: "✨" };
export const emojiFor = (category: Category, sport?: string | null) => (sport && SPORT_EMOJI[sport]) || CAT_EMOJI[category];

export function useKindLabel() {
  const { t } = useI18n();
  return (category: Category, sport?: string | null) => (sport ? t(`sport.${sport}` as "sport.badminton") : t(`cat.${category}` as "cat.sports"));
}

/** Re-renders every `ms` so countdowns stay current. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function Chips<T extends string>({ options, value, onChange, label, multi }: {
  options: readonly T[]; value: T | T[]; onChange(v: T | T[]): void; label(o: T): ReactNode; multi?: boolean;
}) {
  const on = (o: T) => (multi ? (value as T[]).includes(o) : value === o);
  return (
    <div className="chips" role={multi ? "group" : "radiogroup"}>
      {options.map((o) => (
        <button key={o} type="button" className={`chip ${on(o) ? "on" : ""}`} aria-pressed={on(o)}
          onClick={() => (multi ? onChange(on(o) ? (value as T[]).filter((x) => x !== o) : [...(value as T[]), o]) : onChange(o))}>
          {label(o)}
        </button>
      ))}
    </div>
  );
}

/** One dot per person: filled = joined (host included). */
export function Seats({ joined, capacity }: { joined: number; capacity: number }) {
  const n = Math.min(capacity, 12);
  return (
    <span className="seats" aria-label={`${joined}/${capacity}`}>
      {Array.from({ length: n }, (_, i) => <i key={i} className={i < joined ? "on" : ""} />)}
      {capacity > 12 && <small>+{capacity - 12}</small>}
    </span>
  );
}

export function useReasonText() {
  const { t, when } = useI18n();
  return (r: Reason) => {
    const key = `r.${r.code}`;
    if (!hasKey(key)) return r.code;
    const p = { ...r.params };
    if (typeof p.when === "string") p.when = when(p.when);
    if (typeof p.level === "string") p.level = t(`level.${p.level}` as "level.any");
    return t(key, p);
  };
}

export function Reasons({ reasons }: { reasons?: Reason[] }) {
  const text = useReasonText();
  if (!reasons?.length) return null;
  return (
    <ul className="reasons">
      {reasons.map((r, i) => <li key={i}><Icon name="spark" size={14} /> {text(r)}</li>)}
    </ul>
  );
}

export function StatusPill({ a }: { a: Activity }) {
  const { t } = useI18n();
  return <span className={`pill s-${a.status}`}>{t(`status.${a.status}` as "status.open")}</span>;
}

export function ActivityCard({ a, onOpen, compact }: { a: Activity; onOpen(): void; compact?: boolean }) {
  const { t, when, duration } = useI18n();
  const kind = useKindLabel();
  const now = useNow();
  const left = new Date(a.fillBy).getTime() - now;
  return (
    <article className={`card act c-${a.category}`} onClick={onOpen} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen()}>
      <div className="act-top">
        <span className="badge"><span className="emoji">{emojiFor(a.category, a.sport)}</span>{kind(a.category, a.sport)}
          {a.category === "sports" && a.level !== "any" && <span className="lvl"> · {t(`level.${a.level}` as "level.any")}</span>}</span>
        {a.youHost ? <span className="pill mine">{t("card.yours")}</span> : a.youJoined ? <span className="pill mine">{t("card.you")}</span> : a.status !== "open" && <StatusPill a={a} />}
      </div>
      <h3>{a.title}</h3>
      <p className="meta"><Icon name="clock" size={15} /> {when(a.startsAt, a.endsAt)}</p>
      <p className="meta"><Icon name="pin" size={15} /> {a.area.name}{a.distanceKm !== undefined && <b> · {t("card.km", { km: a.distanceKm })}</b>}</p>
      {!compact && a.reasons && <Reasons reasons={a.reasons} />}
      <div className="act-foot">
        <Seats joined={a.joinedCount} capacity={a.capacity} />
        <span className="spots">{a.spotsLeft === 1 ? t("card.spot") : a.spotsLeft > 0 ? t("card.spots", { n: a.spotsLeft }) : t("card.full")}</span>
        {a.status === "open" && left > 0 && <span className={`due ${left < 2 * 3600_000 ? "soon" : ""}`}>{t("card.closes", { t: duration(left) })}</span>}
      </div>
    </article>
  );
}

export function useNotificationText() {
  const { t, when } = useI18n();
  return (n: Notification) => {
    const key = `n.${n.type}`;
    const p: Record<string, string | number> = { title: n.activity?.title ?? "" };
    for (const [k, v] of Object.entries(n.params ?? {})) if (typeof v === "string" || typeof v === "number") p[k] = v;
    const slot = n.params?.slot as { start?: string } | undefined;
    if (slot?.start) p.when = when(slot.start);
    return hasKey(key) ? t(key, p) : n.type;
  };
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
