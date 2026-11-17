import { useEffect, useState } from "react";
import { api, CATEGORIES, type Activity, type Category, type Point } from "../api";
import { useI18n } from "../i18n";
import { MapView } from "../MapView";
import { useStore } from "../store";
import { ActivityCard, Chips, Empty, Icon } from "../ui";

export function Discover() {
  const s = useStore();
  const { t } = useI18n();
  const [cat, setCat] = useState<Category | "all">("all");
  const [view, setView] = useState<"list" | "map">("list");
  const [me, setMe] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Activity[] | null>(null);

  useEffect(() => {
    api.activities({ category: cat === "all" ? undefined : cat, lat: me?.lat, lng: me?.lng, radiusKm: 25 })
      .then((r) => setItems(r.items), () => setItems([]));
  }, [cat, me, s.version]);

  function locate() {
    if (!navigator.geolocation) return setNote(t("discover.noLocation"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => (setMe({ lat: p.coords.latitude, lng: p.coords.longitude }), setLocating(false), setNote("")),
      () => (setLocating(false), setNote(t("discover.noLocation"))),
      { timeout: 8000, maximumAge: 300_000 },
    );
  }

  const open = (id: string) => s.go({ name: "activity", id });
  return (
    <>
      <section className="hero">
        <h1>{t("discover.title", { school: s.me.school.name })}</h1>
        <p className="muted">{items ? t("discover.sub", { n: items.length }) : t("common.loading")}</p>
      </section>
      <div className="toolbar">
        <Chips options={["all", ...CATEGORIES] as const} value={cat} onChange={(v) => setCat(v as Category | "all")}
          label={(o) => (o === "all" ? t("discover.all") : t(`cat.${o}` as "cat.sports"))} />
        <div className="row gap-s">
          <button className={`btn ghost small ${me ? "active" : ""}`} onClick={locate} disabled={locating}>
            <Icon name="locate" size={16} /> {locating ? t("discover.locating") : t("discover.near")}
          </button>
          <div className="seg" role="tablist">
            <button className={view === "list" ? "on" : ""} onClick={() => setView("list")} aria-label={t("discover.list")}><Icon name="list" size={16} /></button>
            <button className={view === "map" ? "on" : ""} onClick={() => setView("map")} aria-label={t("discover.map")}><Icon name="map" size={16} /></button>
          </div>
        </div>
      </div>
      {note && <p className="small muted">{note}</p>}
      <div className={`discover ${view}`}>
        <div className="feed">
          {items?.length === 0 && <Empty>{t("discover.empty")}</Empty>}
          {items?.map((a) => <ActivityCard key={a.id} a={a} onOpen={() => open(a.id)} compact />)}
        </div>
        <div className="side-map">
          <MapView items={items ?? []} me={me} onOpen={open} height={view === "map" ? 520 : 640} />
        </div>
      </div>
    </>
  );
}
