import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { api, getToken, setToken, type Me, type Notification } from "./api";

export type Route =
  | { name: "discover" }
  | { name: "post"; kind?: "activity" | "seek"; prefill?: Record<string, unknown> }
  | { name: "mine" }
  | { name: "inbox" }
  | { name: "activity"; id: string }
  | { name: "seek"; id: string };

export function parsePath(path: string): Route {
  const [, a, b] = path.split("/");
  if (a === "a" && b) return { name: "activity", id: b };
  if (a === "s" && b) return { name: "seek", id: b };
  if (a === "post") return { name: "post" };
  if (a === "mine") return { name: "mine" };
  if (a === "inbox") return { name: "inbox" };
  return { name: "discover" };
}
const pathOf = (r: Route) =>
  r.name === "activity" ? `/a/${r.id}` : r.name === "seek" ? `/s/${r.id}` : r.name === "discover" ? "/" : `/${r.name}`;

interface Store {
  me: Me;
  setMe(m: Me): void;
  logout(): void;
  route: Route;
  go(r: Route, replace?: boolean): void;
  notifications: Notification[];
  unread: number;
  live: boolean;
  markAllRead(): Promise<void>;
  /** Bumped when the server says an activity changed; views refetch on it. */
  version: number;
  toast: string;
  flash(msg: string): void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ me: initialMe, onLogout, children }: { me: Me; onLogout(): void; children: ReactNode }) {
  const [me, setMe] = useState(initialMe);
  const [route, setRoute] = useState<Route>(() => parsePath(location.pathname));
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [live, setLive] = useState(false);
  const [version, setVersion] = useState(0);
  const [toast, setToast] = useState("");
  const timer = useRef<number>(0);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(""), 3200);
  }, []);

  const go = useCallback((r: Route, replace = false) => {
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
    const s: Socket = io({ auth: { token: getToken() }, transports: ["websocket", "polling"] });
    s.on("connect", () => {
      setLive(true);
      void loadInbox(); // catch up on anything missed while offline
    });
    s.on("disconnect", () => setLive(false));
    s.on("notification", (n: Notification) => {
      setNotifications((xs) => [n, ...xs.filter((x) => x.id !== n.id)].slice(0, 50));
      setUnread((u) => u + 1);
      setVersion((v) => v + 1);
      window.dispatchEvent(new CustomEvent("cc:notification", { detail: n }));
    });
    s.on("activity", () => setVersion((v) => v + 1));
    return () => {
      s.disconnect();
    };
  }, [loadInbox]);

  const value = useMemo<Store>(() => ({
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
