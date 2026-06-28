// The game controller — a thin seam between the Svelte UI and the engine. For M2 it runs the
// engine locally in the browser (LocalTransport); later a RemoteTransport will send the same
// intents to Supabase, and the UI won't change. AI seats are driven by the engine's own bots.

import { writable, get } from "svelte/store";
import { Game, profitAndLoss, balanceSheet, recurringExpenses, seasonFor, workerProductivity, findEquipment, classifyTermination, unionActive, recordable, replay, resetIds } from "@boty/engine";
import { settings } from "./settings.js";
import { botActions } from "@boty/engine/bots";
import { loadContent } from "./content.js";
import { unlockAudio, playSfx, playSting, playMusic } from "./sound.js";
import { dealTownlife, townlifeForRound } from "./townlife.js";
import { setMoneyRate } from "./money.js";
import { npcIntroFor } from "./townsfolk.js";
import { crewIdentity } from "./crew.js";
import { session as authSession, user as authUser } from "./auth.js";
import { supabaseReady } from "./supabase.js";
import { onlineGame, onlineSeats, writeGameState, replaceSeats } from "./games.js";

const { economy, decks, flavor } = loadContent();
setMoneyRate(economy.w_to_usd); // wire the W→$ display rate from the economy data
const AI_DELAY = 650; // ms between AI seats, so you can watch the table move
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** UI state. `view` is a fresh plain-data snapshot of the engine state on every change — the
 * engine mutates its objects in place, so the UI must read a new-reference snapshot or Svelte
 * won't see the change. `rev` bumps on every change. */
export const ui = writable({
  screen: "loading", game: null, view: null, ctx: null, flavor, economy, error: null, rev: 0,
  aiActing: null, threat: null, picking: null, reckoning: null, final: null, court: null, damages: null, settle: null,
  cardView: null, popups: [], settingsOpen: false, flash: null, entityCard: null, handView: false, rivalView: false,
  rulesOpen: false, confirm: null,
});

export function openRules() { push({ rulesOpen: true }); }
export function closeRules() { push({ rulesOpen: false }); }

// A generic Yes/No confirmation (e.g. before a shop move). The callback is held out of the store.
let confirmCb = null, confirmAltCb = null;
export function openConfirm(opts, cb, altCb = null) { confirmCb = cb; confirmAltCb = altCb; push({ confirm: { title: opts.title, body: opts.body, yes: opts.yes ?? "Yes", alt: opts.alt ?? null, npc: opts.npc ?? null } }); }
export function confirmYes() { const cb = confirmCb; confirmCb = confirmAltCb = null; push({ confirm: null }); if (cb) cb(); }
export function confirmAlt() { const cb = confirmAltCb; confirmCb = confirmAltCb = null; push({ confirm: null }); if (cb) cb(); }
export function confirmNo() { confirmCb = confirmAltCb = null; push({ confirm: null }); }

// Guarded actions — a Yes/No before something you can't easily undo (used from the shop & the cards).
export function confirmSell(jobId, price) {
  openConfirm({ title: "Sell this job?", body: `Hand it to the bank for ${price} W now instead of doing the work — you give up the full contract value.`, yes: "Sell it" }, () => act((g) => g.sellJob(jobId)));
}
// Classify a firing live, so the human sees exactly what risk they're taking on (E5 + employment).
const meLive = () => game.state.players[game.state.activePlayerIndex];
export function terminationInfo(workerId) {
  const p = meLive();
  const t = p.tradesmen.find((x) => x.id === workerId);
  if (!t) return null;
  const c = classifyTermination(game.state, p, t);
  return { kind: c.kind, reason: c.reason, threshold: c.threshold, term: economy.termination, union: unionActive(game.state), hasLawyer: handHas(p, "slick_lawyer") };
}
export function confirmFire(workerId) {
  const info = terminationInfo(workerId);
  if (!info) return;
  const term = info.term;
  const fireAct = (ownLawyer) => (info.kind === "legit" ? act((g) => g.fire(workerId, { ownLawyer })) : openFiringDice(workerId, ownLawyer, info));
  if (info.kind === "legit") {
    openConfirm({ title: `Lay ${workerId} off?`, body: `No work on the books and they're healthy — a clean layoff. No severance, no wrongful-termination claim.`, yes: "Lay off" }, () => fireAct(false));
    return;
  }
  const odds = (lawyer) => Math.max(0, Math.min(6, info.threshold + (info.union ? term.union_shift : 0) - (lawyer ? term.lawyer_shift : 0)));
  const thr = odds(false);
  const tag = { "with cause": "WITH CAUSE", "no cause": "NO CAUSE — you still have work for them", "punitive": "PUNITIVE — they're out sick/injured" }[info.kind];
  let body = `${tag}${info.reason ? ` (${info.reason})` : ""}. You roll a d6: ${thr}-or-under and they sue (you pay the ${term.court_fee} W court fee); a second roll ${thr}-or-under and they WIN — you also pay ${term.award} W.`;
  if (info.union) body += ` ⚑ The trades are unionised (+2 to their odds) — a Favor busts it.`;
  const opts = { title: `Fire ${workerId}?`, body, yes: "Fire" };
  if (info.hasLawyer) opts.alt = { label: `Fire + Slick Lawyer (${odds(true)}-or-under)` };
  openConfirm(opts, () => fireAct(false), info.hasLawyer ? () => fireAct(true) : null);
}

// --- The dice roller (E5 §"no NPC rolls"): the human physically rolls; we feed those rolls to the
// engine so the roll YOU make is the outcome. A spec is a sequence of steps; each step's resolve()
// turns a d6 into a result and says whether the sequence stops. onDone(rolls) applies it for real.
let diceState = null;
function publishDice() {
  if (!diceState) { push({ dice: null }); return; }
  const { spec, stepIdx, value, result } = diceState;
  const step = spec.steps[stepIdx];
  const finished = !!result && (result.stop || stepIdx === spec.steps.length - 1);
  push({ dice: { title: spec.title, sub: spec.sub, prompt: step.prompt, stepIdx, steps: spec.steps.length, value, result: result?.text ?? null, tone: result?.tone ?? null, finished, noCancel: !!spec.noCancel } });
}
export function openDice(spec) { diceState = { spec, rolls: [], stepIdx: 0, value: null, result: null }; playSfx("flip", 0.3); publishDice(); }
export function rollDie() {
  if (!diceState || diceState.value != null) return;
  const v = 1 + Math.floor(Math.random() * 6);
  diceState.value = v; diceState.rolls.push(v);
  diceState.result = diceState.spec.steps[diceState.stepIdx].resolve(v, diceState.rolls);
  publishDice(); // the die <button> press already clicks via the app-wide listener
}
export function diceNext() {
  if (!diceState || diceState.value == null) return;
  const { spec, stepIdx, result, rolls } = diceState;
  if (result.stop || stepIdx === spec.steps.length - 1) { const onDone = spec.onDone; diceState = null; push({ dice: null }); if (onDone) onDone(rolls); return; }
  diceState.stepIdx++; diceState.value = null; diceState.result = null;
  publishDice();
}
export function cancelDice() { diceState = null; push({ dice: null }); } // only offered before the first roll

function openFiringDice(workerId, ownLawyer, info) {
  const term = info.term;
  const thr = Math.max(0, Math.min(6, info.threshold + (info.union ? term.union_shift : 0) - (ownLawyer ? term.lawyer_shift : 0)));
  const tag = { "with cause": "With cause", "no cause": "No cause", "punitive": "Punitive" }[info.kind];
  openDice({
    title: `Fire ${workerId}`,
    sub: `${tag}${ownLawyer ? " · your lawyer" : ""}${info.union ? " · unionised" : ""} — they sue on ${thr}-or-under`,
    steps: [
      { prompt: `Will ${workerId} take you to court?`,
        resolve: (v) => v <= thr
          ? { text: `⚖️ Rolled ${v} — they're suing. You're out the ${term.court_fee} W court fee.`, stop: false, tone: "bad" }
          : { text: `🍃 Rolled ${v} — over ${thr}. They let it go: no claim, no cost.`, stop: true, tone: "good" } },
      { prompt: `Does the court side with ${workerId}?`,
        resolve: (v) => v <= thr
          ? { text: `💥 Rolled ${v} — they WIN. Pay ${term.award} W damages + the ${term.court_fee} W fee.`, stop: true, tone: "bad" }
          : { text: `🛡️ Rolled ${v} — over ${thr}. You beat the suit — just the ${term.court_fee} W fee.`, stop: true, tone: "good" } },
    ],
    onDone: (rolls) => act((g) => g.fire(workerId, { ownLawyer, rolls })),
  });
}
export function confirmDispose(equipId, name) {
  openConfirm({ title: `Dispose of the ${name}?`, body: `You sell it back for a fraction of cost (a real loss on the books), and whoever was using it goes bare-handed.`, yes: "Dispose" }, () => act((g) => g.disposeEquipment(equipId)));
}
// Borrowing means looking Dwight Folsom in the eye first — a beat to think twice before taking on debt.
export function borrowCredit() {
  const loc = economy.line_of_credit;
  openConfirm({
    npc: "folsom",
    title: "Dwight Folsom · First Hollow Bank",
    body: `Folsom will advance you ${loc.draw} W against your line — but it's a liability at ${Math.round(loc.interest * 100)}% interest, and the bank gets paid back at year-end before you count any winnings. Sure you want to borrow?`,
    yes: `Borrow ${loc.draw} W`,
  }, () => act((g) => g.drawCredit()));
}

export function openRivals() { push({ rivalView: true }); }
export function closeRivals() { push({ rivalView: false }); }

// The end-of-year report behind the win screen — standings, consolation awards, full per-player books.
function finalReport() {
  const players = game.state.players.map((p) => ({
    name: p.name, service: p.service, cash: p.cash, bankrupt: p.bankrupt,
    pnl: profitAndLoss(p), bs: balanceSheet(p),
    crew: p.tradesmen.length, equipment: p.equipment.length, services: p.modifiers?.length ?? 0,
  }));
  const ranked = [...players].sort((a, b) => (a.bankrupt !== b.bankrupt ? (a.bankrupt ? 1 : -1) : b.cash - a.cash));
  ranked.forEach((r, i) => (r.place = i + 1));
  const awards = [];
  const lead = (fn, icon, label, unit) => { const t = [...players].sort((a, b) => fn(b) - fn(a))[0]; if (t && fn(t) > 0) awards.push({ icon, label, who: t.name, val: `${fn(t)} ${unit}` }); };
  lead((p) => p.pnl.revenue, "💸", "Top line — most revenue", "W");
  lead((p) => p.crew, "👷", "Biggest crew", "hands");
  lead((p) => p.equipment, "🔧", "Best equipped", "tools");
  lead((p) => p.services, "🛡️", "Most buttoned-up", "services");
  return { results: ranked, awards, award: flavor?.award ?? "Business of the Year", town: flavor?.town ?? "town", bureau: flavor?.bureau };
}

// --- Flash-and-vanish errors (E5 §1): a blocked action flashes in ITS section, not the bottom. ---
let flashTimer = null;
function sectionFor(m) {
  if (/hire|capacity|tradesperson|sign-on|severance|fire|bare-handed/i.test(m)) return "crew";
  if (/equipment|tool|rig|dispose|rented|owned|idle/i.test(m)) return "equip";
  if (/building|relocat|step up|readying|deposit|move|already in the/i.test(m)) return "warehouse";
  if (/invoice|receivable|collect|factor/i.test(m)) return "ar";
  if (/payable|can't cover|cover \d|pay /i.test(m)) return "ap";
  if (/service|BBB|already carries|vendor fair/i.test(m)) return "bbb";
  if (/favor|sabotage|lawyer|rush|sue|window|buy time/i.test(m)) return "hand";
  if (/job|assign|sticky|routed|on-hold|drop|sell|max of/i.test(m)) return "jobs";
  return "general";
}
function flashError(msg) {
  push({ flash: { section: sectionFor(msg), msg } });
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => push({ flash: null }), 2600);
}

// --- Interactive entity cards (E5 §4): open a worker / tool / job as its action surface. -------
export function openEntity(kind, id) { playSfx("flip", 0.3); push({ entityCard: { kind, id } }); }
export function closeEntity() { push({ entityCard: null }); }

// --- The pop-up QUEUE (E5 §2): modals shown one at a time, in order, easy close/next. ----------
let lastRoundShown = 0;
let firstRollShown = false; // the opening "who goes first" dice reveal — shown once per game
function enqueuePopup(p) { ui.update((v) => ({ ...v, rev: v.rev + 1, popups: [...v.popups, p] })); }

// The opening dice ceremony: a d6 was re-rolled until it landed on a seated player (the engine did this
// deterministically at game build; we just read state.firstRoll). Returns the pop-up once, then null.
function buildFirstRoll() {
  const fr = game?.state?.firstRoll;
  if (!fr || firstRollShown) return null;
  firstRollShown = true;
  const n = game.state.players.length;
  return { kind: "roll", rolls: fr.rolls, players: n, seat: fr.seat, leadName: game.state.players[fr.seat]?.name ?? `Player ${fr.seat + 1}`, leadIsMe: online && fr.seat === mySeat };
}
export function dismissPopup() { ui.update((v) => ({ ...v, rev: v.rev + 1, popups: v.popups.slice(1) })); }
export function clearPopups() { ui.update((v) => ({ ...v, rev: v.rev + 1, popups: [] })); }
export function openSettings() { push({ settingsOpen: true }); }
export function closeSettings() { push({ settingsOpen: false }); }

/** Front of the round flow: a round-intro (once per round) then this player's exec summary. */
// The round-start townfolk card — fires ONCE at each round boundary for LOCAL play, no matter who
// leads off. With the rotating lead an AI can open the round, so this can't hang off the human's
// turn-start; advanceUntilHuman calls it at the boundary too. Online uses surfaceRoundStart. Returns
// true if it showed the card (so the caller can block on it).
function maybeShowRoundCard() {
  if (!game || online) return false;
  const s = game.state;
  if (s.turn <= lastRoundShown) return false;
  lastRoundShown = s.turn;
  const view = viewOf();
  const tl = townlifeForRound(view.season?.name, view.season?.roundInSeason); // this round's Maple Hollow story beat
  const leadP = s.players[s.activePlayerIndex];
  enqueuePopup({ kind: "round", turn: s.turn, season: view.season, town: flavor?.town, townlife: tl?.id ?? null, townlifeFlavor: tl?.flavor ?? null, lead: leadP?.name ?? null, leadIsMe: leadP ? !isAI(leadP.id) : false });
  return true;
}

function enqueueTurnStart(ctx) {
  if (!ctx || ctx.over || ctx.reckoning) return;
  const view = viewOf();
  const me = view.players[view.activePlayerIndex];
  if (isAI(me.id)) return; // rivals' turn-start summaries arrive with the watchable-AI work (Phase 4)
  maybeShowRoundCard(); // the round intro (guarded once per round; may already have fired if an AI led off)
  surfaceNewOutcomes(); // alert windows for what resolved during the rivals' round / your upkeep
  enqueuePopup({ kind: "summary", name: me.name, recurring: view.recurring, cash: me.cash, upkeepNet: ctx.upkeepNet ?? 0, drew: (ctx.drawn ?? []).length });
  // Then read each card you drew — preceded by a townsfolk intro when one of the cast is behind it,
  // with a rule explainer for the cards that have a special rule.
  for (const d of ctx.drawn ?? []) {
    const def = cardById.get(d.cardId) ?? {};
    const intro = npcIntroFor(d.cardId);
    if (intro) enqueuePopup({ kind: "character", ...intro });
    enqueuePopup({ kind: "card", cardId: d.cardId, art: d.art ?? null, name: d.name, flavor: d.flavor, text: d.text, rule: ruleFor(def) });
  }
}

// Rule explainers — fire for the cards that carry a special rule (E5 §5); the self-evident ones
// (job/incident/payable/windfall/shock/crew/theft/character/retirement/summons) get none.
const RULES = {
  subcontract: "You broker this one: a rival in the trade does the work for a fee, you bill the customer and pocket the markup. It isn't yours to staff.",
  civic: "A civic job — deliver it and the Mayor owes favours; let it collapse and a town-wide penalty hits everyone, you included.",
  project: "A phased project: take the 50% deposit now, collect the balance only when every phase lands. Some phases you do, some you sub out.",
  defect: "A code violation — it fines you and drags your output every turn until you fix it (or call in a Favor with the inspector).",
  gift: "A character hands you a card to keep and play later — open your Hand to use it.",
  bbb_special: "The BBB vendor fair is in town THIS turn only — buy services and shop upgrades while it lasts.",
};
function ruleFor(def) {
  if (def.subcontract && def.political) return RULES.civic;
  if (def.subcontract) return RULES.subcontract;
  if (def.type === "project") return RULES.project;
  if (def.type === "defect") return RULES.defect;
  if (def.type === "gift") return RULES.gift;
  if (def.type === "bbb_special") return RULES.bbb_special;
  return null;
}
export function openHand() { push({ handView: true }); }
export function closeHand() { push({ handView: false }); }

// --- Computed outcomes → ALERT windows (E5 §6) -------------------------------------------------
// Scan new log lines for the big "calculated" results and surface each as an acknowledge popup.
let lastScanned = 0;
const ALERTS = [
  [/💀 (.+?) cannot cover/, "💀 Bankruptcy", (m) => `${m[1]} ran out of cash and folded — their shop is out of the game.`],
  [/🏛️ (.+?) DELIVERED "(.+?)"/, "🏛️ Project delivered", (m) => `${m[1]} delivered ${m[2]} — collects the balance, favours all round.`],
  [/✗ "(.+?)" COLLAPSED past/, "✗ Project collapsed", (m) => `${m[1]} blew its deadline — the balance is forfeit.`],
  [/🏛️ civic project "(.+?)" delivered/, "🏛️ Civic job delivered", (m) => `${m[1]} was delivered — favours earned.`],
  [/🌐 Town labor union grips/, "🪙 Union drive", () => `The trades unionised — every firing is far riskier now (+2 to their odds). A Favor busts it.`],
  [/⚖️ (.+?) fired .+? SUED AND WON/, "⚖️ Wrongful termination", (m) => `${m[1]} fired a worker who sued and won — a costly payout on the books.`],
  [/🌐 (.+?) grips Maple Hollow/, "🌐 Town penalty", (m) => `${m[1]} — a town-wide levy now hits every shop in Maple Hollow.`],
  [/🏗️ (.+?) moved into (.+?) \(from/, "🏗️ Moved in", (m) => `${m[1]} finished readying and moved into ${m[2]}.`],
  [/⚠ (.+?) couldn't cover the .* balance on (.+?) —/, "⚠ Move forfeited", (m) => `${m[1]} couldn't close out ${m[2]} — the deposit is lost.`],
];
// Audio cues fired off the log: stings (duck the music for a beat) on the dramatic events the user
// flagged, plus a couple of satisfying one-shots. Files are drop-in (silent until they exist).
const SOUND_CUES = [
  [/💀 .* cannot cover|BANKRUPT/, "sting_bankrupt", true],
  [/bank CALLED the loan/, "sting_loan", true],
  [/🌐 .* grips Maple Hollow|levy now hits|town levy/i, "sting_levy", true],
  [/code violation|safety write-up|inspection .* fine|🚧/i, "sting_fine", true],
  [/COLLAPSED past deadline/, "sting_collapse", true], // a project/civic blows its deadline — balance forfeit
  [/⚖️.*(WINS|WALKS|SUED AND WON|lost in court)/, "sting_verdict", true], // a lawsuit is decided — the gavel falls
  [/✔ .* completed/, "job_done", false],
  [/collects .* in receivables|settles up|paid in full/i, "cash_register", false],
  [/walks anyway|poached|🚪|let .* go|fired/i, "worker_leaves", false],
];
function surfaceNewOutcomes() {
  if (!game) return;
  const log = game.state.log;
  for (let i = lastScanned; i < log.length; i++) {
    // The Slick Lawyer showcase: whoever plays one, EVERY client reveals the (forced) animation.
    const law = /🧑‍⚖️ (.+?) plays a Slick Lawyer/.exec(log[i]);
    if (law) { enqueuePopup({ kind: "card", cardId: "slick_lawyer", art: "slick_lawyer", name: "Slick Lawyer", forceAnim: true, flavor: "Objection!", text: `${law[1]} brings in the Slick Lawyer.` }); playSfx("gavel", 0.5); }
    for (const [re, title, body] of ALERTS) { const m = re.exec(log[i]); if (m) { enqueuePopup({ kind: "alert", title, body: body(m) }); break; } }
    for (const [re, id, sting] of SOUND_CUES) { if (re.test(log[i])) { sting ? playSting(id) : playSfx(id, 0.5); break; } }
  }
  lastScanned = log.length;
  surfaceDeckEvents();
}

// The living deck made visible (Stage 7): when YOUR deck reshapes (Dot adds, Hettrick pulls, the
// Mayor seeds…), show the cards moving + a shuffle. Only drains while the human is active, so a
// rival's reshapes (skipped) don't strand the human's.
let lastDeckEvent = 0;
function surfaceDeckEvents() {
  if (!game) return;
  const me = game.state.players[online && mySeat >= 0 ? mySeat : game.state.activePlayerIndex]; // your own deck reshapes
  if (!me || isAI(me.id)) return;
  const evs = game.state.deckEvents ?? [];
  for (let i = lastDeckEvent; i < evs.length; i++) {
    const e = evs[i];
    if (e.who === me.id) { enqueuePopup({ kind: "shuffle", reason: e.reason, add: e.add ?? null, count: e.count ?? e.remove ?? 0, removed: e.remove != null }); playSfx("riffle", 0.5); }
  }
  lastDeckEvent = evs.length;
}

// --- Rival card pop-ups (E5 §4) — what the rivals drew, per the Settings filter ----------------
function rivalCardInteresting(d) {
  const mode = get(settings).rivalPopups;
  if (mode === "none") return false;
  if (mode === "all") return true;
  const def = cardById.get(d.cardId) ?? {};
  // "interesting" = the dramatic / table-shaping draws, refreshed for the living deck:
  // civic builds, referrals, the NPC cast's jobs, the union, theft, summons, defects, incidents.
  return ["civic", "referral", "union", "theft", "summons", "defect", "incident", "character"].includes(def.type)
    || !!def.npc || def.size === "j5" || def.size === "j6"; // big jobs + any word-of-mouth NPC job
}

const declinedDamages = new Set(); // jobIds the human chose not to sue over
const openDamages = () => game.damagesCases.filter((c) => !declinedDamages.has(c.jobId));

// --- Card registry: unique card definitions for the detail modal + log↔card linking --------
const cardById = new Map();
for (const c of [...decks.fortune, ...decks.civil]) if (c.id && !cardById.has(c.id)) cardById.set(c.id, c);
// Longest names first so "Plumbing emergency" matches before a bare "Plumbing".
const cardsByNameLen = [...cardById.values()].filter((c) => c.name).sort((a, b) => b.name.length - a.name.length);

/** The first known card whose name appears in a log line, for making the line clickable. */
export function cardInLine(line) {
  return cardsByNameLen.find((c) => line.includes(c.name)) ?? null;
}
/** Open / close the card detail modal. */
export function viewCard(card) { if (card) { playSfx("flip", 0.4); push({ cardView: card }); } }
export function closeCard() { push({ cardView: null }); }

let game = null;
let ai = {}; // playerId -> strategy string, or null for a human seat

/** Deep-copy the UI-relevant slice of engine state into plain data (new references). */
function viewOf() {
  if (!game) return null;
  const s = game.state;
  // Whose sheet this client renders: online, ALWAYS your own (each player sees their own shop, locked
  // when it isn't their turn); local/hotseat, the active player's (one screen follows the table).
  const mi = online && mySeat >= 0 ? mySeat : s.activePlayerIndex;
  return {
    turn: s.turn, activePlayerIndex: s.activePlayerIndex, meIndex: mi, over: s.over, phase: s.phase,
    mustStaffBoon: game.unstaffedBoon.length > 0, // Chief Boon's mandatory job blocks end-turn until staffed
    log: s.log.slice(-8),
    deckLeft: s.players[mi]?.deck?.pile?.length ?? 0, // your own deck (living deck)
    globalEffects: (s.globalEffects ?? []).map((e) => ({ ...e })), // town-wide conditions (the global cards)
    projects: (s.projects ?? []).map((p) => ({ ...p, phases: p.phases.map((ph) => ({ ...ph })) })), // phased story-projects in flight
    pnl: profitAndLoss(s.players[mi]), // your books so far
    bs: balanceSheet(s.players[mi]),
    recurring: recurringExpenses(s, s.players[mi]), // the turn-start exec summary
    season: seasonFor({ turn: s.turn, economy, flavor }),
    players: s.players.map((p) => ({
      id: p.id, name: p.name, service: p.service, cash: p.cash, bankrupt: p.bankrupt, building: p.building, capacityBonus: p.capacityBonus ?? 0, bbbThisTurn: !!p.bbbThisTurn, pendingExpansion: p.pendingExpansion ? { ...p.pendingExpansion } : null,
      tradesmen: p.tradesmen.map((t) => {
        const tool = p.equipment.find((e) => e.assigned_to === t.id);
        return { ...t, productivity: workerProductivity(economy, p, t.id), tool: tool ? findEquipment(economy, tool.defId).name : null };
      }),
      equipment: p.equipment.map((e) => ({ ...e, assignedToId: e.assigned_to })),
      jobs: p.jobs.map((j) => ({ ...j, assigned_tradesmen: [...j.assigned_tradesmen] })),
      invoices: p.invoices.map((i) => ({ ...i })),
      payables: p.payables.map((a) => ({ ...a })),
      defects: p.defects.map((d) => ({ ...d })),
      modifiers: p.modifiers.map((m) => ({ ...m })),
      hand: p.hand.map((c) => ({ ...c })),
    })),
  };
}

// Decision modals belong to the ACTIVE player only. Online, an inactive client must never show (or
// resolve) one — it would diverge their game. They still get the informational alert pop-ups
// (the "audit" trail) to catch up. (v1: every decision is the active player's; the cross-player
// response windows come with networked PvP.)
const DECISION_KEYS = ["court", "poach", "mayor", "settle", "referral", "damages", "threat", "dice"];
function push(patch = {}) {
  ui.update((v) => {
    const next = { ...v, game, view: viewOf(), rev: v.rev + 1, ...patch };
    if (online && !myTurn()) for (const k of DECISION_KEYS) next[k] = null;
    return next;
  });
  if (online) { surfaceRoundStart(); surfaceActiveDraws(); } // round card (round tick) + the active player's fortune reveal — both guarded
  if (online && pending.length) flushMoves(); // persist any moves I just recorded (online only)
}
function fail(msg) { ui.update((v) => ({ ...v, rev: v.rev + 1, error: msg })); }

export const services = economy.services;

// ================= Online (lockstep) transport =================================================
// The whole game lives as {seed, seats, moves} in a Supabase row. Every client rebuilds the engine
// from seed+seats and replays the shared move log; the engine is deterministic (see
// packages/engine/src/engine/replay.js), so all stay in sync. The active player records their moves
// through a proxy and writes them; the HOST drives the (deterministic) AI seats and writes those.
let online = false;
let realGame = null;     // the un-proxied engine — replay applies here (no re-recording)
let pending = [];        // moves I've made since the last flush (the recordable proxy pushes here)
let log = [];            // the full shared move list I've applied to realGame
let onlineCfg = null;    // { seed, seats } — the immutable game config
let mySeat = -1;         // my seat index (== activePlayerIndex when it's my turn)
let isHostClient = false;
let hostDriving = false; // guard so the host runs the AI loop only once at a time

/** True for local play, or in online play when it's my seat's turn (used to gate the UI). */
export const myTurn = () => !online || !!(realGame && !realGame.state.over && realGame.state.activePlayerIndex === mySeat && !ai[realGame.currentPlayer.id]);
export const isOnline = () => online;

// Diagnostics: type botyState() in the browser console (both windows) to compare clients.
if (typeof window !== "undefined") {
  window.botyState = () => {
    const r = get(onlineGame);
    const s = realGame?.state;
    const out = {
      online, isHost: isHostClient, mySeat, myTurn: myTurn(), hostDriving,
      engineActive: s?.activePlayerIndex, engineTurn: s?.turn, over: s?.over,
      localLog: log.length, pending: pending.length,
      dbActiveSeat: r?.active_seat, dbMoves: r?.state?.moves?.length, dbStatus: r?.status,
      cashes: s?.players.map((p) => p.cash),         // a quick state fingerprint to compare clients
      jobs: s?.players.map((p) => p.jobs.length),
    };
    console.log("BOTY", JSON.stringify(out));        // eslint-disable-line no-console
    return out;
  };
}

/** Host: deal the seed + seats and flip the room to "active". Everyone builds the game from the row. */
export async function startOnlineGame() {
  const row = get(onlineGame), me = get(authUser);
  if (!row || !me) return;
  if (row.host_id !== me.id) return fail("Only the host can start the game.");
  const seats = [...get(onlineSeats)].sort((a, b) => a.seat - b.seat);
  if (!seats.length) return fail("Need at least one player to start.");
  const taken = new Set(seats.map((s) => s.trade).filter(Boolean));
  const free = economy.services.filter((t) => !taken.has(t)); // fill "auto" seats from the remaining trades
  const cfgSeats = seats.map((s, i) => ({ seat: i, name: s.display_name ?? `Seat ${i + 1}`, trade: s.trade || free.shift(), is_ai: !!s.is_ai, user_id: s.user_id ?? null }));
  unlockAudio();
  await replaceSeats(cfgSeats); // contiguous seats so engine index == game_seats.seat (RLS turn-lock)
  await writeGameState({ state: { seed: (Math.random() * 2 ** 32) >>> 0, seats: cfgSeats, moves: [] }, status: "active", active_seat: 0 });
}

// React to the room row: build the game when it goes active, then replay new moves as they land.
// Registered at the END of the module (see bottom) so every const it reaches (isAI, etc.) is already
// initialized — otherwise a hot-reload, which re-runs this file while onlineGame still holds an active
// game, would fire the subscriber before those consts exist (temporal-dead-zone crash).
function subscribeOnlineRoom() {
  onlineGame.subscribe((row) => {
    if (!row || row.status !== "active") { if (!row) resetOnline(); return; }
    if (!realGame) buildOnlineGame(row);
    else syncFromRow(row);
  });
}

function resetOnline() { online = false; realGame = null; pending = []; log = []; onlineCfg = null; mySeat = -1; isHostClient = false; hostDriving = false; }

// Online round start: when the round ticks over, FLUSH the previous round's piled-up pop-ups and
// lead with the townfolk story card — a clean reset for the new round on every client. (Local play
// shows this via enqueueTurnStart; online skips that tail, so we surface it here.)
function surfaceRoundStart() {
  if (!game || !online) return;
  const s = game.state;
  if (s.turn <= lastRoundShown) return;
  lastRoundShown = s.turn;
  const view = get(ui).view;
  const tl = townlifeForRound(view?.season?.name, view?.season?.roundInSeason);
  const lead = s.players[s.activePlayerIndex]?.name ?? null; // who leads off the new round (rotates each round)
  const roll = s.turn === 1 ? buildFirstRoll() : null; // round 1 opens with the "who goes first" dice
  const roundCard = { kind: "round", turn: s.turn, season: view?.season, town: flavor?.town, townlife: tl?.id ?? null, townlifeFlavor: tl?.flavor ?? null, lead, leadIsMe: s.activePlayerIndex === mySeat };
  ui.update((v) => ({ ...v, rev: v.rev + 1, popups: roll ? [roll, roundCard] : [roundCard] }));
}

// Online: reveal the ACTIVE player's fortune draw on every client — your own cards (no label), or a
// rival's clearly attributed ("👤 X drew:"). The engine drew them during replay; the return value is
// lost, so we read player.drewThisTurn off the state. Guarded once per (turn, player). Watching
// another player honours the Settings rival-pop-up filter so it doesn't pile up.
let lastTurnStartKey = "";
function surfaceActiveDraws() {
  if (!game || !online) return;
  const s = game.state;
  const key = `${s.turn}:${s.activePlayerIndex}`;
  if (key === lastTurnStartKey) return;
  const actor = s.players[s.activePlayerIndex];
  if (!actor) return;
  lastTurnStartKey = key;
  const mine = s.activePlayerIndex === mySeat;
  const mode = get(settings).rivalPopups;
  if (!mine && mode === "none") return; // watching, opted out of others' cards
  const isAi = isAI(actor.id);
  for (const d of actor.drewThisTurn ?? []) {
    if (!mine && mode !== "all" && !rivalCardInteresting(d)) continue; // watcher: only the interesting draws
    const def = cardById.get(d.cardId);
    const intro = npcIntroFor(d.cardId);
    if (intro) enqueuePopup({ kind: "character", ...intro });
    enqueuePopup({ kind: "card", who: mine ? null : actor.name, isAi, cardId: d.cardId, art: d.art ?? null, name: d.name, flavor: d.flavor, text: d.text, rule: ruleFor(def) });
  }
}

function buildOnlineGame(row) {
  const me = get(authUser);
  onlineCfg = { seed: row.state.seed, seats: row.state.seats };
  resetIds(); // deterministic entity ids across every client
  realGame = new Game(economy, onlineCfg.seats.map((s) => ({ name: s.name, service: s.trade })), { ...decks, difficulty: row.difficulty, seed: onlineCfg.seed, rotateFirst: true });
  realGame.state.flavor = flavor;
  pending = [];
  game = recordable(realGame, pending);
  ai = {};
  realGame.state.players.forEach((p, i) => { ai[p.id] = onlineCfg.seats[i].is_ai ? "balanced" : null; });
  mySeat = onlineCfg.seats.findIndex((s) => s.user_id === me?.id);
  isHostClient = row.host_id === me?.id;
  online = true;
  declinedDamages.clear();
  dealTownlife();
  lastScanned = 0; lastRoundShown = 0; lastDeckEvent = 0;
  realGame.start();
  log = [];
  const moves = row.state.moves ?? [];
  firstRollShown = moves.length > 0; // fresh game → show the dice; reconnect mid-game → skip it
  if (moves.length) { replay(realGame, moves, 0); log = [...moves]; }
  push({ screen: "board", error: null, aiActing: null, threat: null, picking: null, reckoning: null, final: null, court: null }); // push fires the round-1 dice + townfolk card
  surfaceNewOutcomes();
  maybeDriveAI();
  surfaceTurnDecisions(); // if the game opens on my turn, surface any pending decisions
}

function syncFromRow(row) {
  const moves = row.state?.moves ?? [];
  if (moves.length > log.length) {
    try { replay(realGame, moves, log.length); }
    catch (e) { console.error("[online] replay failed at move", log.length, "—", e?.message ?? e); }
    log = [...moves];
    push({ aiActing: null }); // push fires the townfolk card if a new round began in these moves
    surfaceNewOutcomes();
    if (realGame.state.over) { playSfx("chime", 0.5); playMusic("gala", 0.3); return push({ screen: "gala", final: finalReport() }); }
  }
  maybeDriveAI();
  surfaceTurnDecisions(); // a remote update advanced the turn to me → surface my decisions
}

// Write my freshly-recorded moves to the room. RLS admits the active player (or the host) only.
// Writes are SERIALIZED through a promise chain so they always land in the order they were made —
// otherwise the host's rapid AI-turn writes could reorder, leave active_seat stale, and 403 the
// next player's legitimate write (the desync we saw).
let writeChain = Promise.resolve();
function flushMoves() {
  if (!online || !pending.length) return;
  const row = get(onlineGame);
  const canWrite = isHostClient || (row && row.active_seat === mySeat);
  if (!canWrite) { // shouldn't happen (act() gates input), but never write illegally — keep the moves to retry
    if (realGame.state.activePlayerIndex === mySeat) console.warn("[online] my move couldn't flush (row active_seat stale) — will retry");
    return;
  }
  log.push(...pending); pending.length = 0;
  const payload = { state: { ...onlineCfg, moves: [...log] }, active_seat: realGame.state.activePlayerIndex };
  writeChain = writeChain
    .then(() => writeGameState(payload))
    .then((r) => { if (r?.error) console.error("[online] write rejected:", r.error); })
    .catch((e) => console.error("[online] write failed:", e?.message ?? e));
}

// Host only: drive the deterministic AI seats and persist each, until a human is up or the game ends.
async function maybeDriveAI() {
  if (!online || !isHostClient || hostDriving) return;
  if (!realGame || realGame.state.over) return;
  if (!ai[realGame.currentPlayer.id]) return; // a human is up
  hostDriving = true;
  try { await advanceUntilHuman(null); } finally { hostDriving = false; }
}
export const isAI = (playerId) => !!ai[playerId];

// --- Shell navigation (front-of-house: loading → login → menu → play / history / faq / credits) ---
export function goScreen(name) { push({ screen: name }); }
const signedIn = () => !supabaseReady || !!get(authSession); // guest mode if no backend configured
/** The loading splash's Enter button — the user gesture that unlocks audio and starts the intro theme.
 *  Routes to the login gate unless the tester is already signed in. */
export function enterApp() { unlockAudio(); playMusic("intro", 0.3); push({ screen: signedIn() ? "menu" : "login" }); }
/** Back to the main menu (intro theme resumes). */
export function backToMenu() { playMusic("intro", 0.3); push({ screen: "menu" }); }

// Reactively follow auth: a magic-link sign-in advances the gate to the menu; signing out from the
// menu drops back to the gate. (We don't yank a player mid-game on a transient session change.)
let sawSession = false;
authSession.subscribe((s) => {
  const screen = get(ui).screen;
  if (s && screen === "login") push({ screen: "menu" });
  else if (!s && sawSession && screen === "menu") push({ screen: "login" });
  sawSession = true;
});

const player = (id) => game.state.players.find((p) => p.id === id);
const handHas = (p, type) => p.hand.some((c) => c.type === type);

/** Start a new game. seats: [{ name, service, strategy|null }]. difficulty: steady|standard|cutthroat. */
export function newGame(seats, difficulty = "standard") {
  online = false; // a local/hotseat game — not the online transport
  unlockAudio(); // the Start click is our user gesture — lets the browser make sound
  game = new Game(economy, seats.map((s) => ({ name: s.name, service: s.service })), {
    ...decks,
    difficulty,
    seed: (Math.random() * 2 ** 32) >>> 0,
    rotateFirst: true, // roll for first player + rotate the lead-off each round
  });
  game.state.flavor = flavor;
  ai = {};
  declinedDamages.clear();
  dealTownlife(); // secretly deal this game's 6-of-12-per-season story of Maple Hollow
  lastScanned = 0; lastRoundShown = 0; lastDeckEvent = 0; firstRollShown = false;
  game.state.players.forEach((p, i) => { ai[p.id] = seats[i].strategy ?? null; });
  const ctx = game.start();
  push({ screen: "board", ctx, error: null, aiActing: null, threat: null, picking: null, reckoning: null, final: null, court: null });
  const fr = buildFirstRoll(); if (fr) enqueuePopup(fr); // the opening "who goes first" dice
  const db = game.state.deckBuild;
  if (db) enqueuePopup({ kind: "deckbuilt", size: db.size, reserve: db.reserve, pool: db.pool }); // "a unique deck dealt for this game"
  advanceUntilHuman(ctx);
}

/** Run an engine action for the current (human) player, catching illegal moves. */
export function act(fn) {
  if (game && ai[game.currentPlayer.id]) return; // a rival is acting — ignore stray human input
  if (online && game.state.activePlayerIndex !== mySeat) return; // online: not your turn — ignore
  try { fn(game); push({ error: null, flash: null }); surfaceNewOutcomes(); } // the triggering button clicks via the app-wide listener
  catch (e) { flashError(e?.message ?? String(e)); }
}

// --- Threats (Sabotage / Sue) + the response window --------------------------------------

export function startPick(type) {
  if (online) return fail("Sue / Sabotage / Favor aren't enabled in online play yet — coming soon.");
  push({ picking: type, error: null });
}
export function cancelPick() { push({ picking: null }); }

export function playSabotage(jobId) {
  push({ picking: null });
  try { game.playSabotage(jobId); } catch (e) { return fail(e?.message ?? String(e)); }
  resolveThreat();
}

export function playSue(debtorId, payableId, slick = false) {
  push({ picking: null });
  try { game.sue(debtorId, payableId, { slick }); } catch (e) { return fail(e?.message ?? String(e)); }
  resolveThreat();
}

/** Play a Favor on a rival's standing modifier. */
export function playFavor(targetId, modId) {
  push({ picking: null });
  let line;
  try { line = game.playFavor(targetId, modId); playSfx("coin", 0.5); } catch (e) { return fail(e?.message ?? String(e)); }
  if (line) enqueuePopup({ kind: "alert", title: "🪙 Favor played", body: line }); // confirm the fine/union actually cleared
  surfaceNewOutcomes();
  push({ error: null });
}

/** If the threatened player is AI, auto-respond; otherwise surface a modal for the human. */
function resolveThreat() {
  const t = game.state.pendingThreat;
  if (!t) return push({ error: null });
  const targetId = t.type === "sabotage" ? t.ownerId : t.type === "damages" ? t.contractorId : t.debtorId;
  if (ai[targetId]) { aiRespond(t, targetId); push({ error: null, threat: null }); refreshDamages(); }
  else { playSfx("gavel", 0.5); push({ error: null, threat: viewThreat(t) }); }
}

function aiRespond(t, targetId) {
  const target = player(targetId);
  if (t.type === "sabotage") {
    game.respondToThreat({ counter: handHas(target, "rush") }); // AI always rushes if it can
  } else {
    const canFight = target.cash >= economy.civil.legal_fee;
    game.respondToThreat({ contest: canFight, ownLawyer: handHas(target, "slick_lawyer") });
  }
}

/** The human target responds via the modal. A contested sue/damages is settled by a die the human
 *  physically rolls (the defendant "walks" on ≤ threshold); a concede or a Sabotage applies directly. */
export function respond(decision) {
  const t = game.state.pendingThreat;
  const getaway = t && (t.type === "sue" || t.type === "damages");
  if (getaway && decision.contest) {
    const ownLawyer = !!decision.ownLawyer;
    const thr = game.threatThreshold(ownLawyer);
    const FEE = economy.civil.legal_fee;
    let title, amount;
    if (t.type === "damages") { title = `Damages — ${player(t.hirerId)?.name ?? "the hirer"} v. you`; amount = t.value; }
    else { title = `Sued by ${player(t.creditorId)?.name ?? "a creditor"}`; amount = player(t.debtorId)?.payables.find((a) => a.id === t.payableId)?.amount; }
    push({ threat: null });
    openDice({
      title, noCancel: true,
      sub: `You walk on ${thr}-or-under${ownLawyer ? " · lawyer played" : ""}`,
      steps: [{ prompt: `Roll to beat the ${amount != null ? amount + " W " : ""}claim`,
        resolve: (v) => v <= thr
          ? { text: `🛡️ Rolled ${v} — you WALK. The claim is dismissed (just the ${FEE} W fee).`, stop: true, tone: "good" }
          : { text: `⚖️ Rolled ${v} — over ${thr}. You LOSE${amount != null ? ` — pay up to ${amount} W` : ""} + the ${FEE} W fee.`, stop: true, tone: "bad" } }],
      onDone: ([roll]) => applyRespond({ contest: true, ownLawyer, roll }),
    });
    return;
  }
  applyRespond(decision);
}
function applyRespond(decision) {
  try { game.respondToThreat(decision); } catch (e) { return fail(e?.message ?? String(e)); }
  push({ threat: null, error: null });
  surfaceNewOutcomes();
  refreshDamages();
}

function viewThreat(t) {
  if (t.type === "sabotage") {
    const owner = player(t.ownerId);
    const job = owner.jobs.find((j) => j.id === t.jobId);
    return { type: "sabotage", targetName: owner.name, jobName: job?.name ?? t.jobId, canCounter: handHas(owner, "rush") };
  }
  if (t.type === "damages") {
    const contractor = player(t.contractorId);
    return { type: "damages", targetName: contractor.name, jobName: t.jobName, amount: t.value, canLawyer: handHas(contractor, "slick_lawyer") };
  }
  const debtor = player(t.debtorId);
  const ap = debtor.payables.find((a) => a.id === t.payableId);
  return { type: "sue", targetName: debtor.name, amount: ap?.amount, canLawyer: handHas(debtor, "slick_lawyer") };
}

// --- Damages claims (the hirer sues a contractor who botched their routed job) -------------

function refreshDamages() {
  push({ damages: !game.state.pendingThreat && openDamages().length ? openDamages() : null });
}

export function sueDamagesUI(jobId, slick = false) {
  if (online && !myTurn()) return; // online: only the active player resolves their own decisions
  try { game.sueDamages(jobId, { slick }); } catch (e) { return fail(e?.message ?? String(e)); }
  resolveThreat();
}

export function skipDamages(jobId) {
  declinedDamages.add(jobId);
  refreshDamages();
}

/** After any action that might end a player's options (here: just refresh / continue). */
function afterAct() {
  if (game.state.over) return; // shouldn't be here mid-turn
}

// --- Turn flow ---------------------------------------------------------------------------

export function endTurn() {
  if (online && !myTurn()) return; // online: only the active player resolves their own decisions
  if (game.state.pendingSettle.length) return fail("Answer the settlement offer first");
  if (game.state.pendingPoach.length) return fail("Answer the poaching offer first");
  if (game.state.pendingMayor.length) return fail("Answer the Mayor's drive first");
  if (game.unstaffedBoon.length) return fail(`Chief Boon's job must be assigned a worker first — drop everything`);
  if (game.referralCases.some((r) => r.contractor_id === game.state.players[game.state.activePlayerIndex].id)) return fail("Answer the referral offer first");
  if (game.state.pendingCourt.length) return fail("Resolve your court case first");
  if (game.state.pendingThreat) return fail("Resolve the response window first");
  const proceed = () => {
    const ctx = game.endTurn();
    if (ctx.reckoning) return enterReckoning(ctx.order);
    if (ctx.over) { playSfx("chime", 0.5); playMusic("gala", 0.3); return push({ screen: "gala", ctx, final: finalReport() }); }
    if (online) { push({ aiActing: null }); surfaceNewOutcomes(); maybeDriveAI(); surfaceTurnDecisions(); } // flush my turn (push fires the round card if the round ticked); host drives the next AI seats
    else advanceUntilHuman(ctx);
  };
  if (!get(settings).confirmEndTurn) return proceed(); // quick-end mode
  // Safety check: flag anything you might want to handle before passing the turn.
  const me = game.state.players[game.state.activePlayerIndex];
  const idle = me.tradesmen.filter((t) => t.assignedJob == null && (t.out_until == null || t.out_until <= game.state.turn)).length;
  const expiring = me.jobs.filter((j) => j.deadline_turn === game.state.turn && j.state !== "Complete").length;
  const warns = [];
  if (idle) warns.push(`${idle} idle ${idle === 1 ? "worker" : "workers"} (not on a job)`);
  if (expiring) warns.push(`${expiring} ${expiring === 1 ? "job" : "jobs"} will EXPIRE this turn if left unfinished`);
  const body = warns.length ? `⚠ ${warns.join("; ")}. End your turn anyway?` : "End your turn and pass to the next player?";
  openConfirm({ title: "End turn?", body, yes: "End turn" }, proceed);
}

/** A failed Demand Roll summons you to court. AI seats auto-defend; a human rolls the getaway die. */
export function resolveCourtUI(payableId, lawyer) {
  if (online && !myTurn()) return; // online: only the active player resolves their own decisions
  const thr = game.courtThreshold(payableId, lawyer);
  const c = game.courtCases.find((x) => x.payableId === payableId);
  const vendor = c?.vendor ?? "the creditor"; const amount = c?.amount;
  const FEE = economy.civil.legal_fee;
  push({ court: null });
  openDice({
    title: `Court — ${vendor}`, noCancel: true,
    sub: `You walk on ${thr}-or-under${lawyer ? " · lawyer played" : ""}${c?.agencyLawyer ? " · vs collections" : ""}`,
    steps: [{ prompt: `Roll to beat the ${amount != null ? amount + " W " : ""}claim`,
      resolve: (v) => v <= thr
        ? { text: `🛡️ Rolled ${v} — you WALK. ${vendor}'s debt is wiped (just the ${FEE} W fee).`, stop: true, tone: "good" }
        : { text: `⚖️ Rolled ${v} — over ${thr}. You LOSE — pay ${vendor}${amount != null ? " " + amount + " W" : ""} + the ${FEE} W fee.`, stop: true, tone: "bad" } }],
    onDone: ([roll]) => {
      try { game.resolveCourt(payableId, { lawyer, roll }); } catch (e) { return fail(e?.message ?? String(e)); }
      surfaceNewOutcomes();
      push({ court: game.courtCases.length ? [...game.courtCases] : null });
    },
  });
}

let skipAI = false;
/** Fast-forward the rest of the AI phase (the "Skip ▶▶" button): drain the rival pop-ups too. */
export function skipAITurns() { skipAI = true; clearPopups(); }

/** Resolve once the pop-up queue has drained (the human has read this rival's turn). The store
 *  subscription fires SYNCHRONOUSLY on subscribe, so if there are no popups right now the callback
 *  runs before `unsub` is assigned — defer the unsubscribe to dodge that temporal-dead-zone crash. */
function waitForPopups() {
  return new Promise((resolve) => {
    let unsub;
    unsub = ui.subscribe((v) => {
      if (v.popups.length) return;
      resolve();
      if (unsub) unsub(); else queueMicrotask(() => unsub && unsub());
    });
  });
}

/**
 * Step through AI seats until a human is up — but make it WATCHABLE: for each rival, announce
 * their turn, show what they drew and the moves they made (the new log lines), and pace it so you
 * can follow the table change seat by seat. Skippable.
 */
async function advanceUntilHuman(initialCtx) {
  skipAI = false;
  let lastCtx = initialCtx;
  while (!game.state.over) {
    const p = game.currentPlayer;
    if (!ai[p.id]) break; // human is up
    if (maybeShowRoundCard()) await waitForPopups(); // round kicks off for everyone BEFORE the lead (even an AI) plays
    if (game.state.over) return;
    const drew = (lastCtx?.drawn ?? []).map((d) => d.name); // what the deck just dealt this rival
    const mode = get(settings).rivalPopups;

    if (mode !== "none" && !skipAI && !online) { // online: drive AI fast — no blocking rival pop-ups (don't make the table wait on the host clicking)
      // Opponent's turn opens with their executive summary, then their cards open & close in order —
      // wait for you to read the table before they make their moves.
      const rp = game.state.players.find((x) => x.id === p.id);
      enqueuePopup({ kind: "summary", rival: true, name: p.name, recurring: recurringExpenses(game.state, rp), cash: rp.cash, upkeepNet: lastCtx?.upkeepNet ?? 0, drew: (lastCtx?.drawn ?? []).length });
      for (const d of lastCtx?.drawn ?? []) if (mode === "all" || rivalCardInteresting(d)) {
        const intro = npcIntroFor(d.cardId);
        if (intro) enqueuePopup({ kind: "character", rival: p.name, ...intro });
        enqueuePopup({ kind: "card", rival: p.name, cardId: d.cardId, art: d.art ?? null, name: d.name, flavor: d.flavor, text: d.text });
      }
      await waitForPopups();
      if (game.state.over) return;
    } else {
      push({ aiActing: { name: p.name, drew, lines: [] }, court: null, settle: null, poach: null, mayor: null, referral: null });
      if (!skipAI) await sleep(450);
    }

    const before = game.state.log.length;
    if (game.settleCases.length) game.autoResolveSettle();
    if (game.courtCases.length) game.autoResolveCourt();
    if (game.damagesCases.length) game.autoResolveDamages();
    if (game.poachCases.length) game.autoResolvePoach();
    if (game.mayorCases.length) game.autoResolveMayor();
    if (game.referralCases.length) game.autoResolveReferral(online ? undefined : (cid) => !!ai[cid]); // online: no callback (must serialize for replay) → auto-resolves all; local: only AI shops
    const humanIds = new Set(game.state.players.filter((x) => !ai[x.id]).map((x) => x.id));
    try { botActions(game, ai[p.id], { humanIds }); } catch { /* best effort */ }
    const lines = game.state.log.slice(before).slice(-5); // this rival's moves this turn

    const ctx = game.endTurn();
    if (ctx.reckoning) { push({ aiActing: null }); return enterReckoning(ctx.order); }
    if (ctx.over) { playSfx("chime", 0.5); playMusic("gala", 0.3); return push({ aiActing: null, screen: "gala", ctx, final: finalReport() }); }
    push({ aiActing: { name: p.name, drew, lines } }); // recap + the updated table snapshot
    if (!skipAI) await sleep(800);
    lastCtx = ctx;
  }
  if (game.state.over) return;
  if (game.settleCases.length || game.courtCases.length || openDamages().length) playSfx("gavel", 0.5);
  // Online: the host has only been DRIVING the AI. The human now up runs their own turn — surface
  // their decisions on THEIR client (this one if it's the host's turn; otherwise the remote client
  // does it via syncFromRow). Stop here; no host-side turn-start ceremony for a remote player.
  if (online) { push({ aiActing: null }); surfaceTurnDecisions(); return; }
  enqueueTurnStart(lastCtx); // the human is up — round intro + summary + card reveals
  push({ aiActing: null, ctx: lastCtx, error: null });
  // STACK RULES: read every card you drew FIRST (the Resolve reveals), THEN the response windows
  // surface in order — so a decision never pops over a card you haven't seen, and play doesn't
  // continue until each is answered. (Decisions raised mid-turn by your own actions surface live.)
  await waitForPopups();
  if (game.state.over) return;
  surfaceTurnDecisions();
}

// Surface the active player's turn-start decision windows. Online, only on the active player's own
// client (their decisions are theirs to resolve); local play always surfaces for the seated human.
function surfaceTurnDecisions() {
  if (online && !myTurn()) return;
  const myReferrals = game.referralCases.filter((r) => r.contractor_id === meLive().id);
  push({
    settle: game.settleCases.length ? [...game.settleCases] : null,
    court: game.courtCases.length ? [...game.courtCases] : null,
    damages: openDamages().length ? openDamages() : null,
    poach: game.poachCases.length ? [...game.poachCases] : null,
    mayor: game.mayorCases.length ? [...game.mayorCases] : null,
    referral: myReferrals.length ? myReferrals : null,
  });
}

// --- Referral: a rival brokered a job your trade can do — accept it (they earn a fee) or refuse ---
export function resolveReferralUI(id, accept) {
  if (online && !myTurn()) return; // online: only the active player resolves their own decisions
  try { game.resolveReferral(id, { accept }); } catch (e) { return fail(e?.message ?? String(e)); }
  surfaceNewOutcomes();
  const me = game.state.players[game.state.activePlayerIndex];
  const mine = game.referralCases.filter((r) => r.contractor_id === me.id);
  push({ referral: mine.length ? mine : null });
}

// --- Poached: counter-offer (1/2/3 W + a loyalty roll) or let the worker walk ----------------
export function resolvePoachUI(workerId, counter) {
  if (online && !myTurn()) return; // online: only the active player resolves their own decisions
  if (counter <= 0) {
    try { game.resolvePoach(workerId, { counter: 0 }); } catch (e) { return fail(e?.message ?? String(e)); }
    surfaceNewOutcomes();
    push({ poach: game.poachCases.length ? [...game.poachCases] : null });
    return;
  }
  const thr = counter + 2;
  const wname = crewIdentity(workerId).name;
  push({ poach: null });
  openDice({
    title: `Keep ${wname}?`, noCancel: true,
    sub: `Countered ${counter} W — they stay on ${thr}-or-under`,
    steps: [{ prompt: `Roll: do they take your counter, or the rival's offer?`,
      resolve: (v) => v <= thr
        ? { text: `🤝 Rolled ${v} — ${wname} stays!`, stop: true, tone: "good" }
        : { text: `💸 Rolled ${v} — over ${thr}. ${wname} walks anyway (you still paid ${counter} W).`, stop: true, tone: "bad" } }],
    onDone: ([roll]) => {
      try { game.resolvePoach(workerId, { counter, roll }); } catch (e) { return fail(e?.message ?? String(e)); }
      surfaceNewOutcomes();
      push({ poach: game.poachCases.length ? [...game.poachCases] : null });
    },
  });
}

// --- The Mayor's re-election drive: buy a Favor for 10 W (+seeds work) or pass ----------------
export function resolveMayorUI(buy) {
  if (online && !myTurn()) return; // online: only the active player resolves their own decisions
  try { game.resolveMayor({ buy }); } catch (e) { return fail(e?.message ?? String(e)); }
  surfaceNewOutcomes();
  push({ mayor: game.mayorCases.length ? [...game.mayorCases] : null });
}

/** Accept or decline a natural-6 settlement offer. */
export function resolveSettleUI(payableId, accept) {
  if (online && !myTurn()) return; // online: only the active player resolves their own decisions
  try { game.resolveSettle(payableId, { accept }); } catch (e) { return fail(e?.message ?? String(e)); }
  push({ settle: game.settleCases.length ? [...game.settleCases] : null });
}

// --- The Final Reckoning (Last Licks) ----------------------------------------------------

let reckon = null; // { order, idx }

function enterReckoning(order) {
  reckon = { order, idx: -1 };
  push({ screen: "reckoning", reckoning: reckon, aiActing: null });
  advanceSeat();
}

function advanceSeat() {
  reckon.idx += 1;
  if (reckon.idx >= reckon.order.length) {
    game.closeBooks();
    reckon = null;
    playSfx("chime", 0.5);
    playMusic("gala", 0.3); return push({ screen: "gala", final: finalReport(), reckoning: null });
  }
  const id = reckon.order[reckon.idx];
  game.seatReckoning(id);
  if (ai[id]) return advanceSeat(); // AI seats take no last licks (bots don't litigate)
  push({ reckoning: { ...reckon } }); // human seat: render the reckoning screen
}

export function reckoningDone() {
  if (game.state.pendingThreat) return fail("Resolve the response window first");
  advanceSeat();
}

export function restart() {
  game = null;
  declinedDamages.clear();
  push({ screen: "setup", ctx: null, final: null, threat: null, picking: null, reckoning: null, aiActing: null, error: null, court: null, damages: null, settle: null, cardView: null });
}

// Dev-only debug hook for manual/automated testing in the browser console.
if (typeof window !== "undefined" && import.meta.env?.DEV) {
  window.__boty = { ui, getGame: () => game, refresh: () => push({}) };
}

// Start reacting to the online room — registered LAST so every binding it touches is initialized
// (safe even when a hot-reload re-runs this module with an active game already in onlineGame).
subscribeOnlineRoom();
