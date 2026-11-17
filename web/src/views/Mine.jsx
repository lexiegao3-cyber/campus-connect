import { useEffect, useState } from "react";
import { api } from "../api";
import { useI18n } from "../i18n";
import { useStore } from "../store";
import { ActivityCard, emojiFor, Empty, useKindLabel } from "../ui";

export function Mine() {
  const s = useStore();
  const { t, lang, setLang } = useI18n();
  const kind = useKindLabel();
  const [acts, setActs] = useState(null);
  const [seeks, setSeeks] = useState(null);
  const [tab, setTab] = useState("hosting");
  useEffect(() => {
    api.mine().then((r) => setActs(r.items), () => setActs([]));
    api.mySeeks().then((r) => setSeeks(r.items), () => setSeeks([]));
  }, [s.version]);
  const hosting = acts?.filter((a) => a.youHost) ?? [];
  const joined = acts?.filter((a) => a.youJoined) ?? [];
  const open = (id) => s.go({ name: "activity", id });
  return (
    <>
      <section className="hero"><h1>{t("mine.title")}</h1></section>
      <div className="seg wide" role="tablist">
        {(["hosting", "joined", "seeks"]).map((k) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {t(`mine.${k}`)} <small>{k === "hosting" ? hosting.length : k === "joined" ? joined.length : seeks?.length ?? 0}</small>
          </button>
        ))}
      </div>
      <div className="list">
        {tab === "hosting" && (hosting.length ? hosting.map((a) => <ActivityCard key={a.id} a={a} onOpen={() => open(a.id)} compact />) : acts && <Empty>{t("mine.noHosting")}</Empty>)}
        {tab === "joined" && (joined.length ? joined.map((a) => <ActivityCard key={a.id} a={a} onOpen={() => open(a.id)} compact />) : acts && <Empty>{t("mine.noJoined")}</Empty>)}
        {tab === "seeks" && (seeks?.length ? seeks.map((x) => (
          <article key={x.id} className={`card seek c-${x.category}`}>
            <span className="big-emoji small">{emojiFor(x.category, x.sport)}</span>
            <div className="grow">
              <b>{kind(x.category, x.sport)}</b>
              <p className="muted small">{x.availability.from} → {x.availability.to} · {x.availability.start}–{x.availability.end}</p>
            </div>
            <div className="col gap-s">
              <button
                className="btn small primary"
                onClick={() => s.go({ name: "seek", id: x.id })}>{t("mine.matches")}</button>
              <button
                className="btn small ghost"
                onClick={async () => { await api.closeSeek(x.id); setSeeks((xs) => xs?.filter((y) => y.id !== x.id) ?? null); }}>{t("mine.close")}</button>
            </div>
          </article>
        )) : seeks && <Empty>{t("mine.noSeeks")}</Empty>)}
      </div>
      <section className="card profile">
        <h2 className="sub">{t("mine.profile")}</h2>
        <p><b>{s.me.name}</b> · {s.me.email}</p>
        <p className="muted small">{s.me.school.name} · {t("mine.tz")}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p>
        <div className="row between center">
          <span>{t("mine.lang")}</span>
          <div className="seg">
            <button
              className={lang === "en" ? "on" : ""}
              onClick={() => (setLang("en"), void api.updateMe({ lang: "en" }))}>English</button>
            <button
              className={lang === "zh" ? "on" : ""}
              onClick={() => (setLang("zh"), void api.updateMe({ lang: "zh" }))}>中文</button>
          </div>
        </div>
        <button className="btn ghost wide" onClick={s.logout}>{t("mine.signOut")}</button>
      </section>
    </>
  );
}
