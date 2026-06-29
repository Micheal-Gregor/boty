// Complete review: run full 6-trade bot games and collect EVERY job-art key that appears across all
// players' jobs (routed subs, incident tenders, civic jobs, subcontracts, tailored ladder/NPC jobs),
// then confirm each resolves to an art file — i.e. its graphic loads in the Table Log.
import fs from "node:fs"; import path from "node:path";
import { Game } from "../src/engine/game.js";
import { resetIds } from "../src/state/state.js";
import { botActions } from "./bot.js";
import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";

const ART = path.resolve(process.cwd(), "../../apps/web/src/assets/art");
const exist = new Set();
(function walk(dir, base){ for (const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); const rel=(base?base+"/":"")+e.name; if (e.isDirectory()) walk(p,rel); else { const m=rel.match(/^(.+)\.[^.]+$/); if (m && !rel.endsWith(".gitkeep")) exist.add(m[1].split(path.sep).join("/")); } } })(ART,"");

const economy = await loadEconomy(); const decks = await loadDecks();
const seen = new Map();
for (let seed=1; seed<=40; seed++) {
  resetIds();
  const g = new Game(economy, [{name:"A",service:"mechanic"},{name:"B",service:"plumber"},{name:"C",service:"electrician"},{name:"D",service:"pipefitter"},{name:"E",service:"welder"},{name:"F",service:"HVAC technician"}], {...decks, seed});
  g.start();
  for (let i=0;i<160 && !g.state.over;i++){
    try { botActions(g,"balanced"); } catch {}
    g.autoResolveCourt?.(); g.autoResolveSettle?.(); g.autoResolvePoach?.(); g.autoResolveMayor?.(); g.autoResolveReferral?.(); g.autoResolveDamages?.();
    for (const p of g.state.players) for (const j of p.jobs) { const key = "card/" + (j.art ?? j.card); if (!seen.has(key)) seen.set(key, j.name); }
    try { g.endTurn(); } catch {}
  }
}
const missing = [...seen].filter(([k]) => !exist.has(k)).sort();
console.log(`distinct LIVE job-art keys seen: ${seen.size} | MISSING art: ${missing.length}`);
for (const [k,name] of missing) console.log(`  ${k}   (e.g. "${name}")`);
