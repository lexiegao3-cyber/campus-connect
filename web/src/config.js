import { api } from "./api";

let cached = null;

/** Server-provided public settings, fetched once per page load. */
export function appConfig() {
  cached ??= api.config().catch(() => ({ googleClientId: null, devLogin: true, googleMapsKey: null, googleMapsMapId: null }));
  return cached;
}
