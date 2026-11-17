import { useEffect, useRef, useState } from "react";
import { emojiFor } from "./ui";

let loading = null;

/** Loads the Maps JavaScript API once (async loading with a callback, then importLibrary per library). */
function loadMaps(key, lang) {
  if ((window).google?.maps?.importLibrary) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    window.__spotmeMapsReady = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=__spotmeMapsReady&v=weekly&language=${lang}`;
    s.async = true;
    s.onerror = () => {
      loading = null;
      reject(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

function pinElement(cls, emoji) {
  const el = document.createElement("div");
  el.className = `pin ${cls}`;
  const span = document.createElement("span");
  span.textContent = emoji;
  el.appendChild(span);
  return el;
}

/**
 * Google Maps with Advanced Markers: one pin per activity (category color and
 * emoji), a blue dot for the viewer, and tap-to-pick when choosing a place.
 * Pins are redrawn whenever the activity list changes, which the socket
 * triggers, so the map stays live.
 */
export function GoogleMap({
  apiKey,
  mapId,
  lang,
  onFail,
  items = [],
  me,
  pick,
  onPick,
  onOpen,
  height = 360
}) {
  const el = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.gm_authFailure = () => !cancelled && onFail();
    loadMaps(apiKey, lang)
      .then(async () => {
        const [{ Map }] = await Promise.all([
          google.maps.importLibrary("maps"),
          google.maps.importLibrary("marker"),
        ]);
        if (cancelled || !el.current) return;
        map.current = new Map(el.current, {
          center: { lat: 39.9522, lng: -75.1932 }, zoom: 15, mapId,
          disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: "greedy",
        });
        setReady(true);
      })
      .catch(() => !cancelled && onFail());
    return () => {
      cancelled = true;
    };
  }, [apiKey, mapId, lang, onFail]);

  useEffect(() => {
    if (!ready || !map.current || !onPick) return;
    const l = map.current.addListener("click", (e) => e.latLng && onPick(e.latLng.toJSON()));
    return () => l.remove();
  }, [ready, onPick]);

  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    for (const mk of markers.current) mk.map = null;
    markers.current = [];
    const bounds = new google.maps.LatLngBounds();
    let n = 0;
    const add = (position, content, title, onClick) => {
      const mk = new google.maps.marker.AdvancedMarkerElement({ map: m, position, content, title, gmpClickable: !!onClick });
      if (onClick) mk.addListener("gmp-click", onClick);
      markers.current.push(mk);
      bounds.extend(position);
      n++;
    };
    for (const a of items) if (a.area.point) add(a.area.point, pinElement(`c-${a.category}`, emojiFor(a.category, a.sport)), a.title, onOpen ? () => onOpen(a.id) : undefined);
    if (me) {
      const dot = document.createElement("div");
      dot.className = "me-dot";
      add(me, dot, "You");
    }
    if (pick) add(pick, pinElement("pick", "📍"), "");
    if (n > 1) m.fitBounds(bounds, 48);
    else if (n === 1) (m.setCenter(bounds.getCenter()), m.setZoom(16));
  }, [ready, items, me, pick, onOpen]);

  return <div ref={el} className="map" style={{ height }} />;
}
