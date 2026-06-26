import fs from "node:fs";
import path from "node:path";
import { loadDecks, loadEconomy } from "../src/engine/content-fs.js";

// Run from packages/engine (npm scripts' cwd). Adjust if the web app moves.
const ART = path.resolve(process.cwd(), "../../apps/web/src/assets/art");
const exist = new Set();
function walk(dir, base) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = (base ? base + "/" : "") + e.name;
    if (e.isDirectory()) walk(p, rel);
    else {
      const mm = rel.match(/^(.+)\.[^.]+$/);
      if (mm && !rel.endsWith(".gitkeep")) exist.add(mm[1].split(path.sep).join("/"));
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
for (const c of d.civil || []) if (c.hand) want.add("card/" + c.id);
want.add("card/civic/hospital_overrun");
want.add("card/civic/opera_scandal");

const missing = [...want].filter((k) => !exist.has(k)).sort();
console.log(`expected card-art keys: ${want.size} | existing art files: ${exist.size} | MISSING: ${missing.length}\n`);
console.log("=== MISSING card/pop-up art ===");
for (const k of missing) console.log("  " + k);
