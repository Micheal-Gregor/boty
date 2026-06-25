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
  // prod_mod: per-worker productivity from performance reviews (−1 / 0 / +1).
  // flag: grounds to fire WITH cause ("theft" | "poor_review"), or null.
  return { id: genId("T"), assignedJob: null, prod_mod: 0, flag: null };
}

/**
 * Create an equipment instance owned or rented by a player. `defId` references an
 * equipment definition in economy.json.
 */
export function createEquipment(defId, { owned }) {
  return { id: genId("E"), defId, owned, assigned_to: null }; // assigned_to = a tradesman id (model A)
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
    // Payment terms: turns until the invoice collects after completion (longer terms pay more).
    // null → the economy default (invoice_terms).
    terms: card.terms ?? null,
    // To START: your building's tier must be ≥ this (a big job needs a bigger shop).
    required_building_tier: card.required_building_tier ?? 1,
    // To go Active: you must own/rent at least one tool PER assigned tradesperson (gear up
    // the whole crew), on top of any required_equipment type gate.
    equipment_per_tradesman: card.equipment_per_tradesman ?? false,
    droppable: card.droppable,
    // Trade-routed (player-to-player) jobs. A job that needs a trade the drawer lacks routes to
    // the player who HAS that trade (the contractor); hirer_id is the player who drew it and
    // owes the contract value on completion. required_trade is the gating trade.
    required_trade: card.required_trade ?? null,
    hirer_id: null,
    // Subcontract job: you broker it. A rival running `sub_trade` does the work for `sub_cost`;
    // you bill the customer `value` (a markup baked in) and pocket the spread (or factor to break
    // even). When brokered, hirer_id is set to YOU (the GC) and the sub holds the job.
    subcontract: card.subcontract ?? false,
    sub_trade: card.sub_trade ?? null,
    sub_cost: card.sub_cost ?? 0,
    // Civic ("political") jobs: deliver it and the Mayor owes favours (favor_reward to the lead, a
    // cut to the sub); let it collapse and global_penalty grips the whole town.
    political: card.political ?? false,
    favor_reward: card.favor_reward ?? 0,
    global_penalty: card.global_penalty ?? null,
    project_id: card.project_id ?? null, // a phase of a larger phased project (projects.js)
    state: "Queued", // Queued | Active | OnHold | Expired | Complete
    assigned_tradesmen: [],
    exposed: false, // set when a STARTED job expires late (matters in later stages)
  };
}

/**
 * A live code-violation / defect on a player's shop. Until fixed it charges `fine` each upkeep
 * and saps `productivity_hit` work from your jobs. Fixing it (fixDefect) clears it now and books
 * the `fix_cost` as a payable due `fix_terms` later — routed to a tradesperson if `fix_trade` is
 * set and someone at the table has it (their AR), else an NPC permit/materials bill.
 */
export function createDefect(card, currentTurn) {
  return {
    id: genId("D"),
    card: card.id,
    name: card.name,
    since_turn: currentTurn,
    fine: card.fine ?? 1,
    fix_cost: card.fix_cost ?? 5,
    fix_trade: card.fix_trade ?? null,
    fix_terms: card.fix_terms ?? 2,
    productivity_hit: card.productivity_hit ?? 1,
  };
}

/** An invoice created when a (non-routed) job completes; collects at due_turn during upkeep. */
export function createInvoice(job, currentTurn, terms) {
  return {
    id: genId("I"),
    amount: job.value,
    source_job: job.id,
    due_turn: currentTurn + terms,
    factored: false,
  };
}

/**
 * A payable (AP) — a bill the player owes. NPC payables go through the escalating Demand Roll
 * when stretched; player payables (owed to another player) open a 4-turn sue window when late.
 */
export function createPayable({ vendor, amount, dueTurn, isNpc, creditorId = null, jobId = null, pending = false }) {
  return {
    id: genId("AP"),
    vendor,
    is_npc: isNpc,
    creditor_id: creditorId, // player id for player-vs-player payables
    job_id: jobId, // the routed job this AP pays for (player payables)
    pending, // a routed-job AP sits pending until the job completes (then it comes due)
    amount,
    due_turn: dueTurn,
    turns_dodged: 0,
    sue_window_remaining: null, // set to economy.sue_window when a player payable goes late
    settled: false,
    collections: false, // true once sold to a collections agency (factored player debt)
    agency_lawyer: false, // collections brings a guaranteed slick lawyer to court
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
    capacityBonus: 0, // capitalised leasehold improvements add capacity (lost on relocate)
    pendingExpansion: null, // a deferred capital project (readying a move / capacity bump) in flight
    bbbThisTurn: false, // a BBB Special drawn this turn unlocks buying services/improvements
    tradesmen,
    equipment: [],

    // Reserved for later stages (kept empty in Stage 1).
    hand: [],
    jobs: [],
    payables: [],
    invoices: [],
    defects: [], // unfixed code violations — fine + productivity drag until repaired
    modifiers: [], // persistent world cards in play (insurance, marketing, …)
    // The general ledger — every transaction posts here (WORLD.md). Opens with the owner's capital.
    ledger: [
      { turn: 1, memo: "Opening capital", lines: [
        { acct: 1000, amt: economy.starting_cash },
        { acct: 3000, amt: -economy.starting_cash },
      ] },
    ],
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

  // The living deck (Stage: per-player decks): everyone starts with a copy of the same Fortune
  // composition but plays their OWN deck, so mini-game outcomes can inject/remove cards from one
  // player's deck (poach, Hettrick) or all of them (union). Player 0 keeps seed `seed` so existing
  // single-player tests/replays draw identically.
  const players = playerSeeds.map((s) => createPlayer(economy, s));
  players.forEach((p, i) => {
    p.deck = new Deck(fortuneCards, makeRng(seed === undefined ? undefined : seed + i));
  });

  return {
    economy,
    players,
    cardPool: fortuneCards, // the master Fortune composition — the source for living-deck injections
    deckEvents: [], // queued inject/remove descriptors for the UI shuffle reveal (drained each turn)
    progressDeck: new Deck(options.jobprogress ?? [], makeRng(seed === undefined ? undefined : seed + 1)),
    civilHandDeck: new Deck(civilHand, makeRng(seed === undefined ? undefined : seed + 2)),
    civilEventDeck: new Deck((options.civil ?? []).filter((c) => !c.hand), makeRng(seed === undefined ? undefined : seed + 4)),
    die: makeDie(makeRng(seed === undefined ? undefined : seed + 3)),
    pendingThreat: null, // active response window, if any
    pendingCourt: [], // NPC court cases awaiting the defendant's lawyer decision
    pendingDamages: [], // botched routed jobs the hirer may sue over (damages → the bank)
    pendingSettle: [], // natural-6 settlement offers awaiting accept/decline
    pendingPoach: [], // a rival is luring a worker — counter-offer (+roll) or let them go
    pendingMayor: [], // the Mayor's re-election drive — buy a Favor (10W) or pass
    globalEffects: [], // town-wide conditions (levies/booms) from civic jobs — the global card layer
    projects: [], // phased story-projects in flight (deposit + phases + balance) — projects.js
    turn: 1, // 1-based round counter; game ends after round === max_turns completes
    activePlayerIndex: 0,
    over: false,
    log: [],
  };
}
