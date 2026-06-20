// Terminal hotseat UI (Stage 1). One laptop, players take turns. The UI prompts whose turn
// it is and what is legal; the engine makes every enforcement decision. This is deliberately
// thin — all rules live behind Game.
//
// Input is driven off readline's line async-iterator rather than question(), so the same code
// works for an interactive TTY and for piped/scripted input, and a clean EOF just ends the
// session instead of throwing.

import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

import { GameError } from "../engine/economy.js";
import { loadEconomy, loadDecks, loadFlavor } from "../engine/content-fs.js";
import { Game } from "../engine/game.js";
import { renderTable, renderResults, renderPlayer, seasonFor } from "./render.js";

export async function runCli() {
  const rl = createInterface({ input: stdin, output: stdout });
  const lines = rl[Symbol.asyncIterator]();
  // Prompt the user and return the next line, or null at end-of-input.
  const ask = async (prompt) => {
    stdout.write(prompt);
    const { value, done } = await lines.next();
    return done ? null : value;
  };

  const economy = await loadEconomy();
  const decks = await loadDecks();
  const flavor = await loadFlavor();
  try {
    const title = flavor ? `ORDER TO CASH — ${flavor.town}` : "ORDER TO CASH";
    console.log(`\n=== ${title} ===`);
    if (flavor) console.log(`A fiscal year for the ${flavor.award}, judged by the ${flavor.bureau}.\n`);
    const seeds = await setupPlayers(ask, economy);
    if (!seeds) return; // EOF during setup
    const game = new Game(economy, seeds, decks);
    game.state.flavor = flavor; // cosmetic only

    let lastSeason = -1;
    let final = null;
    let ctx = game.start();
    while (!final) {
      if (ctx === null) return; // EOF mid-game — quit cleanly
      if (ctx.over) { final = ctx; break; }
      if (ctx.reckoning) {
        if ((await runReckoning(ask, game, ctx.order)) === null) return;
        final = game.closeBooks();
        for (const line of final.lines) console.log("  " + line);
        break;
      }
      const s = seasonFor(game.state);
      if (s.index !== lastSeason) { console.log("\n" + (flavor?.season_intros?.[s.name] ?? `— ${s.name} —`)); lastSeason = s.index; }
      ctx = await playTurn(ask, game, ctx);
    }
    console.log(renderResults(final.results, flavor));
  } finally {
    rl.close();
  }
}

/** The Final Reckoning — the lightning round of litigation, trailing player first. */
async function runReckoning(ask, game, order) {
  const flavor = game.state.flavor;
  console.log("\n" + "═".repeat(48));
  console.log(flavor ? `🏆 The ${flavor.award} gala is here — LAST LICKS!` : "FINAL RECKONING — LAST LICKS");
  console.log("Empty your hands: finish jobs, bury a rival's, collect what you're owed.");
  const names = order.map((id) => game.state.players.find((p) => p.id === id).name);
  console.log(`Order (trailing first): ${names.join(" → ")}\n`);

  for (const pid of order) {
    const p = game.seatReckoning(pid);
    console.log(renderPlayer(game.state, p, { active: true }));
    while (true) {
      console.log(`\n${p.name}'s last licks: rush <Jid> | sabotage <Jid> | buytime <id> | sue <Pid> <APid> [lawyer] | pay <APid> | factor <Iid> | done`);
      const input = await ask("> ");
      if (input === null) return null; // EOF
      const t = input.trim();
      if (t === "" || t === "done" || t === "end" || t === "e") break;
      try {
        console.log("  ✓ " + dispatch(game, t));
        if (game.state.pendingThreat) await resolvePendingThreat(ask, game);
        console.log(renderPlayer(game.state, game.currentPlayer, { active: true }));
      } catch (err) {
        if (err instanceof GameError) console.log("  ✗ " + err.message);
        else throw err;
      }
    }
  }
  return true;
}

async function setupPlayers(ask, economy) {
  let count = 0;
  while (count < 1 || count > 6) {
    const ans = await ask("How many players? (1–6): ");
    if (ans === null) return null;
    count = parseInt(ans, 10);
  }
  const services = economy.services;
  const seeds = [];
  for (let i = 0; i < count; i++) {
    const nameRaw = await ask(`Player ${i + 1} name: `);
    if (nameRaw === null) return null;
    const name = nameRaw.trim() || `Player ${i + 1}`;
    console.log(`  Trades: ${services.map((s, j) => `${j + 1}=${s}`).join("  ")}`);
    let svc = "";
    while (!svc) {
      const pick = await ask("  Choose a trade #: ");
      if (pick === null) return null;
      svc = services[parseInt(pick, 10) - 1];
    }
    seeds.push({ name, service: svc });
  }
  return seeds;
}

async function playTurn(ask, game, ctx) {
  console.log("\n" + renderTable(game.state));
  for (const line of ctx.upkeep.lines) console.log("  " + line);
  if (ctx.drawn?.length) {
    console.log(`  Fortune (drew ${ctx.drawn.length}):`);
    for (const d of ctx.drawn) {
      if (d.flavor) console.log(`    • ${d.name} — “${d.flavor}”`);
      else console.log(`    • ${d.name}`);
      console.log(`        ${d.text}`);
    }
  }

  if (!ctx.canAct) {
    console.log(`  (${ctx.player.name} skips — bankrupt.)`);
    return game.endTurn();
  }

  // Action phase: loop until the player ends the turn (or relocate forces the end).
  while (true) {
    console.log(`\n${ctx.player.name}'s actions. ${menu(game.state.economy)}`);
    const input = await ask("> ");
    if (input === null) return null; // EOF
    const trimmed = input.trim();
    if (trimmed === "" || trimmed === "end" || trimmed === "e") break;

    try {
      const msg = dispatch(game, trimmed);
      console.log("  ✓ " + msg);
      if (game.state.pendingThreat) await resolvePendingThreat(ask, game);
      console.log(renderPlayer(game.state, game.currentPlayer, { active: true }));
      if (game.currentPlayer.relocatedThisTurn) {
        console.log("  (Turn ends — relocating took the whole turn.)");
        break;
      }
    } catch (err) {
      if (err instanceof GameError) console.log("  ✗ " + err.message);
      else throw err;
    }
  }

  // Phase 4 — job progress, shown as the player's turn wraps up.
  const progress = game.runProgress();
  for (const line of progress) console.log("  " + line);
  return game.advanceTurn();
}

/** Drive the response window: prompt the threatened player (a different human) to react. */
async function resolvePendingThreat(ask, game) {
  const t = game.state.pendingThreat;
  const byId = (id) => game.state.players.find((p) => p.id === id);
  try {
    if (t.type === "sabotage") {
      const owner = byId(t.ownerId);
      const ans = (await ask(`  ↪ ${owner.name} is sabotaged — type 'rush' to counter (needs Rush), or Enter to let it land: `)) ?? "";
      console.log("  " + game.respondToThreat({ counter: ans.trim().toLowerCase() === "rush" }));
    } else {
      const debtor = byId(t.debtorId);
      const ans = (await ask(`  ↪ ${debtor.name} is sued — 'contest' (add 'lawyer' for Slick Lawyer), or Enter to concede: `)) ?? "";
      const parts = ans.trim().toLowerCase().split(/\s+/);
      console.log("  " + game.respondToThreat({ contest: parts[0] === "contest", ownLawyer: parts.includes("lawyer") }));
    }
  } catch (err) {
    if (!(err instanceof GameError)) throw err;
    console.log("  ✗ " + err.message + " — defaulting (no counter).");
    game.respondToThreat(t.type === "sabotage" ? {} : { contest: false });
  }
}

function menu(economy) {
  const equip = economy.equipment.map((e) => e.id).join("/");
  const blds = economy.buildings.map((b) => b.id).join("/");
  return [
    "\n  shop: hire | fire [Tid] | buy <" + equip + "> | rent <" + equip + "> | dispose <Eid> | cancel <Eid> | move <" + blds + ">",
    "  jobs: assign <Jid> [Tid] | hold <Jid> | drop <Jid>",
    "  cards: factor <Iid> | pay <APid> | rush <Jid> | buytime <id> | sabotage <Jid> | sue <Pid> <APid> [lawyer]",
    "  end",
  ].join("\n");
}

function dispatch(game, input) {
  const [cmd, arg, arg2] = input.split(/\s+/);
  switch (cmd.toLowerCase()) {
    case "hire": return game.hire();
    case "fire": return game.fire(arg);
    case "buy": return game.buyEquipment(arg);
    case "rent": return game.rentEquipment(arg);
    case "dispose": return game.disposeEquipment(arg);
    case "cancel": return game.cancelRental(arg);
    case "move": return game.relocate(arg);
    case "assign": return game.assignJob(arg, arg2);
    case "hold": return game.holdJob(arg);
    case "drop": return game.dropJob(arg);
    case "factor": return game.factorInvoice(arg);
    case "pay": return game.payPayable(arg);
    case "rush": return game.playRush(arg);
    case "buytime": return game.playBuyTime(arg);
    case "sabotage": return game.playSabotage(arg);
    case "sue": return game.sue(arg, arg2, { slick: /\blawyer\b/.test(input) }).message;
    default: throw new GameError(`Unknown command "${cmd}". Type a command from the menu, or "end".`);
  }
}
