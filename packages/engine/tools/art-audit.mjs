import fs from "node:fs";
import path from "node:path";
import { loadDecks, loadEconomy } from "../src/engine/content-fs.js";

// Run from packages/engine (npm scripts' cwd). Adjust if the web app moves.
const ART = path.resolve(process.cwd(), "../../apps/web/src/assets/art");
const exist = new Set();
const stills = new Set();
const vids = new Set();
function walk(dir, base) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = (base ? base + "/" : "") + e.name;
    if (e.isDirectory()) walk(p, rel);
    else {
      const mm = rel.match(/^(.+)\.([^.]+)$/);
      if (mm && !rel.endsWith(".gitkeep")) {
        const key = mm[1].split(path.sep).join("/");
        exist.add(key);
        (["mp4", "webm"].includes(mm[2].toLowerCase()) ? vids : stills).add(key);
      }
    }
  }
}
walk(ART, "");

const slug = (t) => ({ "HVAC technician": "hvac" }[t] || t);
const d = await loadDecks();
const eco = await loadEconomy();
const trades = eco.services;
const want = new Set();
const seen = new Set();
for (const c of d.fortune) {
  if (seen.has(c.id)) continue;
  seen.add(c.id);
  if (c.type === "civic") {
    if (c.id === "downtown_storm") for (const s of ["spring", "summer", "fall", "winter"]) want.add(`card/civic/storm/${s}`);
    else want.add(`card/civic/${c.id}`);
  } else if (c.type === "job" && c.size) {
    if (["j1", "j2", "j3"].includes(c.size)) want.add("card/job/walkin/" + { j1: "1p", j2: "2p", j3: "2p_basic" }[c.size]);
    else for (const t of trades) want.add(`card/job/${c.size}/${slug(t)}`);
  } else if (c.type === "job" && c.npc) {
    for (const t of trades) want.add(`card/job/${c.npc}/${slug(t)}`);
  } else if (c.type === "referral") {
    want.add("card/job/walkin/2p");
  } else {
    want.add("card/" + c.id);
  }
}
for (const c of d.civil || []) want.add("card/" + c.id); // hand cards AND docket events (lawsuit/audit/… now reveal as their own card)
want.add("card/civic/hospital_overrun");
want.add("card/civic/opera_scandal");

const missing = [...want].filter((k) => !exist.has(k)).sort();
console.log(`expected card-art keys: ${want.size} | existing art files: ${exist.size} | MISSING: ${missing.length}\n`);
console.log("=== MISSING card/pop-up art ===");
for (const k of missing) console.log("  " + k);

// Animations with no companion still: they paint their first frame as a poster, but a dedicated still
// reads crisper (and is safer across browsers). Worth filling in.
const videoOnly = [...vids].filter((k) => !stills.has(k)).sort();
if (videoOnly.length) {
  console.log(`\n=== VIDEO-ONLY (no still — add a .png/.jpg poster) : ${videoOnly.length} ===`);
  for (const k of videoOnly) console.log("  " + k);
}
