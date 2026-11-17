// Regenerates data/universities.json from Hipo/university-domains-list (MIT).
import { writeFileSync } from "node:fs";

const src = "https://raw.githubusercontent.com/Hipo/university-domains-list/master/world_universities_and_domains.json";
const list = (await (await fetch(src)).json()) as { name: string; alpha_two_code?: string; domains?: string[] }[];
const seen = new Set<string>();
const out: [string, string, string[]][] = [];
for (const u of list) {
  const domains = (u.domains ?? []).map((d) => d.toLowerCase().trim()).filter(Boolean);
  const key = `${u.name}|${domains.join(",")}`;
  if (!domains.length || seen.has(key)) continue;
  seen.add(key);
  out.push([u.name.trim(), u.alpha_two_code ?? "", domains]);
}
writeFileSync(new URL("../data/universities.json", import.meta.url), JSON.stringify(out));
console.log(`${out.length} universities`);
