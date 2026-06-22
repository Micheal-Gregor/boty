// The game controller — a thin seam between the Svelte UI and the engine. For M2 it runs the
// engine locally in the browser (LocalTransport); later a RemoteTransport will send the same
// intents to Supabase, and the UI won't change. AI seats are driven by the engine's own bots.

import { writable } from "svelte/store";
import { Game, profitAndLoss, balanceSheet, recurringExpenses, seasonFor, workerProductivity, findEquipment } from "@boty/engine";
import { botActions } from "@boty/engine/bots";
import { loadContent } from "./content.js";
import { unlockAudio, playSfx } from "./sound.js";

const { economy, decks, flavor } = loadContent();
const AI_DELAY = 650; // ms between AI seats, so you can watch the table move
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** UI state. `view` is a fresh plain-data snapshot of the engine state on every change — the
 * engine mutates its objects in place, so the UI must read a new-reference snapshot or Svelte
 * won't see the change. `rev` bumps on every change. */
export const ui = writable({
  screen: "setup", game: null, view: null, ctx: null, flavor, economy, error: null, rev: 0,
  aiActing: null, threat: null, picking: null, reckoning: null, final: null, court: null, damages: null, settle: null,
  cardView: null, popups: [], settingsOpen: false,
});

// --- The pop-up QUEUE (E5 §2): modals shown one at a time, in order, easy close/next. ----------
let lastRoundShown = 0;
function enqueuePopup(p) { ui.update((v) => ({ ...v, rev: v.rev + 1, popups: [...v.popups, p] })); }
export function dismissPopup() { ui.update((v) => ({ ...v, rev: v.rev + 1, popups: v.popups.slice(1) })); }
export function clearPopups() { ui.update((v) => ({ ...v, rev: v.rev + 1, popups: [] })); }
export function openSettings() { push({ settingsOpen: true }); }
export function closeSettings() { push({ settingsOpen: false }); }

/** Front of the round flow: a round-intro (once per round) then this player's exec summary. */
function enqueueTurnStart(ctx) {
  if (!ctx || ctx.over || ctx.reckoning) return;
  const view = viewOf();
  const me = view.players[view.activePlayerIndex];
  if (isAI(me.id)) return; // rivals' turn-start summaries arrive with the watchable-AI work (Phase 4)
  if (ctx.turn > lastRoundShown) {
    lastRoundShown = ctx.turn;
    enqueuePopup({ kind: "round", turn: ctx.turn, season: view.season, town: flavor?.town });
  }
  enqueuePopup({ kind: "summary", name: me.name, recurring: view.recurring, cash: me.cash, upkeepNet: ctx.upkeepNet ?? 0, drew: (ctx.drawn ?? []).length });
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
  return {
    turn: s.turn, activePlayerIndex: s.activePlayerIndex, over: s.over, phase: s.phase,
    log: s.log.slice(-8),
    deckLeft: s.deck?.pile?.length ?? 0,
    globalEffects: (s.globalEffects ?? []).map((e) => ({ ...e })), // town-wide conditions (the global cards)
    projects: (s.projects ?? []).map((p) => ({ ...p, phases: p.phases.map((ph) => ({ ...ph })) })), // phased story-projects in flight
    pnl: profitAndLoss(s.players[s.activePlayerIndex]), // the active player's books so far
    bs: balanceSheet(s.players[s.activePlayerIndex]),
    recurring: recurringExpenses(s, s.players[s.activePlayerIndex]), // the turn-start exec summary
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

function push(patch = {}) {
  ui.update((v) => ({ ...v, game, view: viewOf(), rev: v.rev + 1, ...patch }));
}
function fail(msg) { ui.update((v) => ({ ...v, rev: v.rev + 1, error: msg })); }

export const services = economy.services;
export const isAI = (playerId) => !!ai[playerId];
const player = (id) => game.state.players.find((p) => p.id === id);
const handHas = (p, type) => p.hand.some((c) => c.type === type);

/** Start a new game. seats: [{ name, service, strategy|null }]. */
export function newGame(seats) {
  unlockAudio(); // the Start click is our user gesture — lets the browser make sound
  game = new Game(economy, seats.map((s) => ({ name: s.name, service: s.service })), {
    ...decks,
    seed: (Math.random() * 2 ** 32) >>> 0,
  });
  game.state.flavor = flavor;
  ai = {};
  declinedDamages.clear();
  game.state.players.forEach((p, i) => { ai[p.id] = seats[i].strategy ?? null; });
  const ctx = game.start();
  push({ screen: "board", ctx, error: null, aiActing: null, threat: null, picking: null, reckoning: null, final: null, court: null });
  advanceUntilHuman(ctx);
}

/** Run an engine action for the current (human) player, catching illegal moves. */
export function act(fn) {
  if (game && ai[game.currentPlayer.id]) return; // a rival is acting — ignore stray human input
  try { fn(game); playSfx("click", 0.3); push({ error: null }); }
  catch (e) { fail(e?.message ?? String(e)); }
}

// --- Threats (Sabotage / Sue) + the response window --------------------------------------

export function startPick(type) { push({ picking: type, error: null }); }
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
  try { game.playFavor(targetId, modId); playSfx("gavel", 0.4); } catch (e) { return fail(e?.message ?? String(e)); }
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

/** The human target responds via the modal. */
export function respond(decision) {
  try { game.respondToThreat(decision); } catch (e) { return fail(e?.message ?? String(e)); }
  push({ threat: null, error: null });
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
  if (game.state.pendingSettle.length) return fail("Answer the settlement offer first");
  if (game.state.pendingCourt.length) return fail("Resolve your court case first");
  if (game.state.pendingThreat) return fail("Resolve the response window first");
  const ctx = game.endTurn();
  if (ctx.reckoning) return enterReckoning(ctx.order);
  if (ctx.over) { playSfx("chime", 0.5); return push({ screen: "gala", ctx, final: ctx }); }
  advanceUntilHuman(ctx);
}

/** A failed Demand Roll summons you to court. AI seats auto-defend; a human gets the modal. */
export function resolveCourtUI(payableId, lawyer) {
  try { game.resolveCourt(payableId, { lawyer }); } catch (e) { return fail(e?.message ?? String(e)); }
  push({ court: game.courtCases.length ? [...game.courtCases] : null });
}

let skipAI = false;
/** Fast-forward the rest of the AI phase (the "Skip ▶▶" button). */
export function skipAITurns() { skipAI = true; }

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
    const drew = (lastCtx?.drawn ?? []).map((d) => d.name); // what the deck just dealt this rival
    push({ aiActing: { name: p.name, drew, lines: [] }, court: null, settle: null });
    if (!skipAI) await sleep(450);

    const before = game.state.log.length;
    if (game.settleCases.length) game.autoResolveSettle();
    if (game.courtCases.length) game.autoResolveCourt();
    if (game.damagesCases.length) game.autoResolveDamages();
    const humanIds = new Set(game.state.players.filter((x) => !ai[x.id]).map((x) => x.id));
    try { botActions(game, ai[p.id], { humanIds }); } catch { /* best effort */ }
    const lines = game.state.log.slice(before).slice(-5); // this rival's moves this turn

    const ctx = game.endTurn();
    if (ctx.reckoning) { push({ aiActing: null }); return enterReckoning(ctx.order); }
    if (ctx.over) { playSfx("chime", 0.5); return push({ aiActing: null, screen: "gala", ctx, final: ctx }); }
    push({ aiActing: { name: p.name, drew, lines } }); // recap + the updated table snapshot
    if (!skipAI) await sleep(800);
    lastCtx = ctx;
  }
  if (game.state.over) return;
  if (game.settleCases.length || game.courtCases.length || openDamages().length) playSfx("gavel", 0.5);
  enqueueTurnStart(lastCtx); // the human is up — round intro + their executive summary
  push({
    aiActing: null, ctx: lastCtx, error: null,
    settle: game.settleCases.length ? [...game.settleCases] : null,
    court: game.courtCases.length ? [...game.courtCases] : null,
    damages: openDamages().length ? openDamages() : null,
  });
}

/** Accept or decline a natural-6 settlement offer. */
export function resolveSettleUI(payableId, accept) {
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
    const final = game.closeBooks();
    reckon = null;
    playSfx("chime", 0.5);
    return push({ screen: "gala", final, reckoning: null });
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
