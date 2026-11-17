import { useCallback, useEffect, useState } from "react";
import { appConfig } from "./config";
import { GoogleMap } from "./GoogleMap";
import { useI18n } from "./i18n";
import { LeafletMap } from "./LeafletMap";

/**
 * Google Maps when the server provides a Maps API key; OpenStreetMap through
 * Leaflet otherwise, or if Google Maps fails to load (bad key, blocked script).
 */
export function MapView(props) {
  const { lang } = useI18n();
  const [maps, setMaps] = useState(undefined);
  useEffect(() => {
    appConfig().then((c) => setMaps(c.googleMapsKey ? { key: c.googleMapsKey, mapId: c.googleMapsMapId ?? "DEMO_MAP_ID" } : null));
  }, []);
  const onFail = useCallback(() => setMaps(null), []);
  if (maps === undefined) return <div className="map" style={{ height: props.height ?? 360 }} />;
  if (maps) return (
    <GoogleMap
      {...props}
      apiKey={maps.key}
      mapId={maps.mapId}
      lang={lang === "zh" ? "zh-CN" : "en"}
      onFail={onFail} />
  );
  return <LeafletMap {...props} />;
}
