import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io } from "socket.io-client";
import { api, getToken, setToken } from "./api";

export function parsePath(path) {
  const [, a, b] = path.split("/");
  if (a === "a" && b) return { name: "activity", id: b };
  if (a === "s" && b) return { name: "seek", id: b };
  if (a === "post") return { name: "post" };
  if (a === "mine") return { name: "mine" };
  if (a === "inbox") return { name: "inbox" };
  return { name: "discover" };
}
const pathOf = (r) =>
  r.name === "activity" ? `/a/${r.id}` : r.name === "seek" ? `/s/${r.id}` : r.name === "discover" ? "/" : `/${r.name}`;

const Ctx = createContext(null);

export function StoreProvider({
  me: initialMe,
  onLogout,
  children
}) {
  const [me, setMe] = useState(initialMe);
  const [route, setRoute] = useState(() => parsePath(location.pathname));
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [live, setLive] = useState(false);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState("");
  const timer = useRef(0);

  const flash = useCallback((msg) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(""), 3200);
  }, []);

  const go = useCallback((r, replace = false) => {
    setRoute(r);
    const p = pathOf(r);
    if (p !== location.pathname) (replace ? history.replaceState : history.pushState).call(history, null, "", p);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPop = () => setRoute(parsePath(location.pathname));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const loadInbox = useCallback(() => api.notifications().then((r) => (setNotifications(r.items), setUnread(r.unread)), () => undefined), []);

  // One socket per session: notifications to me, activity changes at my school.
  useEffect(() => {
    void loadInbox();
    const s = io({ auth: { token: getToken() }, transports: ["websocket", "polling"] });
    s.on("connect", () => {
      setLive(true);
      void loadInbox(); // catch up on anything missed while offline
    });
    s.on("disconnect", () => setLive(false));
    s.on("notification", (n) => {
      setNotifications((xs) => [n, ...xs.filter((x) => x.id !== n.id)].slice(0, 50));
      setUnread((u) => u + 1);
      setVersion((v) => v + 1);
      window.dispatchEvent(new CustomEvent("spotme:notification", { detail: n }));
    });
    s.on("activity", () => setVersion((v) => v + 1));
    return () => {
      s.disconnect();
    };
  }, [loadInbox]);

  const value = useMemo(() => ({
    me, setMe, route, go, notifications, unread, live, version, toast, flash,
    logout() {
      setToken(null);
      onLogout();
    },
    async markAllRead() {
      setUnread(0);
      setNotifications((xs) => xs.map((x) => ({ ...x, read: true })));
      await api.readAll().catch(() => undefined);
    },
  }), [me, route, go, notifications, unread, live, version, toast, flash, onLogout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}
