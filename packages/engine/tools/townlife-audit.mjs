import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "../../apps/web/src/lib/townlife.js");
const ART = path.resolve(process.cwd(), "../../apps/web/src/assets/art/townlife");

// Parse townlife.js: walk lines, track current season, collect each id under it.
const want = { spring: [], summer: [], fall: [], winter: [] };
let cur = null;
for (const line of fs.readFileSync(SRC, "utf8").split("\n")) {
  const sm = line.match(/^\s*(spring|summer|fall|winter):\s*\[/);
  if (sm) { cur = sm[1]; continue; }
  if (/^\s*\],?\s*$/.test(line)) { cur = null; continue; } // end of a season's array — stop collecting
  const im = line.match(/id:\s*"([^"]+)"/);
  if (im && cur) want[cur].push(im[1]);
}

const existing = (season) => {
  const dir = path.join(ART, season);
  if (!fs.existsSync(dir)) return new Set();
  return new Set(fs.readdirSync(dir).filter((f) => !f.endsWith(".gitkeep")).map((f) => f.replace(/\.[^.]+$/, "")));
};

let missing = 0, extra = 0;
for (const season of ["spring", "summer", "fall", "winter"]) {
  const have = existing(season);
  const need = want[season];
  const gaps = need.filter((id) => !have.has(id));
  const extras = [...have].filter((id) => !need.includes(id));
  console.log(`\n${season.toUpperCase()} — need ${need.length}, have ${have.size}`);
  if (gaps.length) { missing += gaps.length; console.log("  MISSING: " + gaps.map((g) => `townlife/${season}/${g}`).join(", ")); }
  if (extras.length) { extra += extras.length; console.log("  extra files (no card uses these): " + extras.join(", ")); }
  if (!gaps.length && !extras.length) console.log("  ✓ complete");
}
console.log(`\n=== ${missing} missing, ${extra} extra ===`);
