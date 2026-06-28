// Card-trigger audit. Drives EVERY unique Fortune card through the engine's resolveCard against a
// fully-stocked player (crew, an active job, equipment, cash, a rival at the table) and reports what
// each one does: cash/work delta, which pending DECISION it queues (poach/mayor/referral/court/
// settle/damages), whether it reshuffles the deck, the feed text — and flags any that throw.
//
// This is the repeatable answer to "do all cards trigger correctly?" — run it after any card change.
//   node tools/card-audit.mjs
//
// NOTE: it checks each card RESOLVES correctly in isolation (the engine layer). The ORDER decisions
// surface in the UI (the "poach popped out of order" class) is a client-flow concern, not this.

import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resolveCard } from "../src/engine/fortune.js";
import { resetIds } from "../src/state/state.js";

const economy = await loadEconomy();
const decks = await loadDecks();
const S = economy.services;
const seats = [{ name: "Auditor", service: S[2] }, { name: "Rival", service: S[0] }]; // Rival has a different trade (referral targets)

const PQ = ["pendingPoach", "pendingMayor", "pendingReferral", "pendingCourt", "pendingSettle", "pendingDamages"];

// A player set up so every card type has something to act on.
function stocked() {
  resetIds();
  const g = new Game(economy, seats, { ...decks, seed: 7, difficulty: "standard", rotateFirst: false });
  g.start();
  const p = g.state.players[0];
  p.cash = 200;
  for (let i = 0; i < 3; i++) p.tradesmen.push({ id: `TA${i}`, prod_mod: 0, flag: null, assignedJob: null, out_until: null, tool: null });
  p.jobs.push({ id: "JA1", name: "Active test job", state: "Active", work_done: 5, work_amount: 12, value: 12, deadline_turn: 20, assigned_tradesmen: [], max_tradesmen: 3, min_tradesmen: 1, droppable: true });
  p.equipment.push({ id: "EA1", defId: "basic", owned: true, assigned_to: null });
  return { g, p };
}

const seen = new Set();
const cards = (decks.fortune ?? []).filter((c) => c.id && !seen.has(c.id) && seen.add(c.id));

const sidelined = (pl) => pl.tradesmen.filter((t) => t.out_until != null).length;
const snap = (g, p) => ({
  cash: p.cash, work: p.jobs.reduce((a, j) => a + j.work_done, 0), jobs: p.jobs.length,
  defects: (p.defects || []).length, payables: (p.payables || []).length, hand: (p.hand || []).length,
  crew: p.tradesmen.length, equip: p.equipment.length, out: sidelined(p), prodMod: p.tradesmen.reduce((a, t) => a + (t.prod_mod || 0), 0),
  globals: (g.state.globalEffects || []).length, bbb: !!p.bbbThisTurn, shuffle: (g.state.deckEvents || []).length,
  q: PQ.map((qn) => (g.state[qn] || []).length),
});

const rows = [];
for (const card of cards) {
  const { g, p } = stocked();
  const a = snap(g, p);
  let res, err = null;
  try { res = resolveCard(g.state, p, card); } catch (e) { err = e?.message ?? String(e); }
  const b = snap(g, p);
  const decisions = PQ.map((qn, i) => (b.q[i] > a.q[i] ? qn.replace("pending", "").toLowerCase() : null)).filter(Boolean);
  const fx = [];
  if (b.cash !== a.cash) fx.push(`cash ${b.cash - a.cash > 0 ? "+" : ""}${b.cash - a.cash}`);
  if (b.work !== a.work) fx.push(`work ${b.work - a.work > 0 ? "+" : ""}${b.work - a.work}`);
  if (b.jobs !== a.jobs) fx.push(`${b.jobs - a.jobs > 0 ? "+" : ""}${b.jobs - a.jobs} job`);
  if (b.defects > a.defects) fx.push(`+defect`);
  if (b.payables > a.payables) fx.push(`+AP`);
  if (b.hand > a.hand) fx.push(`+hand-card`);
  if (b.out > a.out) fx.push(`worker sidelined`);
  if (b.crew !== a.crew) fx.push(`crew ${b.crew - a.crew > 0 ? "+" : ""}${b.crew - a.crew}`);
  if (b.equip < a.equip) fx.push(`equipment lost`);
  if (b.prodMod !== a.prodMod) fx.push(`review ${b.prodMod - a.prodMod > 0 ? "+" : ""}${b.prodMod - a.prodMod}`);
  if (b.globals > a.globals) fx.push(`+global`);
  if (b.bbb && !a.bbb) fx.push(`BBB fair`);
  if (b.shuffle > a.shuffle) fx.push(`deck-shuffle`);
  if (decisions.length) fx.push(`decision→[${decisions.join(",")}]`);
  rows.push({ id: card.id, type: card.type ?? "?", err, fx, text: res?.text ?? "" });
}

console.log(`\n=== Card audit — ${rows.length} unique Fortune cards ===\n`);
for (const r of rows) {
  const flag = r.err ? `  ❌ ${r.err}` : "";
  console.log(`${r.type.padEnd(10)} ${r.id.padEnd(24)} ${r.fx.join(" · ").padEnd(38)}${flag}`);
  if (r.text) console.log(`           ↳ ${r.text}`);
}

const errs = rows.filter((r) => r.err);
const noEffect = rows.filter((r) => !r.err && !r.fx.length);
console.log(`\n${errs.length} threw an error; ${noEffect.length} produced no measurable effect${noEffect.length ? " (" + noEffect.map((r) => r.id).join(", ") + ")" : ""}.`);
if (errs.length) process.exitCode = 1;
