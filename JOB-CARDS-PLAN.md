# Job-card redesign + the living deck — plan v3 (for approval)

**Status: proposal only. No engine changes until you sign off.** v3 folds in your latest decisions; most of Part E is now settled, with the rest moving into harness tuning.

**Unchanged (you like these):** crew events, inspector/defects, bills & payables, shocks, windfalls, specials (BBB, networking, perf review, courthouse, tool theft, union). This plan touches **jobs, incidents, civic, subcontract**, the **deck system**, and two tweaks (poached, re-election).

---

# Part A — The living deck

The deck's **composition is the difficulty knob**, and it changes as you play. Your choices bend your own probabilities — keep the cast happy and good work flows in; neglect them and the work dries up.

### A1 · Per-player decks ✅ CONFIRMED
- **Every player starts with a copy of the same 60-card deck** (built from the pool by difficulty).
- You then play **your own** deck — it diverges through your choices.
- An injection targets **your deck** (poach, courthouse, inspector, Dot, Hettrick…) or **all decks** (union).
- *(This is the one real architecture change from today's single shared deck.)*

### A2 · Difficulty tiers ✅ — they shape the deck two ways
At setup you pick a tier. It sets **(a)** the **starting 60-card mix** and **(b)** the **% chance** each trigger fires (A3). Both are harness-tunable.

| | Steady | Standard | Cutthroat |
|---|--------|----------|-----------|
| **Feel** | smooth growth | balanced | forces investment & grit |
| **Starting mix** | more Dot jobs, fewer Hettrick; more windfalls | default | **fewer Dot, more Hettrick** jobs; more shocks |
| **Dot adds jobs (+3)** | **100%** | ~75% | **50%** |
| **Lundgren/Hettrick pull jobs (−2)** | **50%** | ~75% | **100%** |

> **The %s above are illustrative, not fixed.** Every trigger ships at **100%** and gets tuned per-tier in the harness until each tier feels right — the Dot-down/Hettrick-up pattern is the *direction*, not hard numbers.
>
> The cutthroat irony you flagged: the cheapskate Hettrick won't pay (net-90) yet keeps showing up — more of his cards, firing more often, and pulling your work when you put him off.

### A3 · Deck triggers — calculated %, not dice
Each mini-game outcome rolls a **fixed % chance** (set per tier; **default 100%**, the new harness parameter) to inject/remove cards, then **reshuffles**:

| Mini-game / choice | Effect | Whose deck | Amount |
|---|---|---|---|
| **Complete a Dot job** | **+** job cards (good word of mouth) | yours | **+3** |
| **Ignore a Hettrick job** | **−** job cards (bad word of mouth) | yours | **−2** |
| **Ignore a Lundgren job** | **−** job cards (bad word of mouth) | yours | **−2** |
| **Donate to the Mayor** (re-election) | **buy a Favor to hand** *(10 W)* **and +** networking_lunch cards | yours | **+3 networking_lunch** |
| **Use a Favor to clear a fine** | **+** inspection cards (you made Grit's list) | yours | TBD *(draft +1)* |
| **Fire an employee** | **+** a union card (**everyone**) **and +** poach cards (yours) | all + yours | TBD *(draft +1 / +1)* |
| **Pay late** (dodge an AP) | **+** a courthouse_day card | yours | TBD *(draft +1)* |
| **Don't do jobs** (sell / drop / expire) | **−** windfall cards | yours | TBD *(draft −1)* |

*(The four "TBD" amounts are the only injection numbers left to set — drafted defaults shown, finalized in the harness.)*

### A4 · The shuffle animation ✅ — we build it (CSS/sprite)
On any composition change the player sees it: flash the incoming/outgoing card(s) ("➕ 3 jobs — Dot's good word" / "➖ 2 jobs — Hettrick's grumbling"), they fly into/out of the deck, then a **CSS/sprite shuffle** plays. Makes the living deck legible. *(No `.mp4` needed from you.)*

---

# Part B — Job families

## B1 · Standard jobs — the 6-size ladder
One card per size; tailors to your trade on draw, so every trade sees the identical ladder.

| Size | Crew | Requires | Art |
|------|------|----------|-----|
| **J1 — Service call** | 1 | — | generic walk-in |
| **J2 — Standard job** | 2 | — | generic walk-in |
| **J3 — Tooled job** | 2 | basic equipment | generic walk-in |
| **J4 — Pro job** | 3 | pro gear | **per-trade** |
| **J5 — Major job** | 4 | basic + pro + Shop (tier 2) | **per-trade** |
| **J6 — Marquee job** | 4 | basic + pro + Warehouse (tier 3) | **per-trade** |

J4–J6 per-trade skins:

| Size | Mechanic | Plumber | Electrician | Pipefitter | Welder | HVAC |
|------|----------|---------|-------------|------------|--------|------|
| J4 | Engine rebuild | Main-line dig | Service upgrade | Boiler job | Custom fab | Rooftop unit |
| J5 | Fleet contract | Building plumbing | Building wiring | Plant piping | Structural steel | Building HVAC |
| J6 | Restoration shop | Commercial system | Commercial electrical | Industrial system | Industrial fab | Commercial system |

## B2 · NPC jobs — four characters, the word-of-mouth engine
Each is one card, tailors to your trade (per-trade art — you want them real). **Hettrick & Lundgren are the bad-word-of-mouth twins; Dot is the good-word-of-mouth counter; Boon is mandatory.**

| NPC | Twist | Terms |
|-----|-------|-------|
| **Old Man Hettrick** | **Ignore his job** → bad word of mouth **pulls −2 jobs** from your deck (+reshuffle). Keeps coming back (more of his cards at cutthroat). | **net-90** |
| **Mrs. Lundgren** | **Ignore her job** → bad word of mouth **pulls −2 jobs** (+reshuffle). | **net-90** |
| **Dot** | **Complete her job** → good word of mouth **adds +3 jobs** (+reshuffle). The counter to the twins. | normal |
| **Chief Boon** | **Mandatory** — **can't end your turn until it's assigned**; the job **stays 8 turns**, **3 work to complete** (won't expire). | prompt |

("Prioritize/ignore" = whether you assign a worker the round you draw them.)

Per-trade skins:

| NPC | Mechanic | Plumber | Electrician | Pipefitter | Welder | HVAC |
|-----|----------|---------|-------------|------------|--------|------|
| **Hettrick** | rattling pickup | "fine" dripping tap | flickering porch light | ancient radiator | busted gate hinge | wheezing window unit |
| **Lundgren** | car won't start | cold water heater | dead outlets | knocking boiler | wrought-iron fence | dead furnace |
| **Dot** | delivery van | grease trap | neon sign | steam table | counter & stools | walk-in cooler |
| **Boon** | fire truck engine | firehouse standpipe | station alarm wiring | sprinkler riser | ladder-truck weld | station exhaust |

## B3 · Misallocation / referral — the wild card
A wrong-trade job walks in; you broker it. **Size variants: 1-person, 2-person, 3-person + basic** (reuses walk-in art).

1. Draw → route to a **random shop with the right trade**.
2. **Finder's fee = the job's sell price.**
3. Next round the target **accepts** (does the job; you collect the fee) or **refuses** (you collect **nothing**).
4. **No shop has that trade** → the **bank pays** your fee automatically.

## B4 · Incidents — one per trade, at a building
Building emergency needing a specific trade; mismatch → B3 referral logic. **6 total:**

| Trade | Incident · Building | Status |
|-------|---------------------|--------|
| Plumber | Burst main · Grange Hall | exists |
| Pipefitter | Steam line · Hollis Mill | exists |
| HVAC | Refrigeration fails · Dot's Diner | exists |
| Mechanic | Machinery seizes · **Rail Depot** | new |
| Electrician | Blackout · **Bijou Theater** | new |
| Welder | Structural crack · **Grain Elevator** | new |

## B5 · Civic — a contract to the whole town
On draw, **every player** gets a sub-contract sized **by their shop**; the **drawer is PM**.

- **Sub-contract pay by size:** 2-person → **8 W**, 3-person → **12 W**, 4-person → **16 W**.
- **PM bonus (drawer):** **20% of the total W of all sub-contracts**, if **all** complete.
- **Failure:** the **existing global-card penalty** (town levy).
- **Storm:** `downtown_storm` **moves to civic** and **follows the season** (Spring squall / Summer thunderstorm / Fall windstorm / Winter ice storm) — your 4 storm animations.

Civic builds: Town Hall, Firehouse, Opera House, County Hospital, + seasonal Storm.

---

# Part C — Two card tweaks

**Poached** — counter, then **you roll** (visible dice):

| Counter | Stays on | ≈ |
|---|---|---|
| **1 W** | 1–3 | 50% |
| **2 W** | 1–4 | 67% |
| **3 W** | 1–5 | 83% |
| Let go | — | leaves, free |

**Re-election drive** — Crabtree pop-up: **buy a Favor for 10 W**. The purchase **adds the Favor to your hand now** *and* **injects +3 `networking_lunch` cards** into your deck (more favor opportunities later). Building the relationship compounds.

---

# Part D — Graphics manifest

| Slot | Path | Count |
|------|------|-------|
| **Walk-in jobs** — one per size (J1–J3 + referral) | `card/job/walkin/<1p,2p,2p_basic,3p_basic>` | **4** |
| **Standard J4–J6** (per trade) | `card/job/<j4,j5,j6>/<trade>` | **18** |
| **NPC jobs** (per trade) | `card/job/<hettrick,lundgren,boon,dot>/<trade>` | **24** |
| **Incidents** | `card/incident/<id>` | **6** (3 new) |
| **Civic builds** | `card/civic/<id>` | **4** |
| **Seasonal storm** | `card/civic/storm/<season>` | **4** (you have) |
| **Deck shuffle** | CSS/sprite — we build | 0 |
| **Referral** | reuses walk-in art | 0 |
| **Total new to generate** | | **≈ 52** |

Everything else (windfalls, shocks, payables, crew, specials, townsfolk) is unchanged — see `CARD-ART-WORKSHEET.md`.

---

# Part E — What's left (all harness-tuning now)

Everything structural is decided. Remaining items are **numbers we set and balance in the tuning harness after the build**:

1. **Starting 60-card mix per tier** (Steady / Standard / Cutthroat) — the card counts.
2. **Per-tier trigger %s** — Dot 100/75/50, Lundgren+Hettrick 50/75/100 (confirmed pattern); fill the Standard column.
3. **Four remaining injection amounts** — favor-clears-fine (+inspections), fire (+union/+poach), pay-late (+courthouse), skipped-job (−windfall). Drafted at ±1; tune.
4. **Civic/job value balance** — slot the new ladder + civic pay into the harness and re-run.

When you're happy with v3, say the word and I'll start the engine build (per-player decks → the job ladder → NPC word-of-mouth → referral/civic → the two tweaks → shuffle UX), then tune.
