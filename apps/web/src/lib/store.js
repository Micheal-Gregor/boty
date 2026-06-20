// The game controller — a thin seam between the Svelte UI and the engine. For M2 it runs the
// engine locally in the browser (LocalTransport); later a RemoteTransport will send the same
// intents to Supabase, and the UI won't change. AI seats are driven by the engine's own bots.

import { writable } from "svelte/store";
import { Game } from "@boty/engine";
import { botActions } from "@boty/engine/bots";
import { loadContent } from "./content.js";

const { economy, decks, flavor } = loadContent();

/** UI state. `rev` bumps on every change so Svelte re-renders off the live engine state. */
export const ui = writable({ screen: "setup", game: null, ctx: null, flavor, economy, error: null, rev: 0 });

let game = null;
let ai = {}; // playerId -> strategy string, or null for a human seat

function push(patch = {}) {
  ui.update((v) => ({ ...v, game, rev: v.rev + 1, error: null, ...patch }));
}

export const services = economy.services;
export const equipmentDefs = economy.equipment;

/** Start a new game. seats: [{ name, service, strategy|null }]. */
export function newGame(seats) {
  game = new Game(economy, seats.map((s) => ({ name: s.name, service: s.service })), {
    ...decks,
    seed: (Math.random() * 2 ** 32) >>> 0,
  });
  game.state.flavor = flavor;
  ai = {};
  game.state.players.forEach((p, i) => { ai[p.id] = seats[i].strategy ?? null; });
  const ctx = game.start();
  push({ screen: "board", ctx });
  autoPlayAI();
}

/** Run an engine action for the current (human) player, catching illegal moves. */
export function act(fn) {
  try {
    fn(game);
    push();
  } catch (e) {
    ui.update((v) => ({ ...v, rev: v.rev + 1, error: e?.message ?? String(e) }));
  }
}

/** End the current player's turn, then let any AI seats take theirs. */
export function endTurn() {
  const ctx = game.endTurn();
  finishOrContinue(ctx);
}

function finishOrContinue(ctx) {
  if (ctx.reckoning) {
    // M2: auto-settle the books (interactive Last Licks UI is a follow-up).
    const final = game.closeBooks();
    push({ screen: "gala", ctx, final });
    return;
  }
  if (ctx.over) {
    push({ screen: "gala", ctx, final: ctx });
    return;
  }
  push({ ctx });
  autoPlayAI();
}

/** While it's an AI seat's turn, play it and advance — until a human is up or the game ends. */
function autoPlayAI() {
  let lastCtx = null;
  let guard = 0;
  while (guard++ < 100) {
    const p = game.currentPlayer;
    if (game.state.over || !ai[p.id]) break; // human's turn (or done)
    if (game.state.players.every((x) => x.bankrupt)) break;
    try { botActions(game, ai[p.id]); } catch { /* bot plays best-effort */ }
    const ctx = game.endTurn();
    if (ctx.reckoning) { const final = game.closeBooks(); push({ screen: "gala", ctx, final }); return; }
    if (ctx.over) { push({ screen: "gala", ctx, final: ctx }); return; }
    lastCtx = ctx; // the next player's begin-turn ctx (with their fresh draw)
  }
  push(lastCtx ? { ctx: lastCtx } : {});
}

export function restart() {
  game = null;
  push({ screen: "setup", ctx: null, final: null });
}

export function isAI(playerId) { return !!ai[playerId]; }
