// Live game state factories. State is plain serializable data — the engine reads and
// mutates it, the UI renders it. Stage 1 covered the shop & economy; Stage 2 adds jobs and
// invoices. Fields for payables and hands are reserved here so later stages can fill them in
// without reshaping the player object.

import { Deck, makeRng } from "../engine/deck.js";
import { makeDie } from "../engine/dice.js";

let nextId = 1;
const genId = (prefix) => `${prefix}${nextId++}`;

/** Reset the id counter — used by tests for deterministic ids. */
export function resetIds() {
  nextId = 1;
}

/**
 * Create a fresh tradesperson. In Stage 1 they only cost wages; assignment to jobs
 * arrives in Stage 2.
 */
export function createTradesman() {
  return { id: genId("T"), assignedJob: null };
}

/**
 * Create an equipment instance owned or rented by a player. `defId` references an
 * equipment definition in economy.json.
 */
export function createEquipment(defId, { owned }) {
  return { id: genId("E"), defId, owned };
}

/**
 * Instantiate a live job from a job card (template). The deadline is stored as an absolute
 * turn number — the clock "ticks" by the round counter advancing, in every state.
 */
export function createJob(card, currentTurn) {
  return {
    id: genId("J"),
    card: card.id,
    name: card.name,
    value: card.value,
    work_amount: card.work_amount,
    work_done: 0,
    deadline_turn: currentTurn + card.deadline,
    min_tradesmen: card.min_tradesmen,
    max_tradesmen: card.max_tradesmen,
    required_equipment: card.required_equipment ?? null,
    // To START: your building's tier must be ≥ this (a big job needs a bigger shop).
    required_building_tier: card.required_building_tier ?? 1,
    // To go Active: you must own/rent at least one tool PER assigned tradesperson (gear up
    // the whole crew), on top of any required_equipment type gate.
    equipment_per_tradesman: card.equipment_per_tradesman ?? false,
    droppable: card.droppable,
    // Player-to-player "deposit now, we'll see about the rest" jobs. forced_target (the client
    // player id) is assigned at draw; deposit is paid up front and is what the client recovers
    // if the contractor abandons the job.
    forced_target: null,
    deposit: card.forced?.deposit ?? 0,
    state: "Queued", // Queued | Active | OnHold | Expired | Complete
    assigned_tradesmen: [],
    exposed: false, // set when a STARTED job expires late (matters in later stages)
  };
}

/**
 * An invoice created when a job completes. Collects (pays cash) at due_turn during upkeep.
 * For a forced job the client already advanced the deposit, so only the rest is invoiced.
 */
export function createInvoice(job, currentTurn, terms) {
  return {
    id: genId("I"),
    amount: job.value - (job.deposit ?? 0),
    source_job: job.id,
    due_turn: currentTurn + terms,
    factored: false,
  };
}

/**
 * A payable (AP) — a bill the player owes. NPC payables go through the escalating Demand Roll
 * when stretched; player payables (owed to another player) open a 4-turn sue window when late.
 */
export function createPayable({ vendor, amount, dueTurn, isNpc, creditorId = null }) {
  return {
    id: genId("AP"),
    vendor,
    is_npc: isNpc,
    creditor_id: creditorId, // player id for player-vs-player payables
    amount,
    due_turn: dueTurn,
    turns_dodged: 0,
    sue_window_remaining: null, // set to economy.sue_window when a player payable goes late
    settled: false,
  };
}

/** Create a player in the identical starting state every player shares. */
export function createPlayer(economy, { name, service }) {
  const tradesmen = [];
  for (let i = 0; i < economy.starting_tradesmen; i++) tradesmen.push(createTradesman());

  return {
    id: genId("P"),
    name,
    service,
    cash: economy.starting_cash,
    bankrupt: false,
    building: economy.starting_building,
    tradesmen,
    equipment: [],

    // Reserved for later stages (kept empty in Stage 1).
    hand: [],
    jobs: [],
    payables: [],
    invoices: [],
  };
}

/**
 * Build the initial game state for a set of players.
 * @param economy loaded economy data
 * @param playerSeeds [{ name, service }]
 * @param options {
 *   fortune?: card[],      // the shared Fortune draw pile (jobs/windfalls/shocks/gifts)
 *   jobprogress?: card[],  // drawn against active jobs in phase 4
 *   civil?: card[],        // Civil deck; hand:true cards feed the gift hand-pile
 *   jobCards?: card[],     // legacy (Stage 1/2 tests): a job-only Fortune deck
 *   seed?: number          // fixes all three shuffles for deterministic tests
 * }
 * Each deck uses its own seeded RNG (seed, seed+1, seed+2) so they shuffle independently and
 * draws from one deck don't perturb another's order. Omitted decks are simply empty.
 */
export function createGame(economy, playerSeeds, options = {}) {
  if (!Array.isArray(playerSeeds) || playerSeeds.length < 1 || playerSeeds.length > 6) {
    throw new Error("Order to Cash supports 1–6 players");
  }
  const seed = options.seed;
  const fortuneCards = options.fortune ?? (options.jobCards ?? []).map((c) => ({ type: "job", ...c }));
  const civilHand = (options.civil ?? []).filter((c) => c.hand);

  return {
    economy,
    players: playerSeeds.map((seed) => createPlayer(economy, seed)),
    deck: new Deck(fortuneCards, makeRng(seed)),
    progressDeck: new Deck(options.jobprogress ?? [], makeRng(seed === undefined ? undefined : seed + 1)),
    civilHandDeck: new Deck(civilHand, makeRng(seed === undefined ? undefined : seed + 2)),
    civilEventDeck: new Deck((options.civil ?? []).filter((c) => !c.hand), makeRng(seed === undefined ? undefined : seed + 4)),
    die: makeDie(makeRng(seed === undefined ? undefined : seed + 3)),
    pendingThreat: null, // active response window, if any
    turn: 1, // 1-based round counter; game ends after round === max_turns completes
    activePlayerIndex: 0,
    over: false,
    log: [],
  };
}
