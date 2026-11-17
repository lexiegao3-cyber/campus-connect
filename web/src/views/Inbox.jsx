import { useI18n } from "../i18n";
import { useStore } from "../store";
import { Empty, useNotificationText } from "../ui";

const ICON = {
  match: "✨", "seek-match": "🤝", joined: "🙋", left: "👋", full: "🎉", deadline: "⏰", confirmed: "✅", cancelled: "❌", "auto-cancelled": "❌", closed: "🔒",
};

export function Inbox() {
  const s = useStore();
  const { t, lang } = useI18n();
  const text = useNotificationText();
  const ago = new Intl.RelativeTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { numeric: "auto" });
  const rel = (iso) => {
    const m = Math.round((new Date(iso).getTime() - Date.now()) / 60_000);
    return Math.abs(m) < 60 ? ago.format(m, "minute") : Math.abs(m) < 1440 ? ago.format(Math.round(m / 60), "hour") : ago.format(Math.round(m / 1440), "day");
  };
  return (
    <>
      <section className="hero row between center">
        <h1>{t("inbox.title")}</h1>
        {s.unread > 0 && <button className="btn ghost small" onClick={s.markAllRead}>{t("inbox.markRead")}</button>}
      </section>
      {s.notifications.length === 0 && <Empty>{t("inbox.empty")}</Empty>}
      <ul className="inbox">
        {s.notifications.map((n) => (
          <li key={n.id} className={n.read ? "" : "unread"}>
            <button
              onClick={() => (n.activity ? s.go({ name: "activity", id: n.activity.id }) : n.seek && s.go({ name: "seek", id: n.seek }))}>
              <span className="n-icon">{ICON[n.type] ?? "•"}</span>
              <span className="grow"><span className="n-text">{text(n)}</span><small className="muted">{rel(n.createdAt)}</small></span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
