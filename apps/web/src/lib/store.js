// The game controller — a thin seam between the Svelte UI and the engine. For M2 it runs the
// engine locally in the browser (LocalTransport); later a RemoteTransport will send the same
// intents to Supabase, and the UI won't change. AI seats are driven by the engine's own bots.

import { writable, get } from "svelte/store";
import { Game, profitAndLoss, balanceSheet, recurringExpenses, seasonFor, workerProductivity, findEquipment, classifyTermination, unionActive, recordable, replay, resetIds, whyNotReady } from "@boty/engine";
import { settings } from "./settings.js";
import { botActions } from "@boty/engine/bots";
import { loadContent } from "./content.js";
import { unlockAudio, playSfx, playSting, playMusic } from "./sound.js";
import { checkInvariants, noteRoundSurfaced } from "./invariants.js";
import { recordResult } from "./social.js";
import { dealTownlife, townlifeForRound } from "./townlife.js";
import { setMoneyRate } from "./money.js";
import { npcIntroFor } from "./townsfolk.js";
import { crewIdentity } from "./crew.js";
import { session as authSession, user as authUser } from "./auth.js";
import { supabaseReady } from "./supabase.js";
import { onlineGame, onlineSeats, writeGameState, replaceSeats, fetchGameRow, leaveGame } from "./games.js";
import { flow } from "./flowlog.js";

const { economy, decks, flavor } = loadContent();
// DEV ONLY: ?maxturns=N shortens the year so the two-tab E2E (and quick manual tests) reach the Final
// Reckoning fast. Patched on the shared economy before any game is built, so all clients agree.
if (import.meta.env.DEV && typeof location !== "undefined") {
  const mt = parseInt(new URLSearchParams(location.search).get("maxturns"), 10);
  if (mt > 0) economy.max_turns = mt;
}
setMoneyRate(economy.w_to_usd); // wire the W→$ display rate from the economy data
const AI_DELAY = 650; // ms between AI seats, so you can watch the table move
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** UI state. `view` is a fresh plain-data snapshot of the engine state on every change — the
 * engine mutates its objects in place, so the UI must read a new-reference snapshot or Svelte
 * won't see the change. `rev` bumps on every change. */
export const ui = writable({
  screen: "loading", game: null, view: null, ctx: null, flavor, economy, error: null, rev: 0,
  aiActing: null, threat: null, picking: null, reckoning: null, final: null, court: null, damages: null, settle: null, estate: null, routingDecision: null,
  cardView: null, popups: [], settingsOpen: false, flash: null, entityCard: null, handView: false, rivalView: false, assignWorker: null, tutorial: null,
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
  const callRisk = Math.round(game.creditCallRisk() * 100); // chance the bank calls the whole loan after THIS draw
  const warn = callRisk > 0
    ? ` ⚠ You're already carrying debt — after this draw there's about a ${callRisk}% chance Folsom CALLS the whole loan back at once (and that risk climbs every time you go back to the well; can't cover it and you fold).`
    : "";
  openConfirm({
    npc: "folsom",
    title: "Dwight Folsom · First Hollow Bank",
    body: `Folsom will advance you ${loc.draw} W against your line — a liability at ${Math.round(loc.interest * 100)}% interest, repaid at year-end before you count any winnings.${warn} Sure you want to borrow?`,
    yes: `Borrow ${loc.draw} W`,
  }, () => act((g) => g.drawCredit()));
}

export function openRivals() { push({ rivalView: true }); }
export function closeRivals() { push({ rivalView: false }); }

// The end-of-year report behind the win screen — standings, consolation awards, full per-player books.
let outcomeRecorded = false;
let bankruptcySounded = false; // the bankruptcy ballad plays once per game, only on the folded player's own client
/** Online only: record MY win/loss to my profile (the leaderboard) at game end — once per game. */
function recordMyOutcome() {
  if (!online || mySeat < 0 || outcomeRecorded || !game) return;
  outcomeRecorded = true;
  const live = game.state.players.filter((p) => !p.bankrupt);
  const winner = live.length ? live.reduce((a, b) => (b.cash > a.cash ? b : a)) : null;
  recordResult(!!winner && game.state.players.indexOf(winner) === mySeat);
}
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

// Worker-first assignment: pick a tradesperson, then tap a job to place THEM on it (control over which
// worker goes where). startAssignWorker closes the card + arms the mode; the Shop highlights the jobs
// with an open slot and routes a tap to placeWorkerOnJob.
export function startAssignWorker(workerId) { closeEntity(); push({ assignWorker: workerId }); }
export function placeWorkerOnJob(jobId) {
  const wid = get(ui).assignWorker; if (!wid) return;
  act((g) => g.assignJob(jobId, wid)); // the specific worker → this job
  push({ assignWorker: null });
}
export function cancelAssignWorker() { push({ assignWorker: null }); }

// --- The pop-up QUEUE (E5 §2): modals shown one at a time, in order, easy close/next. ----------
let lastRoundShown = 0;
let firstRollShown = false; // the opening "who goes first" dice reveal — shown once per game
let reckIntroShown = false; // the Last Licks intro — shown once per game (enter on the trigger client, resume on the others)
function enqueuePopup(p) { flow("popup", { kind: p?.kind, name: p?.name ?? p?.title ?? null, who: p?.who ?? p?.rival ?? null }); ui.update((v) => ({ ...v, rev: v.rev + 1, popups: [...v.popups, p] })); }

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
  noteRoundSurfaced(s.turn); // dev-only: flags a re-fire (the looping-card bug)
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
    enqueuePopup({ kind: "card", cardId: d.cardId, art: d.art ?? null, name: d.name, flavor: d.flavor, text: d.text, rule: ruleFor(def), routing: d.routing ?? null, ownContract: true });
    if (d.drawnCard) enqueuePopup({ kind: "card", cardId: d.drawnCard.cardId, art: d.drawnCard.cardId, name: d.drawnCard.name, flavor: d.drawnCard.flavor, text: d.drawnCard.text }); // the drawn civil event, as its own card
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
  if (!def) return null; // a card not in the master pool (a tailored job, a civic share) → no rule line
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
  [/💀 (.+?) cannot cover/, "💀 Bankruptcy", (m) => `${m[1]} ran out of cash and folded — their shop is out of the game.`, "bankrupt"],
  [/🏦 the bank CALLED the loan/, "🏦 The bank called your loan", () => "You leaned on the line of credit once too often — the bank demanded the entire balance back at once. If you can't cover it, the shop folds at upkeep."],
  [/🏛️ (.+?) DELIVERED "(.+?)"/, "🏛️ Project delivered", (m) => `${m[1]} delivered ${m[2]} — collects the balance, favours all round.`],
  [/✗ "(.+?)" COLLAPSED past/, "✗ Project collapsed", (m) => `${m[1]} blew its deadline — the balance is forfeit.`],
  [/🏛️ civic project "(.+?)" delivered/, "🏛️ Civic job delivered", (m) => `${m[1]} was delivered — favours earned.`],
  [/🌐 Town labor union grips/, "🪙 Union drive", () => `The trades unionised — every firing is far riskier now (+2 to their odds). A Favor busts it.`, "union_drive"],
  [/⚖️ (.+?) fired .+? SUED AND WON/, "⚖️ Wrongful termination", (m) => `${m[1]} fired a worker who sued and won — a costly payout on the books.`],
  [/^⚖️ (.+?(?:WINS|WALKS).+)$/, "⚖️ Court verdict", (m) => m[1], "courthouse_day"], // a sue/damages suit is decided — surface the outcome, under the courthouse
  [/🌐 (.+?) grips Maple Hollow/, "🌐 Town penalty", (m) => `${m[1]} — a town-wide levy now hits every shop in Maple Hollow.`,
    (m) => { const g = game?.state?.globalEffects?.find((e) => e.name === m[1]); return g?.art ? { kind: "card", id: g.art } : null; }], // show the levy's own image (storm / opera scandal / firehouse / hospital)
  [/🏗️ (.+?) moved into (.+?) \(from/, "🏗️ Moved in", (m) => `${m[1]} finished readying and moved into ${m[2]}.`,
    (m) => { const mv = game?.state?.players?.find((p) => p.name === m[1]); return mv ? { kind: `shop/${artSlug(mv.service)}`, id: mv.building } : null; }], // show the NEW shop image
  [/⚠ (.+?) couldn't cover the .* balance on (.+?) —/, "⚠ Move forfeited", (m) => `${m[1]} couldn't close out ${m[2]} — the deposit is lost.`],
];
// Sounds are no longer fired off the log scan (that played them all at once at round start, and ahead
// of the cards). Card / alert / report popups carry their sound and play it on DISPLAY (soundForPopup
// in Popup.svelte); a money move you make plays on the click (in act()). So nothing pile-ups on a skip.
function surfaceNewOutcomes() {
  if (!game) return;
  const log = game.state.log;
  for (let i = lastScanned; i < log.length; i++) {
    // The Slick Lawyer showcase: whoever plays one, EVERY client reveals the (forced) animation.
    const law = /🧑‍⚖️ (.+?) plays a Slick Lawyer/.exec(log[i]);
    if (law) enqueuePopup({ kind: "card", cardId: "slick_lawyer", art: "slick_lawyer", name: "Slick Lawyer", forceAnim: true, flavor: "Objection!", text: `${law[1]} brings in the Slick Lawyer.` }); // its gavel plays on display
    for (const [re, title, body, art] of ALERTS) { const m = re.exec(log[i]); if (m) { const dyn = typeof art === "function" ? art(m) : null; enqueuePopup(dyn ? { kind: "alert", title, body: body(m), artKind: dyn.kind, artId: dyn.id } : { kind: "alert", title, body: body(m), art: art ?? null }); break; } } // the alert's sting plays on display (soundForPopup), not here — so a skipped one is silent
  }
  lastScanned = log.length;
  surfaceDeckEvents();
}

// The living deck made visible (Stage 7): when YOUR deck reshapes (Dot adds, Hettrick pulls, the
// Mayor seeds…), show the cards moving + a shuffle — for the player whose deck was actually adjusted.
// Each event carries who:player.id; we show only your own, and mark each as seen so a hotseat table-
// mate's reshapes aren't consumed by your pass (a shared cursor would strand the later player's).
function surfaceDeckEvents() {
  if (!game) return;
  const me = game.state.players[online && mySeat >= 0 ? mySeat : game.state.activePlayerIndex]; // your own deck reshapes
  if (!me || isAI(me.id)) return;
  for (const e of game.state.deckEvents ?? []) {
    if (e._shown || e.who !== me.id) continue; // only YOUR not-yet-seen reshapes (others wait for their owner)
    e._shown = true;
    enqueuePopup({ kind: "shuffle", reason: e.reason, add: e.add ?? null, count: e.count ?? e.remove ?? 0, removed: e.remove != null });
    playSfx("riffle", 0.5);
  }
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
let threatResolver = null; // resolves when the human answers a threat a bot raised mid-AI-turn (resumes the loop)
const openDamages = () => game.damagesCases.filter((c) => !declinedDamages.has(c.jobId));

// --- Card registry: unique card definitions for the detail modal + log↔card linking --------
const cardById = new Map();
for (const c of [...decks.fortune, ...decks.civil]) if (c.id && !cardById.has(c.id)) cardById.set(c.id, c);
// Longest names first so "Plumbing emergency" matches before a bare "Plumbing".
const cardsByNameLen = [...cardById.values()].filter((c) => c.name).sort((a, b) => b.name.length - a.name.length);

// --- Popup sounds -----------------------------------------------------------------------------------
// Every popup plays its sound WHEN IT DISPLAYS (in Popup.svelte), not when the log is scanned — so a
// sound rides its card as it's revealed, and a SKIPPED card stays silent (no pile-up at round end).
// Mapped by the card's TYPE, so all ~112 cards are covered by kind with money/legal/loss logic baked in.
const TYPE_SOUND = {
  job: "deal", routed: "deal", incident: "deal", civic: "deal", crew: "deal", // a contract / worker dealt in
  windfall: "cash_register", referral: "coin",                                 // money IN (big payout / small fee)
  payable: "coin", audit: "coin", back_taxes: "coin",                          // a bill LANDS (paying it OFF later → cash_register)
  defect: "sting_fine", shock: "coin",                                         // a code violation / a setback
  summons: "gavel", lawsuit: "gavel", class_action: "gavel", slick_lawyer: "gavel", // the law arrives
  retirement: "worker_leaves", theft: "worker_leaves",                         // crew / gear off the books
  gift: "flip", review: "chime", bbb_special: "chime",                         // softer table beats
  favor: "flip", rush: "flip", buy_time: "flip",                              // a hand card played
  union: "sting_levy",                                                         // a town-wide grip
};
const snd = (id) => (id ? { id, sting: id.startsWith("sting_") } : null);
function soundForAlertPopup(p) {
  const t = `${p.title ?? ""}`;
  if (/Bankrupt/i.test(t)) return snd("sting_bankrupt");
  if (/called your loan/i.test(t)) return snd("sting_loan");
  if (/Town penalty|Union drive/i.test(t)) return snd("sting_levy");
  if (/collapsed|forfeited/i.test(t)) return snd("sting_collapse");
  if (/verdict|Wrongful/i.test(t)) return snd("sting_verdict");
  if (/delivered|Moved in/i.test(t)) return snd("chime");
  return null;
}
/** The sound a popup makes the moment it DISPLAYS — synced to the reveal, silent if the popup is skipped. */
export function soundForPopup(p) {
  if (!p) return null;
  if (p.kind === "roll") return snd("dice");
  if (p.kind === "deckbuilt" || p.kind === "shuffle") return snd("riffle");
  if (p.kind === "alert") return soundForAlertPopup(p);
  if (p.kind === "jobreport") return p.jobs?.some((j) => j.status === "complete") ? snd("job_done") : null;
  if (p.kind !== "card") return null;
  if (p.who || p.rival) return snd("flip"); // a RIVAL's reveal just flips — the effect lands on them, not you
  return snd(TYPE_SOUND[cardById.get(p.cardId)?.type]) ?? snd("flip"); // your own card plays its effect
}

const artSlug = (svc) => (svc === "HVAC technician" ? "hvac" : (svc ?? "").toLowerCase());
/** A static card def's display art key. Job cards carry NO art of their own — it's computed per-trade
 *  at draw time — so recompute it here (for the viewer's trade) so a job that's already LEFT play
 *  (completed/expired/referred) still shows its graphic in the log, not a placeholder. */
function staticCardArt(c) {
  const svc = game?.state?.players?.[game.state.activePlayerIndex]?.service;
  const slug = artSlug(svc);
  if (c.type === "job" && c.npc) return `job/${c.npc}/${slug}`;
  if (c.type === "job" && c.size) return ["j1", "j2", "j3"].includes(c.size) ? `job/walkin/${{ j1: "1p", j2: "2p", j3: "2p_basic" }[c.size]}` : `job/${c.size}/${slug}`;
  // Civic jobs (the Opera House, County Hospital, Town Hall, etc.) keep their art under civic/<id> —
  // match startCivic's keying so a DELIVERED civic that's left play still shows its graphic in the log.
  if (c.type === "civic") return c.art ?? (c.seasonal_storm ? "civic/storm/summer" : `civic/${c.id}`);
  return c.art ?? c.id;
}
/** The first known card whose name appears in a log line, for making the line clickable. A LIVE job
 *  (anyone's) wins — tailored jobs (NPC/ladder/routed) carry their per-trade name AND resolved art
 *  key (e.g. job/lundgren/mechanic). Failing that, the static def, with its art recomputed per-trade. */
export function cardInLine(line) {
  if (game) {
    const jobs = game.state.players
      .flatMap((p) => p.jobs)
      .filter((j) => j.name)
      .sort((a, b) => b.name.length - a.name.length); // longest name first, so specifics beat substrings
    const j = jobs.find((j) => line.includes(j.name));
    if (j) return { name: j.name, art: j.art ?? j.card, cardId: j.card, flavor: j.flavor ?? null };
  }
  const c = cardsByNameLen.find((c) => line.includes(c.name));
  return c ? { name: c.name, art: staticCardArt(c), cardId: c.id, flavor: c.flavor ?? null } : null;
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
  const me = s.players[mi];
  const nm = (id) => s.players.find((p) => p.id === id)?.name ?? "someone";
  // Persistent player-v-player lawsuits, from the rendered player's view: claims they can PURSUE, and
  // suits AGAINST them (to settle or Favor-drop). These live until resolved — no timer.
  const lawsuits = {
    mine: (s.pendingDamages ?? []).filter((c) => (c.recipientId ?? c.hirerId) === me?.id).map((c) => ({ jobId: c.jobId, jobName: c.jobName, value: c.value, other: nm(c.contractorId), settlement: c.settlement ?? null })),
    against: (s.pendingDamages ?? []).filter((c) => c.contractorId === me?.id).map((c) => ({ jobId: c.jobId, jobName: c.jobName, value: c.value, other: nm(c.recipientId ?? c.hirerId), settlement: c.settlement ?? null })),
  };
  // PM/GC contracts YOU broker — the fee/markup you stand to earn while subs do the trades, plus each
  // portion's status (this is also why you hold suits: a sub who botched YOUR contract is suable).
  const pmContracts = [
    ...(s.incidents ?? []).filter((c) => c.pm_id === me?.id).map((c) => ({
      kind: "PM tender", id: c.id, name: c.name ?? c.id, commission: c.fee ?? 0, gross: null, deadline: c.deadline_turn,
      portions: (c.portions ?? []).map((pt) => ({ trade: pt.trade, who: pt.bank ? "the county" : pt.sub_id === me?.id ? "you" : nm(pt.sub_id), done: !!pt.done, mine: pt.sub_id === me?.id })),
    })),
    ...(s.routed ?? []).filter((c) => c.gc_id === me?.id).map((c) => ({
      kind: "GC contract", id: c.id, name: c.name ?? c.id, commission: c.commission ?? 0, gross: c.client_value ?? null, deadline: c.deadline_turn,
      portions: (c.portions ?? []).map((pt) => ({ trade: pt.trade, who: pt.bank ? "the bank" : pt.self ? "you" : nm(pt.sub_id), done: !!pt.done, mine: !!pt.self || pt.sub_id === me?.id })),
    })),
  ];
  return {
    lawsuits, pmContracts, observer: iAmOut(), // observer: this client has folded — read-only, watch or leave
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
      drewThisTurn: (p.drewThisTurn ?? []).map((d) => ({ ...d })), // online Fortune tab reads this (replay loses the turn ctx)
      tradesmen: p.tradesmen.map((t) => {
        const tool = p.equipment.find((e) => e.assigned_to === t.id);
        return { ...t, productivity: workerProductivity(economy, p, t.id), tool: tool ? findEquipment(economy, tool.defId).name : null };
      }),
      equipment: p.equipment.map((e) => ({ ...e, assignedToId: e.assigned_to })),
      jobs: p.jobs.map((j) => ({ ...j, assigned_tradesmen: [...j.assigned_tradesmen], holdReason: j.state === "OnHold" ? whyNotReady(game.state, p, j) : null })),
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
const DECISION_KEYS = ["court", "poach", "mayor", "settle", "estate", "referral", "damages", "threat", "dice"];
function push(patch = {}) {
  ui.update((v) => {
    const next = { ...v, game, view: viewOf(), rev: v.rev + 1, ...patch };
    if (online && !myTurn()) for (const k of DECISION_KEYS) next[k] = null;
    return next;
  });
  // "Cash Is a Fact" — the bankruptcy ballad. Plays ONCE, only on the client whose own shop folded
  // (iAmOut is per-client). Self-resets while you're still in the game, so it's ready for the next one.
  if (!iAmOut()) bankruptcySounded = false;
  else if (!bankruptcySounded) { bankruptcySounded = true; playMusic("Cash_Is_a_Fact", 0.35, { loop: false }); }
  if (online) { surfaceRoundStart(); surfaceActiveDraws(); } // round card (round tick) + the active player's fortune reveal — both guarded
  if (online && pending.length) flushMoves(); // persist any moves I just recorded (online only)
  checkInvariants({ state: game?.state, popups: get(ui).popups, online }); // dev-only: shout if the flow breaks
  flow("state", { ms: Date.now() % 1e7, seat: mySeat, online, screen: get(ui).screen, turn: game?.state?.turn, phase: game?.state?.phase, active: game?.state?.activePlayerIndex, mine: myTurn(), reckIdx: game?.state?.reckoningIdx, moves: log?.length ?? 0, threat: !!game?.state?.pendingThreat,
    suits: (game?.state?.pendingDamages ?? []).map((c) => `${c.contractorId}>${c.recipientId ?? c.hirerId}:${(c.jobName || "").slice(0, 22)}`) });
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

/** Every human seat has folded (offline / one-screen play). */
function humansAllOut() {
  if (!game) return false;
  const humans = game.state.humanIds ?? [];
  return humans.length > 0 && humans.every((id) => game.state.players.find((p) => p.id === id)?.bankrupt);
}
/** THIS client is out — its shop has folded (online: my own seat; offline: every human seat). An observer
 *  now: no actions, just watch the rest play out or leave. Closing the fold popup was the last act. */
export const iAmOut = () => !!game && (online ? mySeat >= 0 && !!game.state.players[mySeat]?.bankrupt : humansAllOut());

/** True for local play, or in online play when it's my seat's turn (used to gate the UI). A folded seat
 *  is never "my turn" — a bankrupt shop has no moves left. */
export const myTurn = () => !iAmOut() && (!online || !!(realGame && !realGame.state.over && realGame.state.activePlayerIndex === mySeat && !ai[realGame.currentPlayer.id]));
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
  const seed = (Math.random() * 2 ** 32) >>> 0;
  // The first-player roll can make the round-1 lead a seat OTHER than 0; the row's active_seat must
  // match it or that player can't write (RLS turn-lock). Build a throwaway game to read the rolled seat.
  resetIds();
  const probe = new Game(economy, cfgSeats.map((s) => ({ name: s.name, service: s.trade })), { ...decks, difficulty: row.difficulty, seed, rotateFirst: true });
  const firstSeat = probe.state.firstSeat ?? 0;
  await writeGameState({ state: { seed, seats: cfgSeats, moves: [] }, status: "active", active_seat: firstSeat });
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

function resetOnline() { online = false; realGame = null; pending = []; log = []; onlineCfg = null; mySeat = -1; isHostClient = false; hostDriving = false; confirmedLen = 0; writeInFlight = false; stopOnlineTick(); }

// Online round start: when the round ticks over, FLUSH the previous round's piled-up pop-ups and
// lead with the townfolk story card — a clean reset for the new round on every client. (Local play
// shows this via enqueueTurnStart; online skips that tail, so we surface it here.)
function surfaceRoundStart() {
  if (!game || !online) return;
  const s = game.state;
  if (s.phase === "reckoning" || s.over) return; // Last Licks / year-end isn't a new round — no round card (the year ticks to max+1)
  if (s.turn <= lastRoundShown) return;
  lastRoundShown = s.turn;
  const view = get(ui).view;
  const tl = townlifeForRound(view?.season?.name, view?.season?.roundInSeason);
  const lead = s.players[s.activePlayerIndex]?.name ?? null; // who leads off the new round (rotates each round)
  const roll = s.turn === 1 ? buildFirstRoll() : null; // round 1 opens with the "who goes first" dice
  const roundCard = { kind: "round", turn: s.turn, season: view?.season, town: flavor?.town, townlife: tl?.id ?? null, townlifeFlavor: tl?.flavor ?? null, lead, leadIsMe: s.activePlayerIndex === mySeat };
  noteRoundSurfaced(s.turn); // dev-only: flags a re-fire (the looping-card bug)
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
  if (s.phase === "reckoning" || s.over) return; // Last Licks / year-end doesn't draw — don't re-surface a stale round draw
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
    enqueuePopup({ kind: "card", who: mine ? null : actor.name, isAi, cardId: d.cardId, art: d.art ?? null, name: d.name, flavor: d.flavor, text: d.text, rule: ruleFor(def), routing: d.routing ?? null, ownContract: mine });
    if (d.drawnCard) enqueuePopup({ kind: "card", who: mine ? null : actor.name, isAi, cardId: d.drawnCard.cardId, art: d.drawnCard.cardId, name: d.drawnCard.name, flavor: d.drawnCard.flavor, text: d.drawnCard.text }); // the drawn civil event, as its own card
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
  realGame.state.humanIds = realGame.state.players.filter((p) => !ai[p.id]).map((p) => p.id); // human seats DEFER contract routing to a modal
  mySeat = onlineCfg.seats.findIndex((s) => s.user_id === me?.id);
  isHostClient = row.host_id === me?.id;
  online = true;
  flow("players", { mySeat, isHost: isHostClient, seats: realGame.state.players.map((p, i) => ({ seat: i, id: p.id, name: p.name, trade: p.service, ai: !!ai[p.id] })) });
  outcomeRecorded = false; // a new (or rebuilt) online game — its result hasn't been recorded yet
  declinedDamages.clear();
  dealTownlife();
  realGame.start();
  log = [];
  const moves = row.state.moves ?? [];
  firstRollShown = moves.length > 0; // fresh game → show the dice; reconnect mid-game → skip it
  if (moves.length) { replay(realGame, moves, 0); log = [...moves]; }
  // Surfacing guards, set AFTER replay: a FRESH game (no moves) shows the round-1 card + opening reveals
  // (guards start "before" them); a RECONNECT or any rebuild mid-game must NOT replay them — otherwise
  // every remote sync that rebuilt the game re-fired the round-1 card and re-scanned the whole log.
  lastRoundShown = moves.length ? realGame.state.turn : realGame.state.turn - 1;
  lastScanned = moves.length ? log.length : 0;
  if (!moves.length) reckIntroShown = false; // fresh game → the Last Licks intro is allowed to fire again
  // Self-heal: if the row's active_seat doesn't match the engine's real lead (e.g. a game started
  // before the first-player roll, or any drift), the host corrects it so the true active player can write.
  if (isHostClient && row.active_seat !== realGame.state.activePlayerIndex) {
    writeGameState({ state: { ...onlineCfg, moves: [...log] }, active_seat: realGame.state.activePlayerIndex });
  }
  confirmedLen = log.length; // we built from this row, so its moves are already persisted
  startOnlineTick();         // begin the flaky-link poll/retry safety net for this game
  push({ screen: "board", economy, error: null, aiActing: null, threat: null, picking: null, reckoning: null, final: null, court: null }); // push fires the round-1 dice + townfolk card (economy reset — a prior tutorial may have set the 6-round one)
  surfaceNewOutcomes();
  if (realGame.state.phase === "reckoning") { resumeReckoning(); return; } // reconnected mid Last Licks → render the live seat
  if (passStuckFoldedSeat()) return; // reconnected into a row stuck on a folded active seat — pass it
  maybeDriveAI();
  surfaceDecisionsAfterReveal(); // if the game opens on my turn, surface decisions AFTER the reveals
}

function syncFromRow(row) {
  const moves = row.state?.moves ?? [];
  flow("sync", { seat: mySeat, movesIn: moves.length, have: log.length, rowActive: row.active_seat, status: row.status });
  if (moves.length >= log.length) confirmedLen = Math.max(confirmedLen, log.length); // the row carries (at least) all our moves
  if (moves.length > log.length) {
    try { replay(realGame, moves, log.length); }
    catch (e) {
      // The incremental apply diverged (a half-applied state — e.g. a mid-game code hot-reload, or a
      // dropped Realtime message). The move list is authoritative and replays deterministically from
      // scratch, so SELF-HEAL: rebuild the whole game from the row instead of cascading broken syncs.
      console.warn("[online] sync diverged at move", log.length, "—", e?.message ?? e, "→ rebuilding from the row to resync");
      buildOnlineGame(row);
      return;
    }
    log = [...moves];
    push({ aiActing: aiBanner() }); // watchers see the bots' turns too: "🤖 playing" when an AI holds the seat, else cleared
    surfaceNewOutcomes();
    if (realGame.state.over) { playSfx("chime", 0.5); playMusic("gala", 0.3); recordMyOutcome(); return push({ screen: "gala", final: finalReport() }); }
  }
  if (realGame.state.phase === "reckoning") { if (get(ui).screen !== "reckoning") resumeReckoning(); return; } // Last Licks — render the live seat; no AI driving / decisions
  if (passStuckFoldedSeat()) return; // a folded shop was stuck as the active seat — we passed it
  maybeDriveAI();
  surfaceDecisionsAfterReveal(); // a remote update advanced the turn to me → surface decisions after the reveals
}

// Write my freshly-recorded moves to the room. RLS admits the active player (or the host) only.
// Writes are SERIALIZED through a promise chain so they always land in the order they were made —
// otherwise the host's rapid AI-turn writes could reorder, leave active_seat stale, and 403 the
// next player's legitimate write (the desync we saw).
let writeChain = Promise.resolve();
let confirmedLen = 0;     // # of moves known PERSISTED to the DB; if log races ahead, the tick re-sends
let writeInFlight = false; // a persist() promise is pending — don't pile concurrent writes of the same log

// Reject (don't hang) if a write stalls — a hung fetch on a flaky link would otherwise block the whole
// serialized writeChain forever, which is exactly how the table froze. The full-log payload is
// idempotent, so a later retry safely supersedes a write that's secretly still in flight.
function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("write timed out")), ms))]);
}

// Persist the ENTIRE move log (idempotent — last write wins). On success, advance confirmedLen so the
// tick stops retrying; on any failure, confirmedLen stays behind and the tick re-sends. Serialized so
// writes always land in order.
function persistLog() {
  const n = log.length;
  const payload = { state: { ...onlineCfg, moves: [...log] }, active_seat: realGame.state.activePlayerIndex };
  writeInFlight = true;
  writeChain = writeChain
    .then(() => withTimeout(writeGameState(payload), 8000))
    .then((r) => { if (r?.error) throw new Error(r.error); confirmedLen = Math.max(confirmedLen, n); })
    .catch((e) => console.error("[online] write failed (tick will retry):", e?.message ?? e))
    .finally(() => { writeInFlight = false; });
}

function flushMoves() {
  if (!online || !pending.length) return;
  const row = get(onlineGame);
  const canWrite = isHostClient || (row && row.active_seat === mySeat);
  flow("flush", { seat: mySeat, pending: pending.length, have: log.length, rowActive: row?.active_seat, canWrite, engineActive: realGame?.state?.activePlayerIndex });
  if (!canWrite) { // shouldn't happen (act() gates input), but never write illegally — keep the moves to retry
    if (realGame.state.activePlayerIndex === mySeat) console.warn("[online] my move couldn't flush (row active_seat stale) — will retry");
    return;
  }
  log.push(...pending); pending.length = 0;
  persistLog();
}

// Robustness net for flaky links. Every few seconds while online: (1) PULL the row fresh in case
// Realtime dropped a message or the channel went silent — the deadlock we kept hitting — and (2) if our
// local moves never confirmed (a write failed or hung), re-send them. Both are safe: pulls only re-sync
// on real change, and the write is full-log idempotent.
let onlineTick = null;
async function onlinePoll() {
  if (!online) return;
  let row = null;
  try { row = await fetchGameRow(); } catch { /* transient — next tick retries */ }
  if (online && row) {
    const cur = get(onlineGame);
    const dbMoves = row.state?.moves?.length ?? 0;
    if (dbMoves >= log.length) confirmedLen = Math.max(confirmedLen, log.length); // the DB has all our moves
    // Re-sync only on genuine change (new moves / turn handoff / status) so we don't re-run sync side-effects every tick.
    if (dbMoves > log.length || row.active_seat !== cur?.active_seat || row.status !== cur?.status) onlineGame.set(row);
  }
  // Our moves outran what's confirmed in the DB → a prior write failed; re-send if we're still allowed to write.
  if (online && log.length > confirmedLen && !writeInFlight) {
    const r = get(onlineGame);
    if (isHostClient || (r && r.active_seat === mySeat)) {
      flow("retry", { seat: mySeat, have: log.length, confirmed: confirmedLen, rowActive: r?.active_seat });
      persistLog();
    }
  }
}
function startOnlineTick() { if (!onlineTick) onlineTick = setInterval(onlinePoll, 2500); }
function stopOnlineTick() { if (onlineTick) { clearInterval(onlineTick); onlineTick = null; } }

// The "🤖 playing" banner payload when an AI holds the active seat (else null) — so watchers see the
// bots take their turns online, not just the host. Reads the AI's draw + its recent log lines.
function aiBanner() {
  if (!realGame || realGame.state.over || realGame.state.phase === "reckoning") return null;
  const p = realGame.currentPlayer;
  return p && ai[p.id] ? { name: p.name, drew: (p.drewThisTurn ?? []).map((d) => d.name), lines: realGame.state.log.slice(-4) } : null;
}

// Host only: drive the deterministic AI seats and persist each, until a human is up or the game ends.
async function maybeDriveAI() {
  if (!online || !isHostClient || hostDriving) return;
  if (!realGame || realGame.state.over) return;
  if (!ai[realGame.currentPlayer.id]) return; // a human is up
  hostDriving = true;
  try { await advanceUntilHuman(null); } finally { hostDriving = false; }
}

/** Recovery: a folded shop is stuck as the active seat — it can neither act nor end its turn, so the
 *  table can't advance on its own (the host only drives AI seats). Whoever may write — the host, or that
 *  seat's own client — passes the turn; the engine's advanceTurn skips folded seats. This rescues a row
 *  left stuck from before that engine fix, and any edge where a fold lands on the active seat. */
function passStuckFoldedSeat() {
  if (!online || !realGame || realGame.state.over) return false;
  if (!realGame.state.players[realGame.state.activePlayerIndex]?.bankrupt) return false;
  if (!(isHostClient || realGame.state.activePlayerIndex === mySeat)) return false; // RLS admits only these writers
  let ctx;
  try { ctx = game.endTurn(); } // recorded; advanceTurn skips the folded seat → the next solvent player is up
  catch (e) { console.warn("[online] couldn't pass a stuck folded seat:", e?.message ?? e); return false; }
  if (ctx?.reckoning) { enterReckoning(ctx.order); return true; }
  if (ctx?.over) { surfaceNewOutcomes(); playSfx("chime", 0.5); playMusic("gala", 0.3); recordMyOutcome(); push({ screen: "gala", ctx, final: finalReport() }); return true; }
  push({ aiActing: aiBanner() }); surfaceNewOutcomes(); maybeDriveAI();
  return true;
}
export const isAI = (playerId) => !!ai[playerId];

// --- Shell navigation (front-of-house: loading → login → menu → play / history / faq / credits) ---
export function goScreen(name) { push({ screen: name }); }
const signedIn = () => !supabaseReady || !!get(authSession); // guest mode if no backend configured
/** The loading splash's Enter button — the user gesture that unlocks audio and starts the intro theme.
 *  Routes to the login gate unless the tester is already signed in. */
export function enterApp() { unlockAudio(); playMusic("intro", 0.3); push({ screen: signedIn() ? "menu" : "login" }); }
/** Back to the main menu (intro theme resumes). Force-closes EVERY overlay/pop-up/window first so
 *  nothing left open in the game bleeds onto the menu (or the next game). */
export function backToMenu() {
  diceState = null; confirmCb = confirmAltCb = null; // drop any in-flight dice / confirm callbacks
  playMusic("intro", 0.3);
  push({
    screen: "menu", popups: [], dice: null, confirm: null, aiActing: null, threat: null, picking: null,
    reckoning: null, final: null, court: null, damages: null, settle: null, estate: null, routingDecision: null,
    cardView: null, entityCard: null, handView: false, rivalView: false, rulesOpen: false, settingsOpen: false, flash: null, assignWorker: null, tutorial: null,
  });
}

/** Quit the current game and return to the menu. Online: leave the room first (a guest frees their
 *  seat; the host closes it for the table — the host drives the AI, so the match can't go on without
 *  them), which teardown→resetOnline clears. Offline: just drop back; the next New Game rebuilds. */
export function quitToMenu() {
  if (online) { try { leaveGame(); } catch (e) { console.warn("[quit] leaveGame failed:", e?.message ?? e); } }
  backToMenu();
}
/** Quit button: confirm before bailing — leaving a game can't be undone. */
export function confirmQuit() {
  const body = online
    ? (isHostClient ? "Leave this game and return to the menu. As host, this closes the room for everyone." : "Leave this game and return to the menu — you'll drop out of the match.")
    : "Leave this game and return to the main menu. This game's progress will be lost.";
  openConfirm({ title: "Quit to menu?", body, yes: "Quit" }, quitToMenu);
}

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
  lastScanned = 0; lastRoundShown = 0; firstRollShown = false; reckIntroShown = false;
  game.state.players.forEach((p, i) => { ai[p.id] = seats[i].strategy ?? null; });
  game.state.humanIds = game.state.players.filter((p) => !ai[p.id]).map((p) => p.id); // human seats DEFER contract routing to a modal
  const ctx = game.start();
  push({ screen: "board", ctx, economy, error: null, aiActing: null, threat: null, picking: null, reckoning: null, final: null, court: null }); // reset the display economy (a prior tutorial may have set the 6-round one)
  const fr = buildFirstRoll(); if (fr) enqueuePopup(fr); // the opening "who goes first" dice
  const db = game.state.deckBuild;
  if (db) enqueuePopup({ kind: "deckbuilt", size: db.size, reserve: db.reserve, pool: db.pool }); // "a unique deck dealt for this game"
  advanceUntilHuman(ctx);
}

// --- Guided tutorial: a short solo run (6 rounds) with step-by-step coaching pop-ups. -----------
const TUTORIAL_STEPS = [
  { title: "🎓 Welcome to your shop", text: "You run a one-person trade in Maple Hollow — six short rounds to learn the ropes. Start by bringing on help: open the 🏪 Your Shop tab and tap ➕ Hire to take on a tradesperson." },
  { title: "Take a job & assign", text: "Your Fortune deck deals work each round. Open a job in your shop and tap Assign — or open a worker and use 📌 Assign to a job. Assigned crew chip away at the work every turn." },
  { title: "Grow & get paid", text: "Room to grow? Tap ⬆️ Upgrade (or Move → a bigger shop) for more crew capacity. When a job finishes it bills the client — that invoice (your AR) is collected for you automatically a turn or two later." },
  { title: "Pay your bills", text: "Vendor bills (AP) come due in the Payables box — pay them before they age, or a creditor can drag you to court. Cash in on time, cash out on time: that's the whole game." },
  { title: "Weather a shock", text: "Bad-luck cards happen. If a job falls behind, play Rush to claw back time, or Buy Time to extend a deadline — from the job's buttons or your 🃏 hand." },
  { title: "Close the year 🏆", text: "End your turns to reach the Gala, where the Better Business Bureau names the year's most profitable shop Business of the Year. That's the goal — now go run it for real!" },
];
export function startTutorial() {
  online = false; unlockAudio();
  const tutEconomy = { ...economy, max_turns: 6 }; // a short 6-round year → straight to a mini gala (no engine changes)
  resetIds();
  game = new Game(tutEconomy, [{ name: "You", service: "mechanic" }], { ...decks, difficulty: "steady", seed: (Math.random() * 2 ** 32) >>> 0, rotateFirst: true });
  game.state.flavor = flavor;
  ai = {}; declinedDamages.clear(); dealTownlife();
  lastScanned = 0; lastRoundShown = 0; firstRollShown = false; reckIntroShown = false;
  game.state.humanIds = game.state.players.map((p) => p.id);
  const ctx = game.start();
  push({ screen: "board", ctx, economy: tutEconomy, tutorial: { step: 0, ...TUTORIAL_STEPS[0] }, error: null, aiActing: null, threat: null, picking: null, reckoning: null, final: null, court: null });
  advanceUntilHuman(ctx); // solo → hands the turn straight to you
}
export function nextTutorial() {
  const t = get(ui).tutorial; if (!t) return;
  const n = t.step + 1;
  if (n >= TUTORIAL_STEPS.length) return push({ tutorial: null });
  push({ tutorial: { step: n, ...TUTORIAL_STEPS[n] } });
}
export function skipTutorial() { push({ tutorial: null }); }

/** Run an engine action for the current (human) player, catching illegal moves. */
export function act(fn) {
  if (iAmOut()) return; // you've folded — observer only, no actions
  if (game && ai[game.currentPlayer.id]) return; // a rival is acting — ignore stray human input
  if (online && game.state.activePlayerIndex !== mySeat) return; // online: not your turn — ignore
  const before = game ? game.state.log.length : 0;
  try {
    fn(game); push({ error: null, flash: null }); // the triggering button clicks via the app-wide listener
    // A money/crew move you JUST made gets its sound on the click (these have no card popup). Bigger
    // settlements ring the register; small outlays clink a coin; losing a worker has its own cue.
    const fresh = game.state.log.slice(before).join("  ");
    if (/paid .* in full|factored|settles up|collects .* in receivables/i.test(fresh)) playSfx("cash_register", 0.5);
    else if (/🔧 .*(cleared|to clear)|on the line of credit|repaid|drew .* credit/i.test(fresh)) playSfx("coin", 0.5);
    else if (/let .* go|\bfired\b|walks anyway|poached|🚪/i.test(fresh)) playSfx("worker_leaves", 0.5);
    surfaceNewOutcomes();
  } catch (e) { flashError(e?.message ?? String(e)); }
}

// --- Threats (Sabotage / Sue) + the response window --------------------------------------

export function startPick(type) {
  if (online && !myTurn()) return; // online: only the active player opens a Favor / Sue pick
  push({ picking: type, error: null });
}
export function cancelPick() { push({ picking: null }); }

export function playSue(debtorId, payableId, slick = false) {
  if (online && !myTurn()) return;
  push({ picking: null });
  try { game.sue(debtorId, payableId, { slick }); } catch (e) { return fail(e?.message ?? String(e)); }
  resolveThreat();
}

/** Spend a Favor to sabotage a rival's job — Sabotage lives on the Favor card only (no separate card).
 *  Opens the response window: a LOCAL human owner Rushes via the modal; an AI or an ONLINE owner auto-
 *  resolves (Rush if held), then the caught roll (raised by their Security — cancel it with a Favor first). */
export function favorSabotageUI(jobId) {
  if (online && !myTurn()) return;
  push({ picking: null });
  try { game.favorSabotage(jobId); } catch (e) { return fail(e?.message ?? String(e)); }
  resolveThreat();
}

/** Play a Favor on a rival's standing modifier. */
export function playFavor(targetId, modId) {
  if (online && !myTurn()) return;
  push({ picking: null });
  let line;
  try { line = game.playFavor(targetId, modId); } catch (e) { return fail(e?.message ?? String(e)); } // the Favor showcase popup plays its sound on display
  if (line) enqueuePopup({ kind: "card", cardId: "favor", art: "favor", name: "Favor", forceAnim: true, flavor: "A quiet word in the right ear.", text: line }); // show the Favor card + confirm the fine/union/suit actually cleared
  surfaceNewOutcomes();
  push({ error: null });
}

/** Resolve the response to a threat I just raised. A human target defends via the modal. An AI target:
 *  sabotage → it just rushes-or-eats it; a sue/damages → if it can't afford the fee it folds, otherwise
 *  it FIGHTS and we roll the verdict die in the court pop-up (you watch the rival try to wriggle out). */
function resolveThreat() {
  const t = game.state.pendingThreat;
  if (!t) return push({ error: null });
  const targetId = t.type === "sabotage" ? t.ownerId : t.type === "damages" ? t.contractorId : t.debtorId;
  // A LOCAL human defends via the modal (same screen). ONLINE the defender is a different client who
  // isn't the active player and can't write a response, so their defence auto-resolves (fight if they can
  // afford it, play their Slick Lawyer if held) and the SUER rolls the verdict — recorded, replays clean.
  if (!ai[targetId] && !online) { playSfx("gavel", 0.5); return push({ error: null, threat: viewThreat(t) }); }
  const target = player(targetId);
  if (t.type === "sabotage") { aiRespond(t, targetId); push({ error: null, threat: null }); surfaceNewOutcomes(); refreshDamages(); return; }
  const canFight = target.cash >= economy.civil.legal_fee;
  const ownLawyer = handHas(target, "slick_lawyer");
  if (!canFight) { // can't cover the fee → folds, you win outright (no roll)
    try { game.respondToThreat({ contest: false, ownLawyer: false }); } catch (e) { return fail(e?.message ?? String(e)); }
    push({ error: null, threat: null }); surfaceNewOutcomes(); refreshDamages(); return;
  }
  const thr = game.threatThreshold(ownLawyer);
  push({ threat: null }); playSfx("gavel", 0.5);
  openDice({
    title: t.type === "damages" ? `${target.name} defends — damages suit` : `${target.name} fights your suit`,
    noCancel: true,
    sub: `They walk on ${thr}-or-under${ownLawyer ? " · their Slick Lawyer's in" : ""} — roll the verdict die`,
    steps: [{ prompt: "Roll the verdict", resolve: (v) => v <= thr
      ? { text: `🛡️ Rolled ${v} — ${target.name} WALKS (${thr}-or-under). The claim's dismissed.`, stop: true, tone: "bad" }
      : { text: `⚖️ Rolled ${v} — over ${thr}. ${target.name} LOSES — they pay up.`, stop: true, tone: "good" } }],
    onDone: ([roll]) => {
      try { game.respondToThreat({ contest: true, ownLawyer, roll }); } catch (e) { return fail(e?.message ?? String(e)); }
      push({ threat: null }); surfaceNewOutcomes(); refreshDamages();
    },
  });
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
  if (threatResolver) { const r = threatResolver; threatResolver = null; r(); } // resume a paused AI turn (a bot sued me)
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

// --- Player-v-player lawsuits — persistent; acted on from the Lawsuits panel any turn ------------
// No forced modal: claims live in view.lawsuits until you Sue, the defendant settles/Favor-drops, or
// the game ends. refreshDamages just keeps the old modal shut.
function refreshDamages() { push({ damages: null }); }

export function sueDamagesUI(jobId, slick = false) {
  if (online && !myTurn()) return; // online: only the active player resolves their own decisions
  try { game.sueDamages(jobId, { slick }); } catch (e) { return fail(e?.message ?? String(e)); }
  resolveThreat();
}

/** Defendant offers to settle a suit against them for half. */
export function offerSettlementUI(jobId) {
  if (online && !myTurn()) return;
  try { game.offerSettlement(jobId); } catch (e) { return fail(e?.message ?? String(e)); }
  push({ error: null }); surfaceNewOutcomes();
}
/** Plaintiff accepts/refuses a settlement offer. */
export function respondSettlementUI(jobId, accept) {
  if (online && !myTurn()) return;
  try { game.respondSettlement(jobId, accept); } catch (e) { return fail(e?.message ?? String(e)); }
  push({ error: null }); surfaceNewOutcomes();
}
/** Defendant spends a Favor to drop a suit against them. */
export function favorDropSuitUI(jobId) {
  if (online && !myTurn()) return;
  try { game.favorDropSuit(jobId); } catch (e) { return fail(e?.message ?? String(e)); }
  push({ error: null }); surfaceNewOutcomes();
}

// --- Contract routing: the GC/PM decides who runs each trade (locals or the bank/county) ---------
function surfaceRouting() {
  push({ routingDecision: game.routingCases.length ? game.routingCases.map((p) => ({ ...p })) : null });
}
/** choices: { [trade]: "bank" } to decline that local sub/tender (else it routes to the local). */
export function decideRoutingUI(choices = {}) {
  if (online && !myTurn()) return;
  try { game.decideRouting(choices); } catch (e) { return fail(e?.message ?? String(e)); }
  surfaceNewOutcomes();
  surfaceRouting();
}

/** After any action that might end a player's options (here: just refresh / continue). */
function afterAct() {
  if (game.state.over) return; // shouldn't be here mid-turn
}

// --- Turn flow ---------------------------------------------------------------------------

export function endTurn() {
  if (iAmOut()) return; // you've folded — observer only
  if (online && !myTurn()) return; // online: only the active player resolves their own decisions
  if (game.estateCases.length) return fail("Settle the bank's estate claim first");
  if (game.state.pendingSettle.length) return fail("Answer the settlement offer first");
  if (game.state.pendingPoach.length) return fail("Answer the poaching offer first");
  if (game.state.pendingMayor.length) return fail("Answer the Mayor's drive first");
  if (game.unstaffedBoon.length) return fail(`Chief Boon's job must be assigned a worker first — drop everything`);
  if (game.referralCases.some((r) => r.contractor_id === game.state.players[game.state.activePlayerIndex].id)) return fail("Answer the referral offer first");
  if (game.state.pendingCourt.length) return fail("Resolve your court case first");
  if (game.state.pendingThreat) return fail("Resolve the response window first");
  if (game.routingCases.length) return fail("Decide who runs each trade on your contract first");
  const proceed = () => {
    const ender = game.state.players[game.state.activePlayerIndex]; // who is ending — read THEIR job progress
    const ctx = game.endTurn();
    if (ctx.reckoning) return enterReckoning(ctx.order);
    if (ctx.over) { surfaceNewOutcomes(); playSfx("chime", 0.5); playMusic("gala", 0.3); recordMyOutcome(); return push({ screen: "gala", ctx, final: finalReport() }); } // fire the bankruptcy/loan-call popup over the gala
    if ((game.state.humanIds ?? []).includes(ender.id) && ender.lastProgress?.length) // your jobs' begin → crew → jobsite card → end
      enqueuePopup({ kind: "jobreport", jobs: ender.lastProgress.map((r) => ({ ...r })) });
    if (online) { push({ aiActing: aiBanner() }); surfaceNewOutcomes(); maybeDriveAI(); surfaceDecisionsAfterReveal(); } // flush my turn; show the bot's "🤖 playing" banner if my turn handed off to an AI; host drives the next AI seats
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
    if (!ai[p.id]) {
      if (!p.bankrupt) break; // a solvent human is up — hand them their turn
      // A human folded at their own upkeep. Surface their 💀 once (closing it is the last act), then
      // advance PAST them — they're an observer now, never handed an interactive turn. If every human is
      // out, race to game-over with no further ceremony.
      const itsMe = !online || (mySeat >= 0 && game.state.players[mySeat]?.id === p.id);
      if (itsMe && !skipAI) { surfaceNewOutcomes(); await waitForPopups(); }
      if (humansAllOut()) skipAI = true;
      const c2 = game.endTurn();
      if (c2.reckoning) { push({ aiActing: null }); return enterReckoning(c2.order); }
      if (c2.over) { surfaceNewOutcomes(); playSfx("chime", 0.5); playMusic("gala", 0.3); recordMyOutcome(); return push({ aiActing: null, screen: "gala", ctx: c2, final: finalReport() }); }
      lastCtx = c2;
      continue;
    }
    if (!skipAI && humansAllOut()) { surfaceNewOutcomes(); skipAI = true; } // all humans folded mid-AI-loop → fast-forward
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
        enqueuePopup({ kind: "card", rival: p.name, cardId: d.cardId, art: d.art ?? null, name: d.name, flavor: d.flavor, text: d.text, routing: d.routing ?? null, ownContract: false });
        if (d.drawnCard) enqueuePopup({ kind: "card", rival: p.name, cardId: d.drawnCard.cardId, art: d.drawnCard.cardId, name: d.drawnCard.name, flavor: d.drawnCard.flavor, text: d.drawnCard.text }); // the drawn civil event, as its own card
      }
      await waitForPopups();
      if (game.state.over) return;
    } else {
      push({ aiActing: { name: p.name, drew, lines: [] }, court: null, settle: null, poach: null, mayor: null, referral: null });
      if (!skipAI) await sleep(450);
    }

    const before = game.state.log.length;
    if (game.settleCases.length) game.autoResolveSettle();
    if (game.estateCases.length) game.autoResolveEstate(); // a bot takes the bank's 50% on any estate claim
    if (game.courtCases.length) game.autoResolveCourt();
    if (game.damagesCases.length) game.autoResolveDamages();
    if (game.poachCases.length) game.autoResolvePoach();
    if (game.mayorCases.length) game.autoResolveMayor();
    if (game.referralCases.length) game.autoResolveReferral(online ? undefined : (cid) => !!ai[cid]); // online: no callback (must serialize for replay) → auto-resolves all; local: only AI shops
    const humanIds = new Set(game.state.players.filter((x) => !ai[x.id]).map((x) => x.id));
    try { botActions(game, ai[p.id], { humanIds, allowSueHumans: !online }); } catch { /* best effort */ }
    // A bot may have sued a human (local only) — that opens a response window the human must answer
    // before play continues. Surface the defense modal and PAUSE the loop until they respond.
    if (!online && game.state.pendingThreat) {
      const t = game.state.pendingThreat;
      const tid = t.type === "sabotage" ? t.ownerId : t.type === "damages" ? t.contractorId : t.debtorId;
      if (!ai[tid]) {
        playSfx("gavel", 0.5);
        push({ threat: viewThreat(t) });
        await new Promise((res) => { threatResolver = res; });
      }
    }
    const lines = game.state.log.slice(before).slice(-5); // this rival's moves this turn

    const ctx = game.endTurn();
    if (ctx.reckoning) { push({ aiActing: null }); return enterReckoning(ctx.order); }
    if (ctx.over) { surfaceNewOutcomes(); playSfx("chime", 0.5); playMusic("gala", 0.3); recordMyOutcome(); return push({ aiActing: null, screen: "gala", ctx, final: finalReport() }); } // fire the bankruptcy/loan-call popup over the gala
    push({ aiActing: { name: p.name, drew, lines } }); // recap + the updated table snapshot
    if (!skipAI) await sleep(800);
    lastCtx = ctx;
  }
  if (game.state.over) return;
  if (game.settleCases.length || game.courtCases.length || openDamages().length) playSfx("gavel", 0.5);
  // Online: the host has only been DRIVING the AI. The human now up runs their own turn — surface
  // their decisions on THEIR client (this one if it's the host's turn; otherwise the remote client
  // does it via syncFromRow). Stop here; no host-side turn-start ceremony for a remote player.
  if (online) { push({ aiActing: null }); surfaceNewOutcomes(); surfaceDecisionsAfterReveal(); return; } // surface what resolved during the rivals' round + your upkeep (e.g. a completed move-in) NOW, not on your next click
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
    estate: game.estateCases.length ? [...game.estateCases] : null,
    court: game.courtCases.length ? [...game.courtCases] : null,
    // damages claims are NOT force-surfaced anymore — they live in the Lawsuits panel (sue any turn)
    poach: game.poachCases.length ? [...game.poachCases] : null,
    mayor: game.mayorCases.length ? [...game.mayorCases] : null,
    referral: myReferrals.length ? myReferrals : null,
    routingDecision: game.routingCases.length ? game.routingCases.map((p) => ({ ...p })) : null,
  });
}

// STACK RULES online: a decision modal must never pop over a card you haven't read yet. Wait for the
// turn-start reveal queue (round card + your draws) to clear, THEN surface the decisions — matching
// the local path's `await waitForPopups()`. (surfaceTurnDecisions re-checks myTurn, so a turn that
// moved on while you were reading harmlessly no-ops.)
function surfaceDecisionsAfterReveal() { waitForPopups().then(surfaceTurnDecisions); }

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

/** Estate claim (a folded shop's lawsuit, now run by the bank/steward): take the 50% settlement. */
export function settleEstateUI(id) {
  if (online && !myTurn()) return; // online: only the active player resolves their own decisions
  try { game.settleEstateClaim(id); } catch (e) { return fail(e?.message ?? String(e)); }
  surfaceNewOutcomes();
  push({ estate: game.estateCases.length ? [...game.estateCases] : null });
}

/** Estate claim: refuse the 50% and let the court decide — roll the die, the full claim or nothing
 *  (plus a 1W fee either way). The bank doesn't mess around — it resolves immediately on your roll. */
export function refuseEstateUI(id) {
  if (online && !myTurn()) return; // online: only the active player resolves their own decisions
  const c = game.estateCases.find((x) => x.id === id);
  if (!c) return;
  push({ estate: null });
  openDice({
    title: `Estate court — ${c.jobName}`, noCancel: true,
    sub: c.owes ? `Refused ${c.settle} W — over 3 you pay the full ${c.value} W` : `Refused ${c.settle} W — over 3 you win the full ${c.value} W`,
    steps: [{ prompt: `Roll: does the claim stand?`,
      resolve: (v) => {
        const full = v > 3;
        if (c.owes) return full
          ? { text: `⚖️ Rolled ${v} — it stands. You pay the full ${c.value} W (+1 W fee).`, stop: true, tone: "bad" }
          : { text: `⚖️ Rolled ${v} — dismissed! You pay nothing (just the 1 W fee).`, stop: true, tone: "good" };
        return full
          ? { text: `⚖️ Rolled ${v} — you win the full ${c.value} W (−1 W fee).`, stop: true, tone: "good" }
          : { text: `⚖️ Rolled ${v} — dismissed. You get nothing (−1 W fee).`, stop: true, tone: "bad" };
      } }],
    onDone: ([roll]) => {
      try { game.courtEstateClaim(id, { roll }); } catch (e) { return fail(e?.message ?? String(e)); }
      surfaceNewOutcomes();
      push({ estate: game.estateCases.length ? [...game.estateCases] : null });
    },
  });
}

// --- The Final Reckoning (Last Licks) ----------------------------------------------------

let reckon = null; // { order, idx }

// Final Reckoning (Last Licks) — turn-based across clients. The engine's advanceReckoning steps to the
// next solvent HUMAN seat (recorded, so every client stays in lockstep, bots skipped); each seat's own
// client takes its licks and passes it on. Whoever hits year-end kicks off the first step; the others
// join via syncFromRow → resumeReckoning. (order arg is legacy — the order now lives in engine state.)
// Show the Last Licks intro once per game — on the client that hits year-end (enterReckoning) and on
// each client that syncs into it (resumeReckoning). enqueuePopup renders over the reckoning screen.
function showReckoningIntro() {
  if (reckIntroShown) return;
  reckIntroShown = true;
  enqueuePopup({ kind: "reckoning" });
}
function enterReckoning() {
  reckon = { active: true };
  showReckoningIntro();
  push({ screen: "reckoning", reckoning: reckon, aiActing: null });
  stepReckoning(); // advance to the first human seat
}

/** A client that SYNCED into an in-progress reckoning: switch to the screen, render the live seat (no
 *  advance — whoever's seat it is drives the stepping). */
function resumeReckoning() {
  flow("reckResume", { seat: mySeat, active: game?.state?.activePlayerIndex, reckIdx: game?.state?.reckoningIdx });
  reckon = { active: true };
  showReckoningIntro();
  push({ screen: "reckoning", reckoning: reckon, aiActing: null });
}

/** Step Last Licks to the next seat (recorded) — or close the books → the Gala. */
function stepReckoning() {
  flow("reckStep", { seat: mySeat, fromIdx: game?.state?.reckoningIdx, active: game?.state?.activePlayerIndex });
  try { game.advanceReckoning(); } catch (e) { flow("reckStepErr", { msg: e?.message ?? String(e) }); return fail(e?.message ?? String(e)); }
  if (game.state.over) { // every human's had their turn → books closed
    reckon = null;
    playSfx("chime", 0.5); playMusic("gala", 0.3); recordMyOutcome();
    return push({ screen: "gala", final: finalReport(), reckoning: null });
  }
  flow("reckStepped", { seat: mySeat, toIdx: game?.state?.reckoningIdx, active: game?.state?.activePlayerIndex });
  push({ reckoning: { active: true } }); // render the new active seat (push flushes the move online)
}

export function reckoningDone() {
  flow("reckDone", { seat: mySeat, active: game?.state?.activePlayerIndex, gatedNotMine: online && game.state.activePlayerIndex !== mySeat, threat: !!game?.state?.pendingThreat });
  if (online && game.state.activePlayerIndex !== mySeat) return; // only the seat taking licks passes it on
  if (game.state.pendingThreat) return fail("Resolve the response window first");
  stepReckoning();
}

export function restart() {
  game = null;
  declinedDamages.clear();
  if (online) { quitToMenu(); return; } // after an online game, go to the MAIN MENU (leave the room) — not the local "play this device" setup
  push({ screen: "setup", ctx: null, final: null, threat: null, picking: null, reckoning: null, aiActing: null, error: null, court: null, damages: null, settle: null, cardView: null });
}

// Dev-only debug hook for manual/automated testing in the browser console.
if (typeof window !== "undefined" && import.meta.env?.DEV) {
  window.__boty = {
    ui, getGame: () => game, refresh: () => push({}),
    info: () => ({ online, mySeat, myTurn: myTurn(), active: realGame?.state?.activePlayerIndex, phase: realGame?.state?.phase, reckIdx: realGame?.state?.reckoningIdx, order: realGame?.state?.reckoningOrder ?? null, players: realGame?.state?.players?.map((p) => ({ id: p.id, name: p.name })) ?? null, moves: log.length }),
  };
}

// Start reacting to the online room — registered LAST so every binding it touches is initialized
// (safe even when a hot-reload re-runs this module with an active game already in onlineGame).
subscribeOnlineRoom();
