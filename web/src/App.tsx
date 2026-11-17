import { useEffect, useState } from "react";
import { api, getToken, type Me, type Notification } from "./api";
import { useI18n } from "./i18n";
import { StoreProvider, useStore, type Route } from "./store";
import { Icon, useNotificationText } from "./ui";
import { ActivityPage } from "./views/ActivityPage";
import { Auth } from "./views/Auth";
import { Discover } from "./views/Discover";
import { Inbox } from "./views/Inbox";
import { Mine } from "./views/Mine";
import { Post } from "./views/Post";
import { SeekPage } from "./views/SeekPage";

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(getToken() ? undefined : null);
  useEffect(() => {
    if (me === undefined) api.me().then(setMe, () => setMe(null));
  }, [me]);
  if (me === undefined) return <div className="splash" aria-busy="true" />;
  if (!me) return <Auth onIn={setMe} />;
  return (
    <StoreProvider me={me} onLogout={() => setMe(null)}>
      <Shell />
    </StoreProvider>
  );
}

const TABS: { route: Route["name"]; icon: string; key: "nav.discover" | "nav.post" | "nav.mine" | "nav.inbox" }[] = [
  { route: "discover", icon: "compass", key: "nav.discover" },
  { route: "post", icon: "plus", key: "nav.post" },
  { route: "mine", icon: "calendar", key: "nav.mine" },
  { route: "inbox", icon: "bell", key: "nav.inbox" },
];

function Shell() {
  const s = useStore();
  const { t, lang, setLang } = useI18n();
  const text = useNotificationText();
  useEffect(() => {
    const h = (e: Event) => s.flash(text((e as CustomEvent<Notification>).detail));
    addEventListener("spotme:notification", h);
    return () => removeEventListener("spotme:notification", h);
  }, [s.flash, text]);
  const r = s.route;
  return (
    <div className="shell">
      <header className="top">
        <button className="brand" onClick={() => s.go({ name: "discover" })}>
          <span className="logo">sm</span>
          <span className="brand-text"><b>{t("app.name")}</b><small>{s.me.school.name}</small></span>
        </button>
        <div className="top-right">
          <span className={`live ${s.live ? "on" : ""}`} title={s.live ? t("live.on") : t("live.off")}><i />{s.live ? t("live.on") : t("live.off")}</span>
          <button className="lang" onClick={() => setLang(lang === "en" ? "zh" : "en")}>{lang === "en" ? "中文" : "EN"}</button>
        </div>
      </header>
      <main className="page">
        {r.name === "discover" && <Discover />}
        {r.name === "post" && <Post initialKind={r.kind} prefill={r.prefill} />}
        {r.name === "mine" && <Mine />}
        {r.name === "inbox" && <Inbox />}
        {r.name === "activity" && <ActivityPage id={r.id} />}
        {r.name === "seek" && <SeekPage id={r.id} />}
      </main>
      <nav className="tabbar" aria-label="Main">
        {TABS.map((tab) => (
          <button key={tab.route} className={`tab ${r.name === tab.route ? "on" : ""} ${tab.route === "post" ? "post" : ""}`}
            onClick={() => s.go({ name: tab.route } as Route)} aria-current={r.name === tab.route ? "page" : undefined}>
            <span className="tab-icon"><Icon name={tab.icon} />{tab.route === "inbox" && s.unread > 0 && <b className="dot">{s.unread > 9 ? "9+" : s.unread}</b>}</span>
            <span className="tab-label">{t(tab.key)}</span>
          </button>
        ))}
      </nav>
      {s.toast && <div className="toast" role="status">{s.toast}</div>}
    </div>
  );
}
