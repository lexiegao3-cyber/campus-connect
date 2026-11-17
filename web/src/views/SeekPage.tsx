import { useEffect, useState } from "react";
import { api, type Matches, type Seek } from "../api";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { ActivityCard, emojiFor, Empty, Icon, Reasons, useKindLabel } from "../ui";

export function SeekPage({ id }: { id: string }) {
  const s = useStore();
  const { t, when } = useI18n();
  const kind = useKindLabel();
  const [data, setData] = useState<{ seek: Seek; matches: Matches } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api.seekMatches(id).then(setData, (e) => setError((e as Error).message));
  }, [id, s.version]);
  if (error) return <p className="error">{error}</p>;
  if (!data) return <div className="splash" aria-busy="true" />;
  const { seek, matches } = data;
  const av = seek.availability;
  return (
    <section className="seek-page">
      <button className="link back" onClick={() => s.go({ name: "mine" })}><Icon name="back" size={18} /> {t("common.back")}</button>
      <div className={`seek-head c-${seek.category}`}>
        <span className="big-emoji">{emojiFor(seek.category, seek.sport)}</span>
        <div>
          <p className="kicker">{t("result.matchesTitle")}</p>
          <h1>{kind(seek.category, seek.sport)}{seek.category === "sports" && seek.level !== "any" && ` · ${t(`level.${seek.level}` as "level.any")}`}</h1>
          <p className="muted small">{av.from} → {av.to} · {av.start}–{av.end}{seek.note && ` · ${seek.note}`}</p>
        </div>
      </div>
      <h2 className="sub">{t("result.activities")}</h2>
      {matches.activities.length === 0 && <Empty>{t("result.noActivities")}</Empty>}
      <div className="list">{matches.activities.map((a) => <ActivityCard key={a.id} a={a} onOpen={() => s.go({ name: "activity", id: a.id })} />)}</div>
      <h2 className="sub">{t("result.buddies")}</h2>
      {matches.buddies.length === 0 && <Empty>{t("result.noBuddies")}</Empty>}
      <div className="list">
        {matches.buddies.map((b) => (
          <article key={b.seek} className="card person">
            <span className="avatar">{b.user.name.slice(0, 1)}</span>
            <div className="grow">
              <b>{b.user.name}</b> {b.note && <span className="muted small">“{b.note}”</span>}
              <Reasons reasons={b.reasons} />
              <button className="btn small primary" onClick={() => s.go({ name: "post", kind: "activity", prefill: { category: seek.category, sport: seek.sport, level: seek.level, start: b.slot.start, end: b.slot.end } })}>
                <Icon name="plus" size={16} /> {t("result.startTogether")} · {when(b.slot.start)}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
