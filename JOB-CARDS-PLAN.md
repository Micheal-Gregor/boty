# Job cards + the living deck — how it works today

**Status: BUILT.** This was a proposal once; the engine has since shipped most of it and evolved past the rest. This doc now describes the job-card system **as it actually runs**, file by file, so it can be trusted as the reference. Provisional *numbers* are still being feel-tuned in play, but the *mechanics* below are live.

**Unchanged subsystems (not covered here):** crew events, inspector/defects, bills & payables, shocks, windfalls, specials (BBB, networking, perf review, courthouse, tool theft, union), the two card tweaks (poached, re-election). Those work as the older plan described and live in their own modules. This doc is about **jobs and the work that comes player-to-player**: the job ladder, NPC word-of-mouth, referrals, subcontracts, GC routed contracts, PM incident tenders, civic contracts, the move-in fit-out, and the per-turn job-progress deck.

Source of truth: `packages/engine/src/engine/` (`fortune.js`, `jobs.js`, `routed.js`, `incidents.js`, `civics.js`, `expansion.js`, `livingdeck.js`, `game.js`) and the data in `packages/engine/data/` (`economy.json`, `fortune.json`, `jobprogress.json`).

---

# Part A — The living deck

The deck's **composition is the difficulty knob**, and it changes as you play. Your choices bend your own probabilities — keep the cast happy and good work flows in; neglect them and the work dries up. Implemented in `livingdeck.js` (inject/remove + reshuffle) and triggered from `jobs.js` / `game.js`.

### A1 · Per-player decks ✅ LIVE
- Each player plays **their own deck** (`player.deck`); `drawFortune` in `fortune.js` reads `player.deck ?? state.deck`.
- An injection/pull targets **your deck** (`injectById` / `pullJobs` / `removeMatching`) or **all decks** (`injectAllById`, e.g. the union drive).
- Every reshape pushes a `deckEvent` so the UI can animate the cards moving and play the shuffle.

### A2 · Difficulty tiers ✅ LIVE — they shape the deck two ways
At setup you pick a tier (`economy.json` → `difficulty`, `difficulty_tiers`). A tier sets:
- **(a) the word-of-mouth fire chance** — each WOM trigger rolls a d6 and fires on `≤` the tier's threshold for that NPC (`womFires` in `livingdeck.js`).
- **(b) the starting cash runway** (`cash_mod`) and **(c) the severity of cash shocks** (`shock_mult`, applied in `fortune.js cashEffect` — losses only; gains are untouched).

Current tier values (provisional, in `economy.json`):

| | Steady | Standard | Cutthroat |
|---|--------|----------|-----------|
| **Dot helps (d6 ≤)** | **6** (almost always) | 4 | **2** (rarely) |
| **Hettrick bites (d6 ≤)** | **2** (rarely) | 4 | **6** (almost always) |
| **Lundgren bites (d6 ≤)** | **2** | 4 | **6** |
| **cash_mod** (starting runway) | +26 | 0 | −12 |
| **shock_mult** (loss severity) | 0.2 | 1.0 | 1.2 |

> The cutthroat irony still holds: the cheapskate Hettrick won't pay (net-90) yet his bad word bites almost every time you put him off, draining your job pile, while Dot's good word almost never lands to refill it.

> **Note vs. the old plan:** the original v3 imagined per-tier *starting deck mixes* and a long table of percentage triggers. What actually shipped is simpler: **one fixed Fortune composition** (see Part B0), tuned by the **d6 word-of-mouth thresholds** above plus the cash/shock multipliers. The "% chance per mini-game" table from v3 is **not built** — the only probabilistic deck triggers today are Dot/Hettrick/Lundgren word-of-mouth.

### A3 · The word-of-mouth triggers (what's actually wired)
| Trigger | Where | Effect | Whose deck |
|---|---|---|---|
| **Complete a Dot job** | `jobs.js completeJob` | on a `womFires("dot")` success, **inject +`dot_referral_jobs` (=3) `j2` cards** | yours |
| **Ignore a Hettrick/Lundgren job** the round it's drawn | `game.js endTurn` | if drawn this turn, unstaffed, and `womFires` for that NPC, **pull `bad_wom_pull` (=2) plain job cards** | yours |
| **Union drive** | `globals.js` via `injectAllById` | seeds a union card into **everyone's** deck | all |
| **Mayor re-election / favors** | `livingdeck.js inject` | seeds `networking_lunch` / favor cards | yours |

"Ignore" is precise: the bad-word pull only fires for a Hettrick/Lundgren card **drawn this turn and left with no worker assigned by end of turn** (`drawn_turn === turn && assigned_tradesmen.length === 0`), checked **once** (`wom_done` guard).

### A4 · The shuffle animation ✅
Each `deckEvent` carries the add/remove count and a reason string so the UI can flash the incoming/outgoing cards and play the reshuffle. Built in the web layer (CSS/sprite).

---

# Part B — Job families

## B0 · The Fortune deck composition
The Fortune deck (`fortune.json`) is a **fixed composition drawn without reshuffle until exhausted**, so a run of shocks is a real "season" you can roughly card-count. Draw power = your tradesperson count, capped at `draw_cap` (4) — a bigger shop sees more opportunity AND more chaos. Cards resolve immediately by type in `fortune.js resolveCard`. The job-bearing types are: `job` (the j1–j6 ladder + the NPC cast), `referral`, `routed`, `incident`, `civic`. (`project` exists as a type but is **dead** — see Part F.)

## B1 · Standard jobs — the 6-size ladder
One card per size (`j1`–`j6`); `tailorJob` in `fortune.js` skins it to **the drawer's trade** on draw, so every trade sees the identical ladder. Stats come from `economy.json job_sizes`. These are always **your own** job — no routing.

| Size | Crew (max) | Value (W) | Work | Deadline | Terms | Gates |
|------|-----------|-----------|------|----------|-------|-------|
| **J1 — Service call** | 1 | 8 | 3 | 4 | net-30 | — |
| **J2 — Standard job** | 2 | 13 | 4 | 4 | net-30 | — |
| **J3 — Tooled job** | 2 | 16 | 5 | 5 | net-30 | **basic tools** |
| **J4 — Pro job** | 3 | 24 | 7 | 5 | net-60 | **pro rig** |
| **J5 — Major job** | 4 | 36 | 10 | 6 | net-90 | **pro rig + tier-2 Shop + a tool per worker** |
| **J6 — Marquee job** | 4 | 58 | 13 | 6 | net-90 | **pro rig + tier-3 Warehouse + a tool per worker** |

Gating is enforced in `jobs.js`:
- **Equipment type** and **building tier** are hard start-gates (`meetsHardGates`) — checked on `assign`; fail and you can't put a crew on it.
- **`gear_all`** (J5/J6) requires **a tool assigned to every worker on the job** (`hasToolPerWorker`, model A). Short a tool and the job sits **OnHold** with a hint from `whyNotReady`.

Per-trade names come from `JOB_LADDER` in `fortune.js`:

| Size | Mechanic | Plumber | Electrician | Pipefitter | Welder | HVAC |
|------|----------|---------|-------------|------------|--------|------|
| J1 | Brake job | Clogged drain | Fixture swap | Fitting repair | Railing weld | A/C service |
| J2 | Tune-up | Water heater | Panel upgrade | Steam-line patch | Gate & fence | Furnace swap |
| J3 | Transmission | Section re-pipe | Room rewire | Process pipe | Structural repair | Ductwork run |
| J4 | Engine rebuild | Main-line dig | Service upgrade | Boiler job | Custom fab | Rooftop unit |
| J5 | Fleet contract | Building plumbing | Building wiring | Plant piping | Structural steel | Building HVAC |
| J6 | Restoration shop | Commercial system | Commercial electrical | Industrial system | Industrial fab | Commercial system |

Art keys (`jobArt`): J1→`job/walkin/1p`, J2→`job/walkin/2p`, J3→`job/walkin/2p_basic`, J4–J6→`job/<size>/<trade>`.

## B2 · NPC jobs — four characters, the word-of-mouth engine
Each is one card (`job` with an `npc` tag); `tailorNpcJob` skins the work + flavor **per trade** (`NPC_JOB_SKINS`) and stats come from `economy.json npc_jobs`. Hettrick & Lundgren are the bad-word-of-mouth twins; Dot is the good-word-of-mouth counter; Boon is mandatory.

| NPC | Crew | Value | Work | Deadline | Terms | Twist |
|-----|------|-------|------|----------|-------|-------|
| **Old Man Hettrick** | 2 | 16 | 5 | 5 | **net-90** | Leave it unworked the round you draw it → on a `womFires` roll his bad word **pulls 2 jobs** from your deck. Droppable. |
| **Mrs. Lundgren** | 2 | 16 | 5 | 5 | **net-90** | Same bad-word pull as Hettrick. Droppable. |
| **Dot** | 2 | 14 | 4 | 4 | net-30 | **Complete** it → on a `womFires("dot")` roll her good word **injects +3 `j2` jobs**. Droppable. The counter to the twins. |
| **Chief Boon** | 2 | 14 | 3 | **8** | net-30 | **Mandatory** — `droppable: false`, so it can't be dropped OR sold. Long deadline; the game nags you (`unstaffedBoon`) until someone's on it. |

Per-trade skins (the work) from `NPC_JOB_SKINS`:

| NPC | Mechanic | Plumber | Electrician | Pipefitter | Welder | HVAC |
|-----|----------|---------|-------------|------------|--------|------|
| **Hettrick** | his old truck | his busted radiator | his shorting wiring | his broken furnace | his broken gate | his dead window unit |
| **Lundgren** | her car won't start | her scalding water tank | her flickering wiring | her cold bedroom radiator | her shed door | her too-cold AC |
| **Dot** | the diner delivery truck | the flooded storefront | the breakfast blackout | the kitchen steam table | the diner's chairs & tables | the broken cooler |
| **Boon** | crash-car inspection | Dot's Diner flood response | the fire-station alarm | the school sprinkler reset | the fire-truck ladder | the fire-station HVAC |

Art key: `job/<npc>/<trade>`.

## B3 · Player-to-player routing — the AR/AP web
Several job sources move work **between players** and create the inter-player debt/credit web. Routing always uses `pickContractor`/`pickSub`: a solvent rival who runs the needed trade **with spare capacity** — a shop carries **one routed job per crew member** (`routedHeld < max(1, tradesmen)`), so a bigger crew takes on more contracts but overcommitting risks botches.

**A botch makes the hirer the plaintiff.** If a routed/subbed contractor blows a portion (deadline or a decisive-failure progress card), `botchRoutedJob` (in `jobs.js`) clears the hirer's liability and queues a **damages suit** the hirer can bring against the no-show (recovered to the hirer, capped at what the contractor can pay) within the `sue_window`. PMs and movers get the same suit (see B6, B7, Part E).

### B3a · Required-trade referrals — a finder's commission
Two paths, both in `fortune.js`:
- A **`referral` card** (`referral_1p/2p/3p`): a job that isn't your trade walks in. The engine rolls a **uniform** random eligible trade (rerolling a 6 to avoid mod-bias), then offers it to a `pickContractor`. The contractor **accepts next round** (does it as their own job; you collect the fee) or **refuses** (you get nothing). **No shop with that trade at the table → the county takes it and the bank pays your fee automatically.** Pending offers live in `state.pendingReferral`; you can't end your turn with one unanswered.
- A **`required_trade` job** (a normal job card carrying a trade you lack): `resolveCard` refers the lead to a `pickContractor`, pays you a **finder's commission** immediately (`floor(value × sell_rate)` → `OTHER_INCOME`), and the contractor does it as **their own NPC-paid job** (no inter-player debt — `hirer_id` stays null).

Finder's fee / commission = the job's **sell price** (`value × sell_rate`, `sell_rate` = 0.15).

### B3b · Subcontract jobs — the GC markup on one trade
A `job` card flagged `subcontract` with a `sub_trade` you don't run: `resolveCard` routes it to a sub (`pickContractor`). You become the GC:
- The **sub holds the job** (`hirer_id = you`) and does the work for `sub_cost`.
- **You hold the AP** that pays them (a pending payable, `creditorId = sub`, `jobId`).
- On delivery you **bill the customer the full `value`** (Dr AR / Cr Revenue) and **pocket the markup** (`value − sub_cost`); the sub's AP comes due net of terms.
- If the sub botches: `botchRoutedJob` voids your AP and lets you sue them for the **lost markup** (`value − sub_cost`).

*(Note: there are currently no `subcontract`-flagged single-trade job cards in `fortune.json` — this path exists in the engine but isn't seeded in the live deck today. The multi-trade GC contract below is the shipped form of GC work.)*

## B4 · GC routed contracts — the general-contractor squeeze (`routed.js`)
A **`routed` card** is a **3-trade client contract** the drawer takes on as GC. Six are in the deck (`rt_townhall`, `rt_depot`, `rt_school`, `rt_library`, `rt_firehouse`, `rt_community`), each naming three `required_trades`, `sub_value` 6, `markup` 2, deadline 5.

- For each required trade: if **you run it**, you take that portion yourself (a `routed_id` job in your queue, no client invoice of its own); if a **local sub** runs it, you route it as an owed sub-job (you hold the AP, net-30 from delivery); if **no local trade**, the **bank covers it** (you get the `sub_value` but **no markup** on that portion).
- A **human GC with a real choice** (≥1 local sub available) defers to a **routing modal** (`state.pendingRouting`); an **AI GC** resolves inline and deterministically — it routes the **front-runner** (richest rival) to the bank to deny them the work, and shares with everyone else.
- The contract bills the client **ONE net-90 invoice** (`buildRouted` → `client_value`, the summed `sub_value + markup` per player/self portion) — but **only when every portion lands** (`maybeCompleteRouted`).
- **Miss one portion → the whole contract collapses** (`onRoutedPortionBotch`): no client AR, the delivered subs are still owed, and the GC may sue the no-show for the lost commission. The `commission` field tracks the markup the GC stands to earn.

## B5 · Incidents — PM "incident tenders" (`incidents.js`)
An **`incident` card** is a building emergency needing 2–3 specific trades; it's **lighter than a civic** (no town-wide levy). Eight are in the deck (`grange_main`, `mill_breakdown`, `rail_depot`, `bijou`, `grain_elevator`, `market_hall`, …), `value` 6 per trade, `pm_fee` 3, deadline 4.

- The drawer is a **mini-PM**. For each trade the incident needs, the PM tenders one **NPC-paid** job to the local who runs it (`tradePlayer`, preferring the PM if they match), or to the **county** if no one does. The contractors are paid by the building owner either way — this is the "community puts work on the table" stream.
- Same human-defers / AI-decides-inline routing as routed contracts (shared `routeOrDefer`).
- **Deliver every tender → the PM takes the `fee`** (`maybeCompleteIncident` → `OTHER_INCOME`). **Let one stall → the PM loses the fee and may sue the defaulter** (`onIncidentTenderBotch`).

## B6 · Civic — a contract to the whole town (`civics.js`)
A **`civic` card** breaks ground town-wide. On draw, **every solvent player** gets one sub-contract **sized by their building tier**; the drawer is **PM**. (This is the shipped form — it replaced the old "drawer does every phase" idea.)

- **Contract by tier** (`CONTRACT` in `civics.js`): garage (tier 1) → **2-crew / 8 W**; shop (tier 2) → **3-crew / 12 W**; warehouse (tier 3) → **4-crew / 16 W**. Work = crew + 2; terms net-60; **sticky** (`droppable: false`). Bankrupt shops' slots are covered by the county.
- **PM bonus (drawer):** **20% of the total W** of all contracts, paid **only if ALL deliver** (`onCivicContractComplete`), plus `favor_reward` favours.
- **Failure:** any contract still open past the civic deadline drops a **town-wide global penalty** (the existing levy/recession layer, `tickCivics` → `applyGlobal`), and the **PM may sue each defaulting contractor** for their share value.
- Live civic cards: **Restore the Town Hall**, **Raise the firehouse**, **The Maple Hollow Opera House**, **The County Hospital wing**, and the **seasonal storm** (`downtown_storm`, `seasonal_storm: true`) which follows the season for its art (`civic/storm/<season>`) and flavor (Spring hail / Summer thunderstorm / Fall windstorm / Winter ice storm).

> **Important correction vs. the old plan:** the Opera House and County Hospital are **civic jobs** (`startCivic`), **not** phased "projects." The phased `project` card type is currently **dead code** (Part F).

## B7 · Move-in / fit-out — the insured 3-turn cap (`expansion.js`)
Growth (relocating up, or an in-place capacity "improve") is a **deferred capital project**, not an instant button. `startExpansion`:
- You pay **insurance** (expensed) + a **50% deposit** (capitalised as a prepaid/CIP asset) up front, and **six trade fit-out contracts go out to the town** (one per trade — your growth puts the whole table to work). You keep operating your **old** shop but pay the **new building's higher rent now** until move-in, so a staller costs you.
- The fit-out jobs are **sticky** (`droppable: false`) — a fit-out is a commitment to someone's move, can't be walked away from.
- **It's insured, so the move NEVER collapses.** `tickExpansion`: once readied, if every contract is in you move in / gain capacity, capitalise the fee to a leasehold asset, and (if relocating) write off the old leasehold. If contracts are still outstanding at the **3-turn cap** (`capTurn`), **insurance closes out** whatever's unfinished and you move in anyway — and **every rival who stalled a contract you depend on is sued** for its value (`readying_for` → `pendingDamages`). The only real failure is not affording the **balance**, which forfeits the deposit and keeps you put.

---

# Part C — The per-turn job-progress deck (`jobprogress.json`)

On top of the crew's deterministic base burn, **one job-progress card is drawn against each Active job every turn** (after the crew's work lands), in `runJobProgress` (`jobs.js`). This is the "jobsite card" swing — the day-to-day luck of the site on top of your steady rate.

- **Base burn** = summed worker productivity (each worker burns at their assigned tool's speed, else `base_hand_speed`, ± their perf-review modifier), a trained crew adds a little, unfixed code violations shave a little.
- **Then the jobsite card** (`applyProgressCard`): `work` (± progress), `pay` (± job value), `cost` (immediate cash hit), `deadline` (± turns), or **decisive** (`success` completes the job now / `failure` fails it in place — and triggers the routed/incident/civic/fit-out botch hooks).

Target spread (the deck is **roughly neutral on average**): neutral/minor ~40%, positive ~25%, negative ~25%, decisive ~10% (kept low so jobs feel dramatic, not arbitrary). Current cards: routine day, minor setback (−1), found efficiency (+1), ahead of schedule (+2), happy client tips (+2 pay), rework needed (−2), cost overrun (−2 cash), change-order (−2 pay), flawless (decisive success), catastrophe (decisive failure). Each turn's begin→burn→card→end is stashed in `player.lastProgress` for the end-of-turn report.

With **no** progress deck (early-stage callers/tests), burn stays purely deterministic.

---

# Part D — AR/AP accrual on delivery & payment (brief — documented elsewhere)

Jobs book on the **accrual** basis (see `jobs.js completeJob`, `routed.js`, `state/ledger.js`):
- A **plain job** delivered → **Dr AR / Cr Revenue** for `value` now; cash arrives later when the invoice collects (`collectInvoices`) at its terms. The AR-to-cash gap is the lesson: profitable on paper, short on cash.
- A **subcontract/GC** job books **both sides** — the sub's owed AP (the GC carries it to net-30) and, on the GC's side, the marked-up client invoice (Dr AR / Cr Revenue) and the COGS_SUB they pay the sub; gross margin = the markup.
- A **GC routed contract** bills one net-90 client invoice on all-complete; **incident/civic** pay an NPC fee/bonus (OTHER_INCOME) rather than AR.
- **Selling a job** to the bank (`sellJob`) is a small immediate `value × sell_rate` payout to cut losses; routed and sticky jobs can't be sold.

This is kept brief here on purpose — the full ledger story lives in the accrual/AR-AP docs.

---

# Part E — Suits, damages & the inter-player teeth

Across routing/incidents/civics/fit-outs, a contractor who **fails to deliver** makes the hirer/PM/GC/mover the **plaintiff in a damages suit** (`state.pendingDamages`, recovered to the recipient, capped by what the defendant can pay, within `sue_window`):
- **Routed/subcontract botch** → `botchRoutedJob` (lost value, or lost markup for a subcontract).
- **Incident tender stall** → `onIncidentTenderBotch` (PM loses fee + sues).
- **Civic default** → `tickCivics` (PM sues the defaulting share; town eats the levy).
- **Fit-out stall** → `onReadyingBotch` / `tickExpansion` (mover sues the staller; insurance still completes the move).

This is what makes player-to-player work have real stakes: take someone's sub-job and flake, and you're in court.

---

# Part F — Not built / parked

- **Phased `project` card type** (`projects.js`): the engine still contains the deposit/balance/parallel-phase machinery, but **no `project` cards are in the deck** and `resolveCard`'s `project` branch is never exercised in real play. The marquee builds (Opera House, County Hospital) ship as **civic** jobs instead. Treat `projects.js` as **dormant** — a parked design, not a live mechanic.
- **Single-trade `subcontract` job cards** (Part B3b): the engine path exists but no such cards are seeded in `fortune.json` today; multi-trade **routed** contracts are the shipped GC form.
- **The v3 "% chance per mini-game" deck-trigger table** and **per-tier starting deck mixes**: not built. The live difficulty levers are the **d6 word-of-mouth thresholds** + `cash_mod` + `shock_mult` (Part A2).

When tuning, the live numbers to push on are in `economy.json` (`job_sizes`, `npc_jobs`, `difficulty_tiers`, `expansion`, `sell_rate`, `sue_window`), `fortune.json` (deck composition / copies), and `jobprogress.json` (the jobsite swing).
