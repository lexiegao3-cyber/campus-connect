import { readFileSync } from "node:fs";

/** One university, keyed by its primary email domain. */
export interface School {
  domain: string;
  name: string;
  country: string;
}

type Row = [name: string, country: string, domains: string[]];

const rows = JSON.parse(readFileSync(new URL("../data/universities.json", import.meta.url), "utf8")) as Row[];
const byDomain = new Map<string, School>();
for (const [name, country, domains] of rows) {
  const school = { domain: domains[0]!, name, country };
  for (const d of domains) if (!byDomain.has(d)) byDomain.set(d, school);
}

/**
 * Finds the school for an email address, walking up subdomains so that
 * jane@seas.upenn.edu and jane@alumni.upenn.edu both resolve to upenn.edu.
 * Returns null for addresses that are not on a known university domain.
 */
export function schoolForEmail(email: string): School | null {
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  const labels = email.slice(at + 1).toLowerCase().trim().split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    const hit = byDomain.get(labels.slice(i).join("."));
    if (hit) return hit;
  }
  return null;
}

export const schoolCount = () => new Set([...byDomain.values()].map((s) => s.domain)).size;
