# Job-card redesign — plan (for approval before any engine change)

**Goal:** every trade gets *equal access to work*. Today the job deck hard-codes a trade per card with uneven values (pipefitter's tower = 67W, mechanic's brake job = 11W), so your trade choice changes how much work you see. The fix is **tailored-on-draw**: a job card carries a *size/requirement*, and when you draw it the game skins it to **your** trade. The deck becomes trade-agnostic, so balance is structural, not hand-tuned.

> **Status:** proposal only. Nothing in the engine changes until you approve. After approval we wire it and re-run the tuning harness.
>
> **Unchanged (you said you like these):** crew events, the inspector/defects, bills & payables, shocks, windfalls, and special cards (BBB fair, networking, perf review, courthouse, tool theft, union). This plan only touches **jobs, incidents, civic, subcontract**, plus two tweaks (poached, re-election).

---

## The five job families (overview)

| # | Family | Cards in deck | How it's drawn | Art needed |
|---|--------|--------------|----------------|-----------|
| 1 | **Standard jobs** (6 sizes) | ~17 generic copies | tailors to your trade | 6 sizes × 6 trades = **36** |
| 2 | **NPC jobs** (4 characters) | 4–8 copies | tailors to your trade, NPC twist | 4 × 6 = **24** |
| 3 | **Misallocation / referral** | ~3 copies | wrong-trade → routed to a rival | reuse target's art (**0 new**) |
| 4 | **Incidents** (1 per trade) | 6 | a building emergency; mismatch → referred | **6** |
| 5 | **Civic** (town-wide) | 5 | a contract to *every* player | 4 + **seasonal storm ×4** |

**New job animations to generate ≈ 36 + 24 + 6 + 4 + 4 = ~74.** (That's the honest number for full per-trade tailoring — see *Decisions to confirm* for a leaner option if that's too many.)

---

## 1 · Standard jobs — the 6 sizes (the bread-and-butter)

One card per size sits in the deck; on draw it becomes a job for **your** trade. This is the growth ladder — small fast calls up to marquee contracts that need a big crew, both gear types, and a bigger shop.

| Size | Crew | Requires | Pay band | Rule |
|------|------|----------|----------|------|
| **J1 — Service call** | 1 | — | small, fast | quick money, short deadline |
| **J2 — Standard job** | 2 | — | low-mid | the everyday job |
| **J3 — Tooled job** | 2 | basic equipment | mid | can't start bare-handed |
| **J4 — Pro job** | 3 | pro gear | mid-high | needs the pro rig |
| **J5 — Major job** | 4 | basic + pro + **Shop (tier 2)** | high, net-60 | needs room to work |
| **J6 — Marquee job** | 4 | basic + pro + **Warehouse (tier 3)** | top, net-90 | the crown jewel |

**Per-trade skins** (the art + name shown when *that* trade draws the size):

| Size | Mechanic | Plumber | Electrician | Pipefitter | Welder | HVAC |
|------|----------|---------|-------------|------------|--------|------|
| J1 | Brake job | Clogged drain | Fixture swap | Fitting repair | Railing weld | A/C service |
| J2 | Tune-up | Water heater | Panel upgrade | Steam-line patch | Gate & fence | Furnace swap |
| J3 | Transmission | Section re-pipe | Room rewire | Process pipe | Structural repair | Ductwork run |
| J4 | Engine rebuild | Main-line dig | Service upgrade | Boiler job | Custom fab | Rooftop unit |
| J5 | Fleet contract | Building plumbing | Building wiring | Plant piping | Structural steel | Building HVAC |
| J6 | Restoration shop | Commercial system | Commercial electrical | Industrial system | Industrial fab | Commercial system |

**Art:** `card/job/<size>/<trade>` — e.g. `card/job/j1/mechanic`, `card/job/j6/welder`. **36 files.**

> Because the SAME card tailors to whoever draws it, every trade sees the exact same ladder of work at the same values. That's the equal-access fix.

---

## 2 · NPC jobs — the four characters with a twist

Each of these four is **one card** that tailors to your trade (so 6 art skins each), and carries that character's signature behavior. They're how the cast tugs on you.

| NPC | Twist (the rule) | Pay |
|-----|------------------|-----|
| **Old Man Hettrick** | Pays **late** (net-60) and **disputes the bill** — finishing may trigger a haggle (a getaway-style roll to collect full vs. discounted). | late |
| **Mrs. Lundgren** | Pays **late**, and you must **prioritize her**: if she isn't worked **the round you draw her**, she pulls the job (and word gets around — a small reputation ding). | late |
| **Chief Boon** | **Mandatory** — you *must* assign a tradesperson this round, even if it pulls someone off a bigger job. Refuse = penalty. | prompt |
| **Dot** | A favor to her: **complete it and she refers you** — seeds a bonus job / windfall next round. Her good word compounds. | normal |

**Per-trade skins** (what each NPC needs from *your* trade):

| NPC | Mechanic | Plumber | Electrician | Pipefitter | Welder | HVAC |
|-----|----------|---------|-------------|------------|--------|------|
| **Hettrick** | his rattling pickup | his "fine" dripping tap | his flickering porch light | his ancient radiator | his busted gate hinge | his wheezing window unit |
| **Lundgren** | her car won't start | her cold water heater | her dead outlets | her knocking boiler | her wrought-iron fence | her dead furnace |
| **Boon** | the fire truck's engine | the firehouse standpipe | the station alarm wiring | the sprinkler riser | the ladder-truck weld | the station exhaust |
| **Dot** | the diner's delivery van | the grease trap | the neon sign | the steam table | the counter & stools | the walk-in cooler |

**Art:** `card/job/<npc>/<trade>` — e.g. `card/job/hettrick/plumber`, `card/job/dot/hvac`. **24 files.** (Keep each visually consistent with that NPC's `townsfolk/` portrait.)

---

## 3 · Misallocation / referral — the broker mechanic

One card type: **a job that isn't your trade walks in the door.** You can't do it, so it routes to the right shop and you take a finder's fee.

**Logic:**
1. You draw it → game picks a **random one of the other 5 trades** as the correct shop, and that shop is the **referral target**.
2. You (the referrer) are owed a **finder's fee F**.
3. **Next round**, the target shop chooses on their turn: **Accept** (they do the job, collect its value, and pay you F) — or **Reject** (the job goes to the bank/NPC).
4. **Either way, at the start of the round after, you (referrer) collect F.** Brokering pays regardless; rejecting just means the target passes on the work.

**Art:** reuse the **target trade's J-art** (it's their job now) — **0 new files**. Optional: one generic "not your trade — refer it out" framing card.

> This replaces the three current `sub_*` cards with one clean, trade-fair mechanic. (The existing GC/markup math can fold into F.)

---

## 4 · Incidents — one per trade, at a town building

A thing breaks somewhere in Maple Hollow and needs a specific trade. If it matches you, it's your job; if not, it uses the **§3 referral** logic (route → accept/reject → referrer paid). **6 incidents, one per trade**, so every trade has its emergency.

| Trade | Incident | Building | Status |
|-------|----------|----------|--------|
| Plumber | Burst main | Grange Hall | exists (`grange_main`) |
| Pipefitter | Steam line bursts | Hollis Mill | exists (`mill_breakdown`) |
| HVAC | Refrigeration fails | Dot's Diner *(or Cold Storage)* | exists (`diner_trouble`) |
| Mechanic | Machinery seizes | **Rail Depot** | **new** |
| Electrician | The house goes dark | **Bijou Theater** | **new** |
| Welder | Structural crack | **Grain Elevator** | **new** |

**Art:** `card/incident/<id>` (rail_depot, grange_main, bijou, mill, grain_elevator, diner) — **6 files** (3 you may already have).

---

## 5 · Civic — a contract to the whole town

Civic jobs are different: when drawn they **offer a piece to every player**, the **drawer becomes project manager**, and the outcome is collective.

**Logic:**
- On draw, **each player** is offered a sub-contract slice of the build.
- The **drawer (PM)** gets a **project-manager bonus + favors** if the project is **completed**.
- If it **collapses** (deadline missed), a **group penalty** (town levy) hits **everyone**.

| Civic job | Status |
|-----------|--------|
| Restore the Town Hall (`civic_townhall`) | exists |
| Raise the firehouse (`civic_firehouse`) | exists |
| The Opera House (`opera_house`) | exists |
| County Hospital wing (`county_hospital`) | exists |
| **Storm damage downtown** (`downtown_storm`) → **move here from incidents** | exists, re-home |

**Seasonal storm:** `downtown_storm` becomes civic and the **storm type follows the season** — Spring squall, Summer thunderstorm, Fall windstorm, Winter ice storm — using your four storm animations.

**Art:** `card/civic/<id>` (town_hall, firehouse, opera_house, county_hospital) = 4, **plus** `card/civic/storm/<season>` ×4 (you have these). 

---

## 6 · Two card tweaks (small, self-contained)

**Poached** — when a rival dangles a paycheck at your worker, a **pop-up** lets you counter, then **you roll** (we already have the dice system):

| Counter-offer | Stays on | ≈ |
|---------------|----------|---|
| Pay **1 W** | 1–3 | 50% |
| Pay **2 W** | 1–4 | 67% |
| Pay **3 W** | 1–5 | 83% |
| Let them go | — | worker leaves, free |

**Re-election drive** — a **pop-up**: **buy a Favor from Mayor Crabtree for 5 W?** (yes → pay 5W, gain a Favor card; no → pass). Uses the Folsom-style NPC confirm with Crabtree's face.

---

## Graphics manifest — everything to generate

| Slot | Path | Count |
|------|------|------|
| Standard jobs | `card/job/<j1..j6>/<trade>` | **36** |
| NPC jobs | `card/job/<hettrick,lundgren,boon,dot>/<trade>` | **24** |
| Incidents | `card/incident/<id>` | **6** (3 new) |
| Civic builds | `card/civic/<id>` | **4** |
| Seasonal storm | `card/civic/storm/<season>` | **4** (you have these) |
| Referral | reuse target trade's J-art | **0** |
| **Total new job art** | | **≈ 70** |

All other card art (windfalls, shocks, payables, crew, specials, townsfolk) is unchanged from `CARD-ART-WORKSHEET.md`.

---

## Decisions to confirm before we build

1. **Art volume.** Full per-trade tailoring = ~70 job animations. **Leaner options** if that's a lot: (a) only J4–J6 + NPC jobs get per-trade art; J1–J3 share one generic per size (saves 18); (b) NPC jobs share art across trades with a trade icon overlay (saves ~18). Your call.
2. **Finder's fee F** — flat (e.g. 3 W) or a % of job value? And does a *rejected* referral still pay the referrer from the bank, or only when accepted? (You said "either way" — confirming.)
3. **Hettrick's dispute** — a getaway-style collection roll (full vs. discounted), or just always-late net-60?
4. **Lundgren's penalty** for not prioritizing — pull the job only, or also a small rep/cash ding?
5. **Boon mandatory** — hard requirement (can't end turn until assigned) or a stiff penalty if you don't?
6. **Civic "slice to every player"** — does each player get an identical sub-job, or shares scaled to crew? And the **PM bonus** size + **group penalty** size.
7. **Deck counts** — proposed ~17 standard + 6 NPC + 3 referral + 6 incident + 5 civic = ~37 job cards. Adjust the mix?
8. **The storm as civic** — confirm `downtown_storm` leaves incidents for civic.

Once you mark these up, I'll build the engine changes and re-run the tuning harness for balance.
