

import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../src/locales/", import.meta.url);
const flat = (o, p = "", out = {}) => {
  for (const [k, v] of Object.entries(o)) {
    if (k === "_meta") continue;
    typeof v === "object" ? flat(v, `${p}${k}.`, out) : (out[`${p}${k}`] = v);
  }
  return out;
};
const ph = (s) => [...new Set(s.match(/\{\w+\}/g) ?? [])].sort().join(",");
const plural = /_(zero|one|two|few|many|other)$/;

const en = flat(JSON.parse(readFileSync(new URL("en.json", dir))));
let failed = false;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "en.json")) {
  const raw = JSON.parse(readFileSync(new URL(file, dir)));
  const t = flat(raw);
  const problems = [];
  if (!raw._meta?.name) problems.push("missing _meta.name");
  for (const [k, v] of Object.entries(en)) {
    const other = k.replace(plural, "_other");
    if (k in t) {
      if (ph(t[k]) !== ph(v)) problems.push(`placeholders differ in ${k}: ${ph(t[k])} vs ${ph(v)}`);
    } else if (!(plural.test(k) && other in t)) problems.push(`missing ${k}`);
  }
  for (const k of Object.keys(t)) if (!(k in en) && !(k.replace(plural, "_other") in en)) problems.push(`unknown key ${k}`);
  console.log(`${problems.length ? "✗" : "✓"} ${file} (${Object.keys(t).length} keys)`);
  problems.slice(0, 20).forEach((p) => console.log(`    ${p}`));
  failed ||= problems.length > 0;
}
process.exit(failed ? 1 : 0);
