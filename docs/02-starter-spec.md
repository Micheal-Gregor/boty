# Order to Cash — Starter Spec & Build Order

*For Claude Code. Target: one-laptop hotseat, 4–6 players. The engine enforces rules; humans
make decisions. Build the loop before writing the full decks.*

## Architecture principle

Keep a hard line between **engine** (rules, turn flow, state machine, dice, ledger,
response window — enforced in code) and **content** (decks and economy numbers — plain data
files you can re-tune after every playtest without touching code). All five tuning dials
(see reference sheet) live in config/data, never hardcoded.

Suggested layout:

```
/engine        turn loop, shop economy, job state machine, resolvers
/data          economy.json, fortune.json, jobprogress.json, civil.json, services.json
/state         live game state (players, ledger, decks, hands)
/ui            hotseat prompts (terminal or single-screen web)
```

## Core data model

**Player:** id, name, service (role), cash, debt, building, tradespeople[], equipment[],
hand[], jobs[] (their queue), payables[], invoices[].

**Job:** id, value, work_amount, work_done, deadline_turn, min_tradesmen, max_tradesmen,
required_equipment (optional), droppable (bool), forced_target (optional), state
(Queued|Active|OnHold|Expired|Complete), assigned_tradesmen[].

**Payable:** id, vendor, is_npc (bool), amount, due_turn, turns_dodged (int),
sue_window_remaining (int, player payables only), settled (bool).
**Invoice:** id, amount, source_job, factored (bool).
**Card:** id, deck, type, text, effects[], targets ("self" | "any_job" | "any_player" | …),
counterable_by[] (e.g. Sabotage counterable_by ["Rush"]).

**Tradesman:** id, assigned_job (or null). **Equipment:** id, tier, speed, owned|rented,
gates[] (job types it unlocks).

**Services (roles):** mechanic, plumber, electrician, pipefitter, welder, HVAC technician.
**Starting state (all players identical):** starting_cash, smallest building, one tradesman,
then the opening choice — buy equipment OR hire a 2nd tradesperson.

## Turn structure

For each player, in order:

1. **Upkeep** — pay building rent, wages, rented-equipment fees; mature payables (mark due);
   advance all deadline clocks (every job in every state); expire jobs past deadline that
   aren't complete (queue-expiry = no penalty; started-but-late = flagged exposed).
2. **Draw** — draw `cards_per_turn` (= tradespeople, capped — see reference sheet).
3. **Actions** (any order, until done): hire/fire, buy/rent/dispose/cancel equipment,
   relocate (costs the turn), assign/hold/resume/drop jobs, factor invoices, pay/stretch
   payables, play cards. Forced transactions from cards execute through the engine.
4. **Job progress** — for each Active job, burn work = sum of assigned tradesmen × equipment
   speed; draw job-progress card(s) as the rules dictate; complete jobs that finish on time
   → create invoice.
5. **End** — pass to next player. When the last player of round `max_turns` finishes,
   **game ends**: highest cash wins (config `max_turns`, e.g. 12–20).

Reactive cards (counters) can fire **out of turn** via the response window.

## The response window (build once, reused)

Both Sabotage→Rush and Sue→Slick-Lawyer use it:

1. Attacker plays a card naming a target (job or player).
2. Engine announces the threat to the table and checks the target's hand for legal counters.
3. Target chooses: play a counter, or let it land.
4. Engine resolves (apply effects, or run the dice).

## Dice resolvers

**Civil:** complainant posts deposit; defendant must match or lose by default. Compute target
number from merits + card modifiers (each ±1). Roll d6, compare, award pot. (Baseline 2+;
Slick Lawyer pushes to 4+; late/botched +1 to target; own lawyer −1.)

**Job-progress:** apply the drawn card's modifier to work/cost/pay/deadline, or resolve
decisive success/failure.

**NPC Demand Roll → Court (escalating):** each turn an NPC payable is dodged, increment
`turns_dodged` and roll d6 vs. target {1:2+, 2:3+, 3:4+, 4:5+}. Pass → dodged again. Turn-1
natural 6 → 50% settlement offer. Turn-5 natural 6 → forgive. **Fail → court:** post amount
owed + damages fee (≈1 W), then run the **standard civil resolver** at a penalized defense
target (weak case). Win → walk clean (AP wiped, fee reimbursed; cost is purely social). Lose →
pay full amount to bank + fee. All targets/fees from `economy.json`.

**Player sue window:** late player payable sets `sue_window_remaining = 4`; decrement each
turn. Creditor may sue any turn (merit-based civil resolver, Slick Lawyer modifiers apply). At
0 unsued → debt forgiven.

**Class Action (Civil card):** when drawn, force-settle every player's AP at full value
immediately. One copy in the deck.

---

## Build order (prove each stage before the next)

### Stage 1 — Shop & economy skeleton
Players, cash, turn loop, upkeep (rent + wages + equipment fees). Hire/fire with
sign-on/severance. Buy/rent/dispose/cancel equipment. Relocate (costs a turn). **Goal: you
can run a shop into the ground.** No jobs yet. Pull all prices from `economy.json`.

### Stage 2 — Job queue + the late rule (the heart)
Job state machine (Queued→Active→OnHold→Expired→Complete), assign tradespeople, burn work by
equipment speed, deadline clock always ticking, queue-expiry = no penalty, late-start =
exposed, complete = invoice. Multi-tradesman / equipment-gated jobs. Hand-make ~6 job cards.
**Goal: the triage loop feels tense with real players.**

### Stage 3 — The three decks as data
Move jobs into `fortune.json`; add `jobprogress.json` and `civil.json` with a few cards each.
Implement draw-power scaling and the feast/famine deck composition (fixed deck, draw without
reshuffle until exhausted — see reference sheet).

### Stage 4 — Resolvers + hand/counter
The response window; the two d6 resolutions; AR factoring (10%); AP stretch + exposure; the
any-job targeting cards (Sabotage / Rush / Buy Time) and Slick Lawyer.

### Stage 5 — Tune
Play real games; adjust the five dials in the data files. No engine changes expected here.

## Decisions already locked
- Tradespeople work one job at a time. One-laptop hotseat. Open books (all visible).
- Deadline clock always ticks, in every job state.
- Queue-expiry: no penalty. Late start: exposed, not auto-failed; Rush buys time back.
- Sabotage: rare, costly, counterable by Rush. Players hold hands and play reactively.
- Buy Time: universal deadline extender (job / AP / AR / other players), +1–2 turns.
- Some jobs droppable (free walk-away), forced/sticky jobs are not.
- Six starting trades; all players start identical, then choose equipment vs. 2nd tradesperson.
- NPC non-payment = escalating Demand Roll (2+/3+/4+/5+, turn-1 six = 50% settle, turn-5 six =
  forgiven). **Fail → court:** post owed + damages fee, second civil roll at penalized target;
  win walks clean (AP wiped, fee reimbursed — cost is purely social), lose pays full to bank + fee.
- Player non-payment = 4-turn sue window; expires unsued → debt forgiven.
- Class Action card (1 copy) force-settles all AP at full value. NPC-expired jobs: no penalty.
  Abandoned player-to-player jobs: wronged party may sue.
- Game runs a fixed number of turns (config `max_turns`); highest cash at the end wins.
