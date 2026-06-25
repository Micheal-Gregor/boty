# Card art worksheet — v2 (the new job system)

Companion to the original **`CARD-ART-WORKSHEET.md`** (kept as-is). This v2 lists the **new job-card art** from `JOB-CARDS-PLAN.md` so you can generate it in parallel while I build the engine.

> **Heads-up:** these new `card/job/…`, `card/incident/…`, `card/civic/…` paths **light up once I wire the new job system** — dropping them in now won't show in-game until that build lands, but the names are locked so you can produce them now.
>
> **Stills now → animations later:** a same-named `.webp` + `.mp4` coexist (still = poster, mp4 = animation). Test with stills, upgrade to mp4 anytime.
>
> **Global style:** *"Maple Hollow small-town Americana, warm but slightly uncanny (Twin-Peaks-wholesome), painterly; short looping moment."* Compose **building + character + scene**; keep an NPC's job scenes consistent with their `townsfolk/` portrait.

---

## 1 · Walk-in jobs (generic, by size) — `card/job/walkin/<id>`
Trade-agnostic; covers standard J1–J3 **and** the referral sizes. **4 files.**

| File | Prompt |
|---|---|
| `walkin/1p` | a lone tradesperson at a Maple Hollow customer's front porch, toolbox in hand, friendly nod |
| `walkin/2p` | a two-person crew hopping out of a work van at a job, rolling up sleeves |
| `walkin/2p_basic` | a two-person crew wheeling a tool cart into a building, basic gear loaded |
| `walkin/3p_basic` | a three-person crew staging gear at a larger job site, clipboard and ladders |

## 2 · Standard J4–J6 (per trade) — `card/job/<size>/<trade>`
**18 files.** The growth tier — bigger crews, pro gear, bigger shops.

| Size | mechanic | plumber | electrician | pipefitter | welder | hvac |
|---|---|---|---|---|---|---|
| **j4** (pro gear) | engine pulled & on a stand, full rebuild | a trench to the main line, pipe being run | a service/meter upgrade, conduit bending | a boiler fitted, big valves & pipe | custom fab, sparks on a jig | a rooftop unit craned & set |
| **j5** (tier-2 shop) | a fleet of trucks lined up for service | a whole building's plumbing rough-in | a building's full wiring, panels everywhere | a plant's process-pipe racks | structural steel erected, big welds | a building's duct & unit install |
| **j6** (warehouse) | a full restoration — a classic rebuilt to showroom | a commercial plumbing system, industrial scale | commercial switchgear & service | an industrial pipe maze | an industrial fabrication floor | a rooftop farm of commercial units |

## 3 · NPC jobs (per trade) — `card/job/<npc>/<trade>`
**24 files.** Each = the character + their trade-specific problem, in their signature mood. *(Your existing `card/brake_job.mp4` is exactly `job/hettrick/mechanic` — just rename/move it.)*

| NPC (mood) | mechanic | plumber | electrician | pipefitter | welder | hvac |
|---|---|---|---|---|---|---|
| **`hettrick`** (scowling, clutching wallet) | his rattling rusty pickup on the lift | squinting at his "fine" dripping tap | arms crossed under a flickering porch light | beside his ancient clanking radiator | jabbing at his busted gate hinge | refusing to replace his wheezing window AC |
| **`lundgren`** (fretting, church-gossip) | beside her car that won't start | shivering by her cold water heater | flipping dead outlets, exasperated | by her knocking boiler | at her rusted wrought-iron fence | bundled up by her dead furnace |
| **`dot`** (warm, grateful) | waving from the diner's delivery van | pointing at the grease trap, coffee pot in hand | under the buzzing neon diner sign | by the steam table | at the busted counter stool | opening the walk-in cooler |
| **`boon`** (urgent fire chief) | at the fire truck's engine | at the firehouse standpipe | pointing at the station alarm wiring | by the sprinkler riser | at the ladder-truck weld | by the station exhaust fan |

## 4 · Incidents (1 per trade) — `card/incident/<id>`
**6 files** (3 you may have already).

| File · trade | Prompt |
|---|---|
| `rail_depot` · mechanic | machinery seized at the Rail Depot, gears jammed, steam |
| `grange_main` · plumber | a water main erupting under the Grange Hall, townsfolk scrambling |
| `bijou` · electrician | the Bijou Theater goes dark mid-show, marquee flickering out |
| `mill` · pipefitter | a steam line bursts at the Hollis Mill, white plume, cracked pipe |
| `grain_elevator` · welder | a structural crack splitting the Grain Elevator, buckled steel |
| `diner` · hvac | refrigeration dies at Dot's Diner, frost gone, Dot dismayed |

## 5 · Civic builds — `card/civic/<id>`
**4 files** (+ the seasonal storm you already have).

| File | Prompt |
|---|---|
| `town_hall` | the historic Town Hall under restoration, bunting & scaffolding before the centennial |
| `firehouse` | the new firehouse being raised, engine rolling in, townsfolk cheering |
| `opera_house` | the grand half-built opera house, ornate facade, the Mayor at the plans |
| `county_hospital` | the new hospital wing rising, cranes, civic pride |
| `storm/<season>` | *(you have these — spring squall / summer thunderstorm / fall windstorm / winter ice storm)* |

---

## 6 · Unchanged cards — use the original worksheet
These keep their `card/<id>` slots and prompts from **`CARD-ART-WORKSHEET.md`** — nothing to redo:
- **Windfalls** (11), **Shocks** (8), **Payables** (4), **Crew events** (holiday, sick_day, injury, winter_holidays, retirement), **Defects/inspector** (3), **Specials** (bbb_special, networking_lunch, courthouse_day, tool_theft, union_drive, reelection_drive, perf_review).
- **Townsfolk** (12) and **crew portraits** — unchanged.

**Old job cards that get remapped (don't animate as `card/<id>` anymore):**
`brake_job, emergency_leak, plumbing_call, wiring_call, water_heater, panel_upgrade, warehouse_fit, rooftop_hvac, tower_fitout, emergency_call` → these become the **walk-in / J4–J6 / NPC** slots above. `sub_repipe, sub_hvac, sub_rewire` → folded into the **referral** mechanic (walk-in art). `downtown_storm` → **civic seasonal storm**. `diner_trouble, grange_main, mill_breakdown` → **incidents** above.

---

### Tally to generate
4 walk-in + 18 (J4–J6) + 24 (NPC) + 6 incidents + 4 civic = **~56 new job slots** (the 4 seasonal storms you already have). Everything else is done or unchanged.
