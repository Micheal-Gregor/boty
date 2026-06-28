// Card-trigger audit + EXPECTATIONS. Drives EVERY unique Fortune card through the engine's
// resolveCard against a fully-stocked player (crew, an active job, equipment, cash, a rival at the
// table) and checks it does what we expect. Run after any card change, and as testers report
// "card X should do Y", encode that here so it's enforced forever:
//
//   node tools/card-audit.mjs        → prints each card's effect; exits 1 if any check fails
//
// TWO layers of checking:
//   1. INVARIANTS (auto, data-derived) — rules that must hold for whole classes of cards.
//   2. EXPECT[id] (manual, the central spec) — required effects for a specific card. Edit freely.
//
// SCOPE: this is the ENGINE layer (does each card resolve correctly?). The ORDER decisions surface
// in the client (the "poach popped early" class) is a UI-flow concern, not covered here.

import { loadEconomy, loadDecks } from "../src/engine/content-fs.js";
import { Game } from "../src/engine/game.js";
import { resolveCard } from "../src/engine/fortune.js";
import { resetIds } from "../src/state/state.js";

const economy = await loadEconomy();
const decks = await loadDecks();
const S = economy.services;
const seats = [{ name: "Auditor", service: S[2] }, { name: "Rival", service: S[0] }];
const PQ = ["pendingPoach", "pendingMayor", "pendingReferral", "pendingCourt", "pendingSettle", "pendingDamages"];

// ── The central spec: required effect flags per card. A flag must appear in the measured effects. ──
// Flags: cash+ cash- work- job defect ap hand global bbb shuffle sideline equip- crew- review
//        decision:poach decision:mayor decision:referral decision:court decision:settle decision:damages
const EXPECT = {
  // Work setbacks — must cost WORK, never cash (the equipment-breakdown class).
  equipment_breakdown: ["work-"], bad_weather: ["work-"], heat_wave: ["work-"], ice_storm: ["work-"], storm_of_decade: ["work-"],
  // Money setbacks — a padded bill, a tax, a payroll cut.
  supplier_invoice: ["cash-"], depreciation: ["cash-"], profit_share: ["cash-"],
  // Decisions raised.
  poached: ["decision:poach"], reelection_drive: ["decision:mayor"],
  // Things created / changed.
  code_violation: ["defect"], osha_writeup: ["defect"], surprise_inspection: ["defect"],
  tool_theft: ["equip-"], networking_lunch: ["hand"], union_drive: ["global"],
  holiday: ["sideline"], sick_day: ["sideline"], winter_holidays: ["sideline"], injury: ["sideline", "cash-"],
  retirement: ["cash-"], // a worker leaves, a replacement is hired (net crew 0) for a fee
  reassessment: ["ap"], vendor_contract: ["ap"], supply_credit: ["ap"], lease_payment: ["ap"], courthouse_day: ["ap"],
  // Jobs onto the board.
  j1: ["job"], j2: ["job"], j3: ["job"], j4: ["job"], j5: ["job"], j6: ["job"],
  job_hettrick: ["job"], job_lundgren: ["job"], job_dot: ["job"], job_boon: ["job"],
  civic_townhall: ["job"], civic_firehouse: ["job"], opera_house: ["job"], county_hospital: ["job"], downtown_storm: ["job"],
  // Windfalls — cash in.
  insurance_payout: ["cash+"], referral_bonus: ["cash+"], old_client: ["cash+"], tax_refund: ["cash+"], trade_feature: ["cash+"],
  county_fair: ["cash+"], harvest_festival: ["cash+"], small_business_grant: ["cash+"], file_patent: ["cash+"], equipment_award: ["cash+"], birthday: ["cash+"],
  // Context-dependent (referral routes or pays a fee; incidents route by trade) — only the no-error
  // + type invariants apply. perf_review's roll is random, so no required flag.
};

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

const snap = (g, p) => ({
  cash: p.cash, work: p.jobs.reduce((a, j) => a + j.work_done, 0), jobs: p.jobs.length,
  defects: (p.defects || []).length, payables: (p.payables || []).length, hand: (p.hand || []).length,
  crew: p.tradesmen.length, equip: p.equipment.length, out: p.tradesmen.filter((t) => t.out_until != null).length,
  prodMod: p.tradesmen.reduce((a, t) => a + (t.prod_mod || 0), 0), globals: (g.state.globalEffects || []).length,
  bbb: !!p.bbbThisTurn, shuffle: (g.state.deckEvents || []).length, q: PQ.map((qn) => (g.state[qn] || []).length),
});

function flagsFrom(a, b) {
  const f = new Set();
  if (b.cash > a.cash) f.add("cash+"); if (b.cash < a.cash) f.add("cash-");
  if (b.work < a.work) f.add("work-");
  if (b.jobs > a.jobs) f.add("job");
  if (b.defects > a.defects) f.add("defect");
  if (b.payables > a.payables) f.add("ap");
  if (b.hand > a.hand) f.add("hand");
  if (b.globals > a.globals) f.add("global");
  if (b.bbb && !a.bbb) f.add("bbb");
  if (b.shuffle > a.shuffle) f.add("shuffle");
  if (b.out > a.out) f.add("sideline");
  if (b.equip < a.equip) f.add("equip-");
  if (b.crew < a.crew) f.add("crew-");
  if (b.prodMod !== a.prodMod) f.add("review");
  PQ.forEach((qn, i) => { if (b.q[i] > a.q[i]) f.add("decision:" + qn.replace("pending", "").toLowerCase()); });
  return f;
}

// Invariants: rules whole card-classes must obey.
function invariants(card, a, b) {
  const out = [];
  if (card.work != null && b.cash !== a.cash) out.push("has `work` but moved cash (work setbacks must not touch cash)");
  if (card.work != null && b.work > a.work) out.push("has `work` but work went UP");
  if (card.type === "windfall" && (b.cash < a.cash || b.work < a.work)) out.push("windfall caused a LOSS");
  if (card.type === "shock" && (b.cash > a.cash || b.work > a.work)) out.push("shock produced a GAIN");
  return out;
}

const seen = new Set();
const cards = (decks.fortune ?? []).filter((c) => c.id && !seen.has(c.id) && seen.add(c.id));

const rows = [];
for (const card of cards) {
  const { g, p } = stocked();
  const a = snap(g, p);
  let res, err = null;
  try { res = resolveCard(g.state, p, card); } catch (e) { err = e?.message ?? String(e); }
  const b = snap(g, p);
  const f = err ? new Set() : flagsFrom(a, b);
  const fails = [];
  if (err) fails.push(`THREW: ${err}`);
  else {
    for (const need of EXPECT[card.id] ?? []) if (!f.has(need)) fails.push(`missing expected "${need}"`);
    for (const inv of invariants(card, a, b)) fails.push(inv);
  }
  rows.push({ id: card.id, type: card.type ?? "?", flags: [...f], fails, text: res?.text ?? "" });
}

console.log(`\n=== Card audit — ${rows.length} unique Fortune cards ===\n`);
for (const r of rows) {
  const mark = r.fails.length ? "✗" : "✓";
  console.log(`${mark} ${r.type.padEnd(10)} ${r.id.padEnd(24)} ${r.flags.join(" · ").padEnd(34)}`);
  if (r.text) console.log(`           ↳ ${r.text}`);
  for (const fail of r.fails) console.log(`           ⚠ ${fail}`);
}

const failed = rows.filter((r) => r.fails.length);
console.log(`\n${rows.length - failed.length}/${rows.length} cards pass.${failed.length ? ` FAILURES: ${failed.map((r) => r.id).join(", ")}` : " ✅ all good."}`);
if (failed.length) process.exitCode = 1;
