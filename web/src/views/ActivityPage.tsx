import { useEffect, useState } from "react";
import { api, type Activity } from "../api";
import { useI18n } from "../i18n";
import { MapView } from "../MapView";
import { useStore } from "../store";
import { emojiFor, Icon, Seats, StatusPill, useKindLabel, useNow } from "../ui";

export function ActivityPage({ id }: { id: string }) {
  const s = useStore();
  const { t, when, duration } = useI18n();
  const kind = useKindLabel();
  const now = useNow(15_000);
  const [a, setA] = useState<Activity | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    api.activity(id).then(setA, (e) => setError((e as Error).message));
  }, [id, s.version]);

  async function act(f: () => Promise<Activity | { activity: Activity; conflicts: { title: string }[] }>) {
    setError("");
    setBusy(true);
    try {
      const r = await f();
      if ("activity" in r) {
        setA(r.activity);
        if (r.conflicts[0]) s.flash(t("act.conflict", { title: r.conflicts[0].title }));
      } else setA(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !a) return <p className="error">{error}</p>;
  if (!a) return <div className="splash" aria-busy="true" />;
  const left = new Date(a.fillBy).getTime() - now;
  const started = new Date(a.startsAt).getTime() <= now;
  const maps = a.area.point ? `https://www.google.com/maps/search/?api=1&query=${a.area.point.lat},${a.area.point.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a.area.name)}`;

  return (
    <article className={`detail c-${a.category}`}>
      <div className="detail-head">
        <button className="link back" onClick={() => history.length > 1 ? history.back() : s.go({ name: "discover" })}><Icon name="back" size={18} /> {t("common.back")}</button>
        {!a.youHost && (
          <div className="menu">
            <button className="icon-btn" aria-label="More" onClick={() => setMenu(!menu)}>⋯</button>
            {menu && (
              <div className="menu-pop">
                <button onClick={async () => {
                  const reason = prompt(t("act.reportPrompt"));
                  if (reason && reason.trim().length >= 3) (await api.report({ activity: a.id, targetUser: a.host.id, reason }), s.flash(t("act.reported")));
                  setMenu(false);
                }}><Icon name="flag" size={16} /> {t("act.report")}</button>
                <button onClick={async () => { await api.block(a.host.id); s.flash(t("act.blocked")); s.go({ name: "discover" }, true); }}>
                  <Icon name="slash" size={16} /> {t("act.block")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="detail-hero">
        <span className="big-emoji">{emojiFor(a.category, a.sport)}</span>
        <div>
          <p className="kicker">{kind(a.category, a.sport)}{a.category === "sports" && a.level !== "any" && ` · ${t(`level.${a.level}` as "level.any")}`}</p>
          <h1>{a.title}</h1>
          <div className="row gap-s wrap"><StatusPill a={a} />{a.youHost && <span className="pill mine">{t("act.youHost")}</span>}</div>
        </div>
      </div>

      {a.status === "deciding" && a.youHost && (
        <section className="decide">
          <b>{a.spotsLeft === 0 ? t("act.decideTitleFull") : t("act.decideTitle")}</b>
          <p>{a.spotsLeft === 0 ? t("act.decideSubFull", { cap: a.capacity }) : t("act.decideSub", { n: a.joinedCount, cap: a.capacity })}</p>
          <div className="row gap-s">
            <button className="btn primary grow" disabled={busy || a.joinedCount < 2} onClick={() => act(() => api.decide(a.id, "start"))}>{t("act.start")}</button>
            <button className="btn ghost grow" disabled={busy} onClick={() => act(() => api.decide(a.id, "cancel"))}>{t("act.cancel")}</button>
          </div>
        </section>
      )}
      {a.status === "deciding" && !a.youHost && <p className="banner">{t("act.waiting")}</p>}
      {a.status === "confirmed" && <p className="banner ok">{t("act.confirmed", { n: a.joinedCount })}</p>}
      {a.status === "cancelled" && <p className="banner bad">{t("act.cancelledMsg")}</p>}

      <dl className="facts">
        <div><dt><Icon name="clock" size={18} /> {t("act.when")}</dt><dd>{when(a.startsAt, a.endsAt)}
          {a.status === "open" && left > 0 && <small className={left < 2 * 3600_000 ? "soon" : ""}> · {t("card.closes", { t: duration(left) })}</small>}</dd></div>
        <div><dt><Icon name="pin" size={18} /> {t("act.where")}</dt><dd>{a.area.name}
          <small>{a.exactLocation ? ` · ${a.exactLocation}` : a.youHost || a.youJoined ? "" : ` · ${t("act.exactHidden")}`}</small></dd></div>
        <div><dt><Icon name="users" size={18} /> {t("act.people")}</dt><dd><Seats joined={a.joinedCount} capacity={a.capacity} /> {a.joinedCount}/{a.capacity}</dd></div>
      </dl>

      <div className="people">
        <span className="avatar host" title={t("act.host")}>{a.host.name.slice(0, 1)}</span>
        {a.participants?.map((p) => <span key={p.id} className="avatar" title={p.name}>{p.name.slice(0, 1)}</span>)}
        <span className="muted small">{t("card.host", { name: a.host.name })}{a.participants?.length ? ` · ${a.participants.map((p) => p.name).join(", ")}` : ""}</span>
      </div>

      {a.notes && <p className="notes">{a.notes}</p>}
      {a.area.point && <MapView items={[a]} height={200} />}
      <a className="link" href={maps} target="_blank" rel="noopener noreferrer"><Icon name="map" size={16} /> {t("act.maps")}</a>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="cta">
        {!a.youHost && !a.youJoined && a.status === "open" && (
          <button className="btn primary wide" disabled={busy} onClick={() => act(() => api.join(a.id))}>{t("act.join")}</button>
        )}
        {a.youJoined && !started && ["open", "full", "deciding", "confirmed"].includes(a.status) && (
          <button className="btn ghost wide" disabled={busy} onClick={() => act(() => api.leave(a.id))}>{t("act.leave")}</button>
        )}
        {a.youHost && ["open", "full"].includes(a.status) && !started && (
          <div className="row gap-s">
            <button className="btn ghost grow" disabled={busy || a.joinedCount < 2} onClick={() => act(() => api.decide(a.id, "start"))}>{t("act.startEarly")}</button>
            <button className="btn ghost grow danger" disabled={busy} onClick={() => act(() => api.decide(a.id, "cancel"))}>{t("act.cancel")}</button>
          </div>
        )}
      </div>
    </article>
  );
}
