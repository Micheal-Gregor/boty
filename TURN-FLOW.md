# Turn & Round Flow — the spec we test against

*The canonical definition of how a turn and a round progress, for **solo** and **online**. The
point: instead of "I saw X happen, is that right?", we state what SHOULD happen, then assert it in
code (`packages/engine/test/flow.js` for the engine layer; the UI-surfacing rules below are the
checklist for the store layer). If behaviour and this doc disagree, one of them is a bug.*

---

## 1. The engine turn (one player's turn)

A turn runs five phases, in order (`turn.js` header; driven by `game.beginTurn` → actions →
`game.endTurn` → `game.advanceTurn`):

1. **Upkeep** (`runUpkeep`) — non-optional, charged the instant the turn begins:
   return crew whose time-out elapsed; tick theft escalation; collapse overdue projects; collect
   matured invoices (income *before* bills); process due payables; tick defects, modifiers
   (premiums), interest, expansion (the move-in cap), and any town levy; then charge overhead
   (rent + wages + rented gear). **If cash goes below zero here → the player is bankrupt** and is
   settled out (`settleBankruptcy`).
2. **Draw** (`drawFortune`) — the active player draws their fortune card(s) for the turn; the draw
   is stashed on `player.drewThisTurn` so a lockstep client can reveal it after replay.
3. **Actions** — the player's optional moves (hire, buy/rent, assign, pay, factor, fix, sue, play a
   hand card, start an expansion, etc.). Driven by the UI; each is a validated engine method that
   throws `GameError` on anything illegal.
4. **Job progress** (`runProgress` → `runJobProgress`) — every Active job burns its crew rate ± one
   jobsite card from the progress deck; jobs complete or expire. Runs when the player ends the turn.
5. **End / cleanup** (`endTurn` tail → `expireOverdue` → `advanceTurn`) — overdue in-play cards hit
   their hard deadline and leave play; then advance to the next player.

### Gating (these BLOCK ending the turn / running progress — they throw):
A turn cannot end while the active player has an **unresolved decision**: a pending settlement,
poach, Mayor drive, contract routing, court case, response window (`pendingThreat`), referral, or
Chief Boon's mandatory unstaffed job. The UI must surface these before `endTurn` is allowed.

---

## 2. The round (all players, once each)

- Play proceeds **clockwise from the lead-off seat**. `advance()` steps `roundPos`; **bankrupt
  players are skipped**.
- When `roundPos` wraps past the last seat, the **round ticks**: `turn` increments by **exactly
  one**, then `tickGlobals` (age out town-wide effects) and `tickCivics` (a civic build past
  deadline penalises the whole town) run **once**.
- With **rotate-first on**, the lead-off seat rotates one seat clockwise each round; off → seat 0
  always leads (legacy order, for stable tuning/tests).
- The game ends after round `max_turns` completes, or when **every** player is bankrupt.

### Invariants (asserted in `test/flow.js`):
1. Across one round, **every non-bankrupt player acts exactly once** before the round ticks.
2. The `turn` counter increments **exactly once per completed round** — never twice, never zero.
3. A **bankrupt** player is never handed a turn.
4. With a pending decision set, `endTurn` / `runProgress` **throw** (the gate holds).
5. Replaying the recorded move list reproduces the **identical** state (lockstep determinism — also
   covered by `test/replay.js`).

---

### Year-end: the Final Reckoning (a distinct sub-phase)
When a round ticks **past** `max_turns`, the game does **not** go straight to over (unless everyone is
bankrupt). `advanceTurn` opens the **Final Reckoning** (`phase = "reckoning"`): a last "Last Licks"
window where solvent players (trailing player first) empty their hands — Rush / Buy Time / Factor /
Pay / Sabotage / Sue only. This sub-phase is driven by `seatReckoning(playerId)` per player and ended
by `closeBooks()` (collect all receivables, crown the most cash, `phase = "done"`, `over = true`).
**It is NOT driven by `endTurn`** — calling `endTurn` during the reckoning re-triggers the year-end and
spins the turn counter. The UI (and `test/flow.js`) must branch on the `{ reckoning: true }` result and
hand off to the reckoning flow. (This exact spin is what `test/flow.js` guards against.)

---

## 3. Online surfacing (per client) — the UI layer

Online, the engine is replayed from a shared move list; each client then *surfaces* what changed.
These are the rules the store must obey (the round-card loop was rule **S1** being violated):

- **S1 — the round card fires once per (game, round).** When the round ticks to turn *T*, every
  client shows the round/townfolk card exactly once. A **reconnect, rebuild, or no-op sync must NOT
  re-fire** it. (Guard: `lastRoundShown`; set *after* replay so a mid-game rebuild starts "past"
  the current round — see `buildOnlineGame`.)
- **S2 — fortune reveals fire once per (turn, seat).** The active player's draw is shown once;
  guarded by `lastTurnStartKey`. A rival's reveal is attributed ("👤 X drew:") and honours the
  rival-pop-up filter.
- **S3 — outcomes scan only NEW log lines.** `surfaceNewOutcomes` advances `lastScanned`; a rebuild
  mid-game sets `lastScanned = log.length` so history is **not** re-surfaced.
- **S4 — only the active player writes moves.** Writes are serialized; the host drives AI seats and
  persists each; a non-host never writes out of turn (RLS + `act()` gate input).
- **S5 — sounds play on popup *display*, never on the log scan** (so a skipped card is silent and
  nothing piles up at round end — see the audio overhaul).
- **S6 — a sync with no new moves changes nothing surfaced** (no duplicate cards, no re-fire).

### How to test the online layer
The engine layer (§1–§2) is unit-tested directly. The surfacing layer (§3) is validated by
*simulating the sync*: build a game, generate a move list, then feed it to a second "client" in
chunks (as Realtime would) and assert S1–S6 — e.g. the round card is enqueued exactly `rounds`
times total, never more, even when the same row is delivered twice. (Store-level harness; the pure
round-tick detection it relies on is the same `turn`-increment asserted in `test/flow.js`.)
