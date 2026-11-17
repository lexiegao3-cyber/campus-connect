import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { Activity, Point } from "./api";
import { emojiFor } from "./ui";

/**
 * Leaflet over OpenStreetMap tiles. Shows activities as emoji pins and, when
 * `onPick` is given, lets the user tap to choose a point.
 */
export function MapView({ items = [], me, pick, onPick, onOpen, height = 360 }: {
  items?: Activity[]; me?: Point | null; pick?: Point | null; onPick?(p: Point): void; onOpen?(id: string): void; height?: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, attributionControl: true }).setView([39.9522, -75.1932], 15);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !onPick) return;
    const h = (e: L.LeafletMouseEvent) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    m.on("click", h);
    return () => {
      m.off("click", h);
    };
  }, [onPick]);

  useEffect(() => {
    const m = map.current, g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const a of items) {
      if (!a.area.point) continue;
      const ll: L.LatLngExpression = [a.area.point.lat, a.area.point.lng];
      pts.push(ll);
      const icon = L.divIcon({ className: "", html: `<div class="pin c-${a.category}"><span>${emojiFor(a.category, a.sport)}</span></div>`, iconSize: [36, 36], iconAnchor: [18, 36] });
      const mk = L.marker(ll, { icon, title: a.title }).addTo(g);
      if (onOpen) mk.on("click", () => onOpen(a.id));
    }
    if (me) {
      L.circleMarker([me.lat, me.lng], { radius: 7, color: "#fff", weight: 3, fillColor: "#1d4ed8", fillOpacity: 1 }).addTo(g);
      pts.push([me.lat, me.lng]);
    }
    if (pick) {
      L.marker([pick.lat, pick.lng], { icon: L.divIcon({ className: "", html: '<div class="pin pick"><span>📍</span></div>', iconSize: [36, 36], iconAnchor: [18, 36] }) }).addTo(g);
      pts.push([pick.lat, pick.lng]);
    }
    if (pts.length > 1) m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 16 });
    else if (pts.length === 1) m.setView(pts[0]!, 16);
  }, [items, me, pick, onOpen]);

  return <div ref={el} className="map" style={{ height }} />;
}
