# Order to Cash

A turn-based business board game for **1–6 players**, one-laptop hotseat. The program is the
banker, rules-lawyer, and ledger — it enforces rules and timers; humans make every decision.

**The object:** be named **Business of the Year** by the local Better Business Bureau — have
the most cash when the simulated fiscal year ends. Run out of cash mid-year and you're out.

**Time:** a round ≈ 3 weeks; **4 rounds = a season**, **16 rounds (`max_turns`) = the fiscal
year** (Spring → Summer → Fall → Winter), with the award gala at the close of Winter. The
season is *derived* from `turn / max_turns`, so it scales if you retune the year. Set in the
fictional town of **Maple Hollow** ([data/flavor.json](data/flavor.json)) — the season banner
and ceremony are pure immersion and have **no mechanical effect** on jobs or the decks.

**The Final Reckoning (year-end).** When round 16 closes, the books don't just stop — there's
a **lightning round of litigation** before the gala, run **trailing-player-first** (the leader
defends last). Players empty their hands by every means: **Rush** to finish a job on the wire
(a clutch completion now pays), **Sabotage** to bury a rival's unfinished job (a buried *forced*
job hands its client a suable deposit debt), **Sue** to collect. Then the books close: **all
receivables collect in full** (NPC customers always pay), but **AP is never force-settled** —
stiffing a vendor and outrunning the clock is a legitimate play, balanced by rivals litigating
against *you*. Win = the most **cash**; unpaid debts don't subtract.

**The world.** Friendly on the surface, cutthroat underneath. Every card carries `flavor`
text (also mechanically inert) telling small-town stories with a recurring cast: the
**Pettigrew brothers** (your rivals), cheapskate **Old Man Hettrick**, **Mayor Crabtree**,
**Dot's Diner** as the gossip hub, and the old **Hollis mill**. Jobs, windfalls, shocks,
lawsuits, sabotage, even job-progress draws are written as beats in the rivalry. Edit any of
it in the `data/*.json` files.

- **Seasonal flavor:** weather/seasonal cards carry a `flavor_by_season` map (bad weather is a
  spring mudbath, a summer thunderstorm, a fall cold-snap, or a winter blizzard), picked by the
  current season at draw — purely cosmetic, falls back to the base `flavor`.
- **Rivalry arcs:** the player-vs-player resolutions read like an escalating feud, naming the
  actual rivals ("*so-and-so quietly works against so-and-so's job — a word to the inspector, a
  bolt left loose*"; "*hauls them before the Maple Hollow BBB*").

### Parked ideas (noted, not built)

- **Winter bites** — let the season touch *mechanics*, not just flavor (e.g. more
  weather shocks late in the year). Deliberately left cosmetic for now.
- **Holidays** — holiday time-off for tradespeople (reduced capacity/wages those rounds) and
  holiday events with a mini-game whose winner takes extra cards or cash.
- **Draw-power decoupling** — the remaining structural lever for Dial 3 if equipment-gating
  ever proves insufficient (let equipment/building size contribute to draw power).
- **Auto-debt on undelivered forced jobs at the buzzer** — currently a late, un-expired,
  un-sabotaged forced job lets the contractor keep the deposit ("stiffing is a strategy").

See the spec docs: [01-design-doc.md](01-design-doc.md), [02-starter-spec.md](02-starter-spec.md),
[03-reference-sheet.md](03-reference-sheet.md).

## Status

### Stage 1 — Shop & economy skeleton ✅

> **Goal: you can run a shop into the ground.**

- Players with identical starting state (cash, smallest building, one tradesperson).
- The turn loop with a fixed `max_turns`, highest cash wins.
- **Upkeep** charges rent + wages + rented-equipment fees; a player who can't cover overhead
  goes **bankrupt** (the failure state).
- **Actions:** hire/fire (sign-on / severance), buy/rent/dispose/cancel equipment, relocate
  (costs the whole turn, respects building capacity).
- The engine **refuses illegal moves**. All prices come from [`data/economy.json`](data/economy.json).

### Stage 2 — Job queue + the late rule ✅ (the heart)

> **Goal: the triage loop feels tense.**

- Full turn structure: **upkeep → draw → actions → job progress → end**.
- **Job state machine:** Queued → Active → OnHold → (Active | Expired | Complete).
- **Draw power** = number of tradespeople, capped (`draw_cap`); jobs come from
  [`data/jobs.json`](data/jobs.json) (~6 hand-made cards).
- **Assign** free tradespeople (one job at a time); a job goes Active at min staff + required
  gear. **Burn** = equipment speed allocated best-first across your crew (`base_hand_speed`
  for the toolless). **Hold** frees the crew; **drop** walks away (droppable jobs only).
- **The deadline clock always ticks**, in every state. **Queue-expiry = no penalty** (you
  just don't get paid). A *started* job that blows its deadline expires **exposed** and pays
  nothing — *a late job pays nothing*.
- **Complete on time → invoice (AR)**, which collects as cash `invoice_terms` turns later.
- Equipment **gates** big jobs; multi-tradesperson jobs finish faster.

> **A bump made in Stage 2:** `starting_cash` 20 → 40, so the shop survives the start-up
> rounds before the first invoice collects. It's a tuning dial in `economy.json`.

### Stage 3 — The three decks as data ✅

> **Goal: famine is structural, not just bad luck.**

- **Fortune deck** ([`data/fortune.json`](data/fortune.json)) — the shared, seasonal source of
  everything that happens to you. Fixed ~40-card composition (Dial 1: jobs ~50%, windfalls
  ~20%, shocks ~20%, gifts ~10%), **drawn without reshuffle until exhausted** so a run of
  shocks becomes a real season you can roughly card-count. Each draw resolves at once: jobs
  enter your queue, windfalls pay cash, shocks hit cash, **gifts** deal you a Civil hand card.
- **Job-progress deck** ([`data/jobprogress.json`](data/jobprogress.json)) — one card drawn
  against each Active job each turn (Dial 4: neutral ~40% / positive ~25% / negative ~25% /
  decisive ~10%). Effects adjust work, pay, cost, or deadline; **decisive** cards auto-complete
  or auto-fail a job. Jobs now feel dramatic.
- **Civil deck** ([`data/civil.json`](data/civil.json)) — authored as data: the hand/counter
  cards (Sabotage, Rush, Buy Time, Slick Lawyer) that Fortune gifts deal into hands, plus the
  event cards (lawsuit, audit, back taxes, beauty pageant, and the single **Class Action**).
- **Draw-power scaling** — you draw `min(tradespeople, draw_cap)` Fortune cards: a bigger shop
  sees more opportunity *and* more chaos.

`copies` in each deck file is expanded by the loader, so the fixed composition is authored
compactly and re-tuned in one place.

### Stage 4 — Resolvers + hand/counter ✅ (the litigation metagame)

> **Goal: the table litigates constantly; float is a real gamble.**

- **The response window** (built once, reused): an attacker plays a card naming a target, the
  engine announces it and checks the target's hand for legal counters, the target reacts, then
  it resolves. Drives **Sabotage→Rush** and **Sue→Slick-Lawyer**.
- **The d6 civil resolver** (Dial 5): defendant wins on `roll ≥ target`; modifiers shift the
  target — Slick Lawyer +2, late/botched +1, own lawyer −1. Deposit/match pot; winner takes it.
- **NPC Demand Roll → Court** (Dial 6): each turn a due NPC payable is dodged, an escalating
  roll (2+/3+/4+/5+); 1st-dodge natural 6 settles at 50%, final-dodge natural 6 forgives; a
  fail goes to **court** at a penalised target — win walks clean (AP wiped, fee reimbursed),
  lose pays amount + fee.
- **Player sue window**: a late player-payable opens a 4-turn window; the creditor `sue`s
  within it (civil resolver, Slick Lawyer applies) or the debt is **forgiven** unsued.
- **AR factoring** (`factor`): cash an invoice now, minus the 10% fee.
- **Hand cards** now play: **Sabotage** (shrink a job's deadline), **Rush** (burn extra
  work / counter Sabotage), **Buy Time** (extend any job/AP/AR deadline), **Slick Lawyer**
  (civil-roll modifier). **Class Action** force-settles every player's AP at once.
- NPC payables arrive from Fortune **vendor-bill** cards; **summons** cards draw a Civil event
  (audit, back taxes, lawsuit, beauty pageant, or the lone Class Action).

All dice are seeded, so litigation is fully reproducible in tests.

**Forced player-to-player jobs.** A `forced` job (the `subcontract` card) is commissioned by a
*client* — the richest other solvent player. The client pays a **deposit** to the contractor
up front; on completion the contractor invoices only the rest. If the contractor abandons it
(expiry or decisive failure), the client gets a **suable player-payable** for the deposit —
this is what gives the "deposit now, we'll see about the rest" job its teeth, routed through
the same sue window. With no other player at the table it falls back to a plain NPC job.

### Stage 5 — Tune (the harness) ✅

> **Goal: read the five dials and re-tune the data — no engine changes.**

`npm run tune [games] [players]` simulates many seeded games with a heuristic auto-player
([tools/bot.js](tools/bot.js)) and reports the metrics that map to each dial — bankruptcy
rate, winner cash, cash spread, job success rate, shocks drawn, forced-job disputes — under
both opening policies (equipment vs. 2nd hire), then prints a read against the reference
sheet's tuning guide. All randomness is seeded, so runs are reproducible.

**A tuning pass was run** (data only — no engine changes). The first read showed the economy
on the brink: ~100% bankruptcy, winner cash near zero, because small jobs barely cleared the
wages + rent + collection delay to produce them. Three guided changes followed the dials:

- **Dials 1–2:** raised job values (small 5→7/4→5, mid 6→9/9→12, big 14→18/16→20) and sped
  cash flow (`invoice_terms` 2→1).
- **Dial 3:** made tools cheaper (basic 6→4, pro 10→9), keeping the reference speeds (2/3).

Then a **parallel income stream** was added: windfalls grew from 6 to 9 cards with higher,
splashier values (beauty pageant 5→8, "win the county fair raffle" +9, etc.). The point —
windfalls are *throughput-independent* cash, so they bolster cash flow and create a growth arc
**without** making the job-grind itself easy, and famine (shocks + vendor bills) still keeps
shops desperate enough to gamble on stretching AP.

Result (open:2nd-hire): solo bankruptcy ~75% → ~9% with winners near break-even; at 2–4
players winners now end **above** the 40 W start (52 / 61 W) — a real growth arc — while the
equipment opening and shock seasons still bankrupt 28–73%, so ruin stays on the table.

**Count-scaling cards (a structural attempt at Dial 3).** To make the equipment-vs-hire choice
a real one, the deck carries cards whose cash scales with your *build*: equipment is rewarded
net-positive (`File a patent` / `efficiency award` pay `+2 per equipment`; a depreciation audit
docks `−1`), while headcount is taxed net-negative (a birthday party gives `+1 per employee`,
profit-sharing docks `−3`, and a retirement churns a worker). These tax the over-hiring leader
and reward the equipment specialist.

**What the harness proved about them.** `npm run tune` runs an equipment-specialist vs
labor-shop duel, with and without these cards. On their own the cards only nudged the
specialist (≈12% → ≈16%); the real fix was structural and came from the job deck itself ↓.

### Equipment-gated jobs + shop-tier gates (what actually balanced Dial 3)

- **~50% of jobs require equipment to START** (`required_equipment`). With tools gating half
  the work, the equipment investment becomes essential rather than optional — and the labor
  shop's headcount-draw edge is neutralised because a toolless crew can only take the small
  ungated jobs.
- **Big jobs require a bigger shop** (`required_building_tier`): tier 2 = Shop+, tier 3 =
  Warehouse. (Buildings are tiered garage 1 / shop 2 / warehouse 3; fielding 5 crew needs the
  tier-3 warehouse, since the shop caps at 4.)
- **The endgame combo** — the Office-tower fit-out: tier-3 shop **and** a tool for every
  tradesperson (`equipment_per_tradesman`) **and** ≥3 crew, with a long deadline and a 35 W
  payout. The reward for building the whole engine.

**Result (200-game duel):** the equipment specialist now wins **52%** vs the labor shop —
`npm run tune` reports **Dial 3 balanced (45–55%) ✓**, robust with or without the count-scaling
cards. The build choice is finally live. Common gating made the early game harsher (the
expected cost — you must tool up before half the work opens), eased back with `starting_cash`
40→48 and richer ungated small jobs. Current harness reads: solo survives ~64%, 4-player is
cutthroat (~1.5 of 4 bankrupt), job success ~45%.

> These numbers are a bot-driven baseline (greedy auto-play); a careful human survives more.
> Re-run `npm run tune` after any data edit to see the dials move.

## Run it

```bash
npm start              # interactive terminal hotseat
npm run smoke          # Stage 1 proof (shop & economy)
node test/stage2.js    # Stage 2 proof (job queue + late rule)
node test/stage3.js    # Stage 3 proof (the three decks)
node test/stage4.js    # Stage 4 proof (resolvers + hand cards)
npm test               # all four stage proofs
npm run tune           # Stage 5 tuning harness (simulate games, read the dials)
```

Requires Node 18+ (developed on Node 24).

### Playing a turn

The engine ticks deadlines, collects due invoices, charges overhead, then deals you job
cards. You then type commands until you `end`:

```
shop:  hire | fire [Tid] | buy <basic/pro> | rent <basic/pro> | dispose <Eid> | cancel <Eid> | move <garage/shop/warehouse>
jobs:  assign <Jid> [Tid] | hold <Jid> | drop <Jid>
cards: factor <Iid> | pay <APid> | rush <Jid> | buytime <id> | sabotage <Jid> | sue <Pid> <APid> [lawyer]
end
```

`Tid` / `Eid` / `Jid` / `Iid` / `APid` / `Pid` are the ids shown on the open ledger (e.g.
`T1`, `E4`, `J3`, `I2`, `AP6`, `P2`). Sabotage and Sue open a response window that prompts the
targeted player to react.

## Architecture

A hard line between **engine** (rules, enforced in code) and **content** (data files you
re-tune after every playtest without touching code).

```
data/economy.json      the W-denominated price list + starting state (Dial 2)
data/fortune.json      the Fortune deck — jobs/windfalls/shocks/gifts (Dial 1)
data/jobprogress.json  the job-progress deck (Dial 4)
data/civil.json        the Civil deck — hand/counter cards + events (Dials 5/6)
data/flavor.json       cosmetic immersion — town, seasons, the Business of the Year award
src/state/state.js     live game state factories (player, job, invoice, equipment, decks, game)
src/engine/economy.js  loads/validates content; deck loaders (copies expansion); lookups; GameError
src/engine/deck.js     shuffle/draw pile + seeded PRNG (deterministic tests)
src/engine/dice.js     seeded d6
src/engine/shop.js     the shop actions (hire/fire/equipment/relocate)
src/engine/fortune.js  Fortune draw resolution (job/windfall/shock/gift/payable/summons)
src/engine/jobs.js     the job state machine: assign/hold/drop, burn, job-progress, expiry, invoices
src/engine/litigation.js  pure civil/court/demand-roll math (targets + rolls)
src/engine/payables.js  AP lifecycle: factoring, demand roll→court, sue window, class action, civil events
src/engine/cards.js    hand-card helpers + Sabotage/Rush/Buy-Time effects
src/engine/turn.js     upkeep (incl. AP processing), turn advancement, bankruptcy, results
src/engine/game.js     orchestrator — the single API the UI talks to (incl. response window)
src/ui/render.js       open-books ledger rendering (read-only)
src/ui/cli.js          terminal hotseat input/output
index.js               entry point
test/smoke.js          Stage 1 proof
test/stage2.js         Stage 2 proof
test/stage3.js         Stage 3 proof
test/stage4.js         Stage 4 proof (incl. forced player-to-player jobs)
tools/bot.js           heuristic auto-player for the harness (not part of the game)
tools/tune.js          Stage 5 tuning harness — simulate games, report the dials
```

Everything is priced in **W** (wage-turns): 1 W = one tradesperson's wage for one turn. The
five tuning dials live in `data/`, never in engine code.
