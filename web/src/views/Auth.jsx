import { useEffect, useRef, useState } from "react";
import { api, setToken } from "../api";
import { appConfig } from "../config";
import { useI18n } from "../i18n";
import { emojiFor } from "../ui";

const gis = () => (window).google;

export function Auth({
  onIn
}) {
  const { t, lang, setLang } = useI18n();
  const [cfg, setCfg] = useState(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [school, setSchool] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const gBtn = useRef(null);

  useEffect(() => {
    void appConfig().then(setCfg);
  }, []);

  // Live school detection as the email is typed.
  useEffect(() => {
    if (!email.includes("@") || email.endsWith("@")) return setSchool(null);
    const id = setTimeout(() => api.lookupSchool(email).then((r) => setSchool(r.school), () => setSchool(null)), 250);
    return () => clearTimeout(id);
  }, [email]);

  // Google Identity Services button, when the server has a client id.
  useEffect(() => {
    if (!cfg?.googleClientId || !gBtn.current) return;
    const init = () => {
      gis().accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: async (r) => {
          try {
            const res = await api.google(r.credential);
            setToken(res.token);
            onIn(res.user);
          } catch (e) {
            setError((e).message);
          }
        },
      });
      gis().accounts.id.renderButton(gBtn.current, { theme: "outline", size: "large", shape: "pill", width: 320, locale: lang === "zh" ? "zh_CN" : "en" });
    };
    if (gis()?.accounts) return init();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = init;
    document.head.appendChild(s);
  }, [cfg, lang, onIn]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.devLogin(email.trim(), name.trim());
      setToken(res.token);
      onIn(res.user);
    } catch (err) {
      setError((err).message);
    } finally {
      setBusy(false);
    }
  }

  const tiles = [["sports", "badminton"], ["meal", null], ["study", null], ["sports", "basketball"], ["movie", null], ["travel", null], ["sports", "running"], ["sports", "tennis"]];
  return (
    <div className="auth">
      <div className="auth-art" aria-hidden>
        {tiles.map(([c, s], i) => <span key={i} className={`tile c-${c}`} style={{ ["--i"]: i }}>{emojiFor(c, s)}</span>)}
      </div>
      <div className="auth-body">
        <div className="row between">
          <span className="brand static"><span className="logo">sm</span><b>{t("app.name")}</b></span>
          <button className="lang" onClick={() => setLang(lang === "en" ? "zh" : "en")}>{lang === "en" ? "中文" : "EN"}</button>
        </div>
        <h1>{t("auth.title")}</h1>
        <p className="lead">{t("auth.sub")}</p>
        {cfg?.googleClientId && (
          <>
            <div ref={gBtn} className="gbtn" />
            {cfg.devLogin && <p className="or"><span>{t("auth.or")}</span></p>}
          </>
        )}
        {cfg?.devLogin !== false && (
          <form onSubmit={submit} className="stack">
            <label className="field"><span>{t("auth.email")}</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@upenn.edu" />
            </label>
            <p className={`school-hint ${school ? "ok" : ""}`} aria-live="polite">
              {school ? t("auth.school", { school: school.name }) : email.includes("@") && !email.endsWith("@") ? t("auth.notSchool") : " "}
            </p>
            <label className="field"><span>{t("auth.name")}</span>
              <input
                required
                maxLength={60}
                autoComplete="given-name"
                value={name}
                onChange={(e) => setName(e.target.value)} />
            </label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn primary wide" disabled={busy || !school || !name.trim()}>{t("auth.go")}</button>
            {!cfg?.googleClientId && <p className="small muted center">{t("auth.devNote")}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
