import { api } from "./api";

export interface AppConfig {
  googleClientId: string | null;
  devLogin: boolean;
  googleMapsKey: string | null;
  googleMapsMapId: string | null;
}

let cached: Promise<AppConfig> | null = null;

/** Server-provided public settings, fetched once per page load. */
export function appConfig(): Promise<AppConfig> {
  cached ??= api.config().catch(() => ({ googleClientId: null, devLogin: true, googleMapsKey: null, googleMapsMapId: null }));
  return cached;
}
