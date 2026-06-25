# Job-card redesign + the living deck — plan v2 (for approval)

**Status: proposal only. No engine changes until you sign off.** v2 folds in your decisions and adds the big new idea — a **deck that changes as you play**.

**Unchanged (you like these):** crew events, inspector/defects, bills & payables, shocks, windfalls, specials (BBB, networking, perf review, courthouse, tool theft, union). This plan touches **jobs, incidents, civic, subcontract**, the **deck system**, and two tweaks (poached, re-election).

---

# Part A — The living deck (NEW)

The deck's **composition is the difficulty knob**, and it's no longer fixed. Everyone starts from the same deck, and the **mini-games inject or remove cards** as you play — so your choices bend your own probabilities. Build a relationship with the Mayor and favors start showing up; cut corners and the Inspector starts hunting you; fire people and you breed poach + union cards.

### A1 · Per-player decks (key architecture call)
"More poach cards in **your** deck" vs "a union card for **everyone**" only works if **each player owns their deck.** So the proposal:
- **Every player starts with an identical 60-card deck** (built from the pool by difficulty).
- You draw from **your own** deck; it diverges from everyone else's through play.
- An injection targets **your deck** (poach, courthouse, inspector…) or **all decks** (union).
- *(This is the one true architecture change — today there's a single shared deck. Flagged as Decision #1.)*

### A2 · Starting deck by difficulty
At game start, build the **60-card deck** by drawing from the **card pool** with a difficulty-weighted mix. Proposed tiers:

| Tier | Feel | Mix bias |
|------|------|----------|
| **Steady** | smooth growth | more J1–J2 jobs, more windfalls, fewer shocks |
| **Standard** | balanced | the default mix |
| **Cutthroat** | forces investment | more big jobs (need crew + gear + shop), more shocks, fewer windfalls — you must build capacity and weather downtime waiting on revenue |

Some pool cards aren't in the starting 60 at all — they only ever arrive via injection.

### A3 · Deck triggers — what reshapes the deck
Every one of these fires a **reshuffle** (with the animation in A4):

| Mini-game / choice | Effect | Whose deck | Certainty |
|---|---|---|---|
| **Complete a Dot job** | **+** referral / windfall opportunity (her good word) | yours | on complete |
| **Don't prioritize Lundgren** | **−** job cards (she pulls work off your plate) | yours | on ignore |
| **Donate to the Mayor** (re-election) | **+** favor-opportunity cards (you're owed) | yours | on donate |
| **Use a Favor to clear a fine** | **+** inspection cards (you made Grit's list) | yours | chance |
| **Fire an employee** | **+** a union card (**everyone**) **and +** poach cards (yours) | all + yours | chance |
| **Pay late** (dodge an AP) | **+** a courthouse_day card | yours | chance |
| **Don't do jobs** (sell / drop / let expire) | **−** windfall cards (word gets around) | yours | chance |

*(Amounts and the exact %s are Decision #4 — drafted in Part E.)*

### A4 · The shuffle animation (NEW art/UX)
Whenever composition changes, the player sees it happen:
- **Injection:** flash the incoming card(s) face-up ("➕ a Poach card slips into your deck") → they fly into the deck → **shuffle animation** → resume.
- **Removal:** flash the pulled card(s) ("➖ Lundgren pulls a job") → they leave the deck → **shuffle**.

Needs: a deck-shuffle animation (can be CSS/sprite, or an `mp4` you provide — `card/deck/shuffle.*`), plus the small +/- reveal. This makes the living deck *legible* — players feel their choices changing the odds.

---

# Part B — Job families (updated)

## B1 · Standard jobs — the 6-size ladder
One card per size; tailors to your trade on draw, so every trade sees the identical ladder.

| Size | Crew | Requires | Art |
|------|------|----------|-----|
| **J1 — Service call** | 1 | — | **generic walk-in** |
| **J2 — Standard job** | 2 | — | **generic walk-in** |
| **J3 — Tooled job** | 2 | basic equipment | **generic walk-in** |
| **J4 — Pro job** | 3 | pro gear | **per-trade** |
| **J5 — Major job** | 4 | basic + pro + Shop (tier 2) | **per-trade** |
| **J6 — Marquee job** | 4 | basic + pro + Warehouse (tier 3) | **per-trade** |

**Art decision (yours):** J1–J3 are **walk-in jobs → one generic set** (no per-trade art). J4–J6 are **per-trade**. Per-trade skins for J4–J6:

| Size | Mechanic | Plumber | Electrician | Pipefitter | Welder | HVAC |
|------|----------|---------|-------------|------------|--------|------|
| J4 | Engine rebuild | Main-line dig | Service upgrade | Boiler job | Custom fab | Rooftop unit |
| J5 | Fleet contract | Building plumbing | Building wiring | Plant piping | Structural steel | Building HVAC |
| J6 | Restoration shop | Commercial system | Commercial electrical | Industrial system | Industrial fab | Commercial system |

## B2 · NPC jobs — four characters, four twists (per-trade art — you want each)
Each is one card that tailors to your trade and carries the character's behavior:

| NPC | Twist | Terms |
|-----|-------|-------|
| **Old Man Hettrick** | (no dispute roll — kept simple) | **net-90** (pays very late) |
| **Mrs. Lundgren** | the **anti-Dot**: if not worked the round you draw her, she **pulls job cards from your deck** + reshuffle | late (net-60) |
| **Chief Boon** | **mandatory** — **can't end your turn until it's assigned**; the job **stays 8 turns**, **3 work to complete** (won't expire) | prompt |
| **Dot** | complete it → **injects a referral/windfall** into your deck (+reshuffle) | normal |

Per-trade skins (what each needs from your trade):

| NPC | Mechanic | Plumber | Electrician | Pipefitter | Welder | HVAC |
|-----|----------|---------|-------------|------------|--------|------|
| **Hettrick** | rattling pickup | "fine" dripping tap | flickering porch light | ancient radiator | busted gate hinge | wheezing window unit |
| **Lundgren** | car won't start | cold water heater | dead outlets | knocking boiler | wrought-iron fence | dead furnace |
| **Boon** | fire truck engine | firehouse standpipe | station alarm wiring | sprinkler riser | ladder-truck weld | station exhaust |
| **Dot** | delivery van | grease trap | neon sign | steam table | counter & stools | walk-in cooler |

## B3 · Misallocation / referral — the wild card
A wrong-trade job walks in; you broker it. **Now it has size variants** (reuses the generic walk-in art): **1-person, 2-person, 3-person + basic**.

**Logic (your rules):**
1. Draw → route to a **random shop with the right trade**.
2. **Finder's fee = the job's sell price** (matches the existing sell-a-job fee).
3. Next round the target shop **accepts** (does the job; you collect the fee) or **refuses** (you collect **nothing**).
4. **No shop has that trade?** → the **bank pays** your finder's fee automatically.

## B4 · Incidents — one per trade, at a building
A building emergency needing a specific trade; mismatch → uses the B3 referral logic. **6 total, one per trade:**

| Trade | Incident · Building | Status |
|-------|---------------------|--------|
| Plumber | Burst main · Grange Hall | exists |
| Pipefitter | Steam line · Hollis Mill | exists |
| HVAC | Refrigeration fails · Dot's Diner | exists |
| Mechanic | Machinery seizes · **Rail Depot** | new |
| Electrician | Blackout · **Bijou Theater** | new |
| Welder | Structural crack · **Grain Elevator** | new |

## B5 · Civic — a contract to the whole town
On draw, **every player** is offered a sub-contract sized **by their shop**; the **drawer is PM**.

- **Sub-contract pay by size:** 2-person → **8 W**, 3-person → **12 W**, 4-person → **16 W**.
- **PM bonus (drawer):** **20% of the total W of all sub-contracts**, if **all** are completed.
- **Failure:** the **existing global-card penalty** (town levy) — no new system.
- **Storm:** `downtown_storm` **moves from incidents to civic**, and the storm **follows the season** (Spring squall / Summer thunderstorm / Fall windstorm / Winter ice storm) using your 4 storm animations.

Civic builds: Town Hall, Firehouse, Opera House, County Hospital, + seasonal Storm.

---

# Part C — Two card tweaks

**Poached** — pop-up to counter, then **you roll** (visible dice):

| Counter | Stays on | ≈ |
|---|---|---|
| **1 W** | 1–3 | 50% |
| **2 W** | 1–4 | 67% |
| **3 W** | 1–5 | 83% |
| Let go | — | leaves, free |

**Re-election drive** — pop-up: **buy a Favor from Mayor Crabtree for 10 W** *(bumped from 5)*. Donating **builds the relationship → injects favor-opportunity cards** into your deck (A3). Uses Crabtree's NPC face.

---

# Part D — Graphics manifest (updated)

| Slot | Path | Count |
|------|------|-------|
| **Walk-in jobs** (J1–J3 **and** referral sizes) | `card/job/walkin/<1p,2p,2p_basic,3p_basic>` | ~**4** |
| **Standard J4–J6** (per trade) | `card/job/<j4,j5,j6>/<trade>` | **18** |
| **NPC jobs** (per trade) | `card/job/<hettrick,lundgren,boon,dot>/<trade>` | **24** |
| **Incidents** | `card/incident/<id>` | **6** (3 new) |
| **Civic builds** | `card/civic/<id>` | **4** |
| **Seasonal storm** | `card/civic/storm/<season>` | **4** (you have) |
| **Deck shuffle** | `card/deck/shuffle` (+ tiny +/- reveal) | **1** (or CSS) |
| **Referral** | reuses walk-in art | 0 |
| **Total new** | | **≈ 53** |

Down from ~70 by making J1–J3 generic. Everything else (windfalls, shocks, payables, crew, specials, townsfolk) is unchanged from `CARD-ART-WORKSHEET.md`.

---

# Part E — Decisions still open (drafted defaults to react to)

1. **Per-player decks** (A1) — confirm we move from one shared deck to a deck per player. *(Recommended; it's what "your deck vs everyone" requires.)*
2. **Difficulty tiers** (A2) — confirm Steady / Standard / Cutthroat, and where the player picks it (setup screen). Exact 60-card mixes I'll draft once the families are locked.
3. **Starting deck = 60 cards**, drawn from the pool by tier — confirm 60.
4. **Injection amounts & odds** (A3) — proposed defaults: Dot +1 (on complete), Lundgren −1 job (on ignore), Mayor +1 favor (on donate), Favor-clears-fine +1 inspection @ 50%, Fire +1 union-to-all @ 50% & +1 poach-to-you @ 50%, Pay-late +1 courthouse @ 33%, Skip-job −1 windfall @ 50%. Tune freely.
5. **Lundgren** — pulls **how many** job cards (1?), and her terms (net-60?).
6. **Walk-in art** — one generic image total, or one per size (~4)? (Doc assumes ~4.)
7. **Shuffle animation** — you provide `card/deck/shuffle.mp4`, or I build a CSS/sprite shuffle?
8. **Deck count balance** — with the living deck, the *starting* mix + injection rates are the new tuning surface; we'll set them in the harness after build.

---

**Nothing proceeds until you're happy with this.** Mark it up or reply with changes, and I'll revise again before any engine work.
