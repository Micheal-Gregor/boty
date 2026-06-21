# Maple Hollow — World design (basic edition)

The "World track": turn the balanced engine into a living, teachable business sim. **The deck is
the engine, the P&L is the soul, the town is the skin.** It's a card-driven game where running a
service trade in Maple Hollow generates real journal entries you can read as financial statements.

Design rules:
- **Objects + generic cards.** ~205 objects (people, buildings, tools, events) carry attributes;
  ~60 *generic* card designs target object *types* and skin onto specific objects. No bespoke code
  per card → this is the **basic edition**, and new objects/cards are **expansion sets**.
- **Every card may post a journal entry.** That's what feeds the ledger.
- **Cards inherit object art** (a building incident shows the building); only play/hand + service
  cards get their own. See `ASSETS.md`.

---

## 1. Chart of accounts (the G/L spine)
Simplified-but-real for a service trade, no inventory. Every transaction posts a JE; the P&L /
Balance Sheet / Cash Flow are reports off the G/L. **The win is cash (1000); the P&L shows whether
you're actually profitable — they diverge, and that gap is the lesson.**

**Balance sheet — 1000–3999**
| # | Account | # | Account |
|---|---|---|---|
| 1000 | Cash | 2000 | Accounts payable |
| 1100 | Accounts receivable | 2100 | Line of credit / loans |
| 1200 | Prepaid insurance & licenses | 2300 | Taxes payable |
| 1500 | Equipment (at cost) | 3000 | Owner's capital (opening) |
| 1550 | Accum. depreciation — equipment *(contra)* | 3100 | Retained earnings |
| 1600 | Shop & building improvements | 3900 | Owner's draws |
| 1650 | Accum. depreciation — building *(contra)* | | |

**Profit & loss — 4000–9999**
| # | Account | # | Account |
|---|---|---|---|
| 4000 | Contract revenue | 6300 | Utilities (hydro) |
| 4100 | Other income (grants, awards, referrals) | 6400 | Licenses, permits & taxes |
| 5000 | COGS — direct labour | 6500 | Training |
| 5100 | COGS — equipment (rental/deprec.) | 6600 | Meals & entertainment |
| 5200 | COGS — subcontract (tenders paid out) | 6700 | Advertising & marketing |
| 6000 | Rent | 6800 | Professional fees & interest |
| 6100 | Wages — idle/overhead | 6900 | Legal & settlements |
| 6200 | Insurance expense | 7000 | Depreciation expense |
| | | 7100 | Bad debt (uncollectible AR) |
| | | 7200 | Repairs & maintenance (expensed) |

**Phasing:** ship the **P&L first**, then a minimal Balance Sheet (cash, equipment, AR/AP, equity —
needed because self-work *capitalises* to 1600), then Cash Flow.

---

## 2. The card system

### Five card types
| Type | Lives | Touches | Does |
|---|---|---|---|
| **Incident** (I) | one-shot trigger, ongoing work | a building / project / your shop | spawns **1–6 trade tenders** |
| **Fortune** (F) | one-shot, resolves on draw | you *or* the town | windfall / shock / seasonal moment / summons |
| **Play / hand** (P) | one-shot, **held & played** | you (can target rivals) | slick lawyer, rush, buy-time, sabotage, favor |
| **Persistent** (M) | standing until expiry/condition | **only you** | insurance→deductible, marketing, a lien |
| **Global / world** (G) | standing until expiry/condition | **everyone** | boom, inspection blitz, mayor's pressure |

Under the hood a card is just traits: **trigger** (auto-on-draw / held / reactive) × **scope**
(you / everyone) × **duration** (one-shot / timer / condition) + effect verbs + optional JE.

### Seven generic verbs (the whole machine)
1. **spawn tenders** — an incident hands out 1–6 trade contracts
2. **post a journal entry** — Dr/Cr → the G/L
3. **start / end a persistent** — begin or clear a lingering modifier (timer *or* condition)
4. **nudge a persistent's clock** — the **Favor** verb: −1/cancel a positive, +1/red-tape a negative
5. **inject / remove deck cards** — reshape a hybrid deck (marketing, Dot's word-of-mouth)
6. **grant a card to hand** — a character reward drops a Play card on you
7. **suppress an effect** — a negative persistent disables another card's bonus until cleared

### Key mechanics
- **Hybrid deck.** A shared communal **Town deck** (fixed order — card-counting "seasons" survive)
  drawn down together, **plus** each player's personal **insertion pile** that world cards feed,
  shuffled into *their* upcoming draws.
- **Incidents, not jobs.** A job card is a building *incident* that spawns tenders allocated to
  whoever runs that trade (the Pass-2 routing web, now with a reason). An incident on **your own
  shop** = you're the customer → pay cost, **capitalise to 1600**, insurance/deductible/claim apply.
- **Persistent end-conditions.** Broken equipment / shop damage / compliance penalties are negative
  persistents that **suppress an effect until you satisfy a condition** (pay to fix) — generalising
  the Pass-2d code-violation loop; insurance turns the fix into a deductible.
- **Favor** (scarce + counterable): nudges a persistent's clock ±1 (timer) or adds a 1-turn
  red-tape lag (condition). Counter a rival's favor with your own — a tug-of-war, not a trap.
- **Hand cards are earned rewards** from furthering a character's agenda, with a low-rate lucky
  draw as the floor. Slick lawyer stays a **one-off** — a retainer is too strong.

---

## 3. The objects (~205)

### Tradespeople (40) — id, name, flavor (random on hire)
Vern Tucker · Lucia Marsh · Bo Pruitt · Etta Boone · Cy Dolan · Priya Nair · Hank Olafsson · Dell
Crews · Roy Bramble · Mabel Tucker · Gus Lindqvist · Tomas Reyes · Junior Pettigrew · Sallie Vance ·
Walt Hettrick · Deb Folsom · Ozzie Crabtree · Faye Lundgren · Curtis Boon · Nadia Petrov · Earl
Svenson · Pearl Dawes · Hutch Marlow · Lottie Grimes · Dwayne Foss · Iris Hollis · Sven Jr. · Carmen
Diaz · Buck Tolliver · Minnie Vale · Rex Dolan · Greta Olafsson · Pace Crews · Hollis Bramble · Otto
Grim · Tilly Marsh · Mack Reyes · Wren Boone · Cal Pruitt · Dot Jr.

### Characters (12) — antagonists with agendas
| Character | Role | Agenda (mini-game) | Fires |
|---|---|---|---|
| Mayor Crabtree | Politics | Legacy project gets built | favor / pressure; takes donations |
| Inspector Grit | Code enforcement | Most violations written | failed-inspection incidents |
| Dwight Folsom | Banker | Lend safe, call shaky loans | credit line / loan-call |
| Dot | Diner / gossip | Be the info hub | word-of-mouth deck modifiers |
| Sven Svenson | Lumber vendor | Move materials at margin | supplier accounts, price hikes |
| Old Man Hettrick | Cheapskate client | Pay as little as possible | disputes every bill |
| Marge Tolliver | Assessor | Maximize the tax roll | reassessment / depreciation audits |
| Eunice Vale | BBB chair | A clean, orderly town | the BOTY award; complaint sanctions |
| Hal Ramsey | Chamber president | Grow local commerce | grants, networking favors |
| The Developer | Big projects | Build big, pay slow | tenders, liquidated damages |
| Chief Boon | Fire / safety | Nobody gets hurt | emergencies, safety write-ups |
| The Newcomer | Wildcard | ??? | unpredictable world cards |

### Buildings (40) — category · owner · breaks-by-trade
**Downtown retail:** Dot's Diner (Dot · Plmb/Elec/HVAC) · First Hollow Bank (Folsom · Elec/HVAC/Mech)
· Hollow Hardware (Ramsey · Elec/Plmb) · Maple Pharmacy (Elec/HVAC) · Bijou Theater (Elec/HVAC/Weld)
· Crabtree General Store (Crabtree · Plmb/Elec) · The Barbershop (Plmb/Elec) · Post Office (HVAC/Elec)
**Rural agricultural:** Crabtree Grain Elevator (Crabtree · Mech/Elec/Weld) · Bramble Family Farm
(Bramble · Plmb/Mech/Weld) · Olafsson Dairy Barn (Olafsson · Plmb/Elec/HVAC) · Old Hollis Orchard
(Hollis · Mech/Plmb) · Tucker Cattle Ranch (Tucker · Weld/Mech) · Feed & Seed Co-op (Elec/Mech) ·
Vale Vineyard (Vale · Plmb/Elec) · County Fairgrounds (Elec/Plmb/Weld)
**Industrial / commercial:** Hollis Mill (Hollis · Weld/Pipe/Elec/Mech) · Svenson Lumber Yard
(Svenson · Mech/Elec/Weld) · Maple Auto Shop (Mech/HVAC/Weld) · Cold Storage Warehouse
(HVAC/Pipe/Elec) · Pruitt Welding & Fab (Pruitt · Weld/Pipe) · Grain Processing Plant
(Pipe/Elec/Mech) · Water Treatment Plant (City · Pipe/Plmb/Elec) · The Rail Depot (Weld/Mech/Elec)
**Civic:** Courthouse (HVAC/Elec/Plmb) · City Hall (Crabtree · Elec/HVAC/Plmb) · County Hospital
(Pipe/HVAC/Elec/Plmb) · Fire Hall (Boon · Mech/Elec/Plmb) · Hollow Elementary (HVAC/Plmb/Elec) ·
Public Library (HVAC/Elec) · Community Center (Ramsey · Elec/Plmb/HVAC) · Sheriff's Office (Elec/HVAC)
**Urban residential:** The Lundgren place (Lundgren · Plmb/HVAC) · Hettrick's house (Hettrick ·
Plmb/Elec) · The Marsh duplex (Marsh · Elec/Plmb) · The Parsonage (Boon · HVAC/Plmb) · The Vale
family home (Vale · Elec/HVAC) · The old Vance place (Newcomer · Plmb/Elec/HVAC) · Maple Court
Apartments (Folsom · Plmb/Elec/HVAC) · The Folsom estate (Folsom · Elec/HVAC/Plmb/Mech)

### Equipment (40)
**10 generic basics (any trade):** hand-tool kit · extension ladder · work truck · portable
generator · air compressor · shop vacuum · power-tool set · PPE/safety kit · jobsite trailer · light tower
**5 pro rigs per trade (30):**
| Trade | Pro rigs |
|---|---|
| Mechanic | 2-post hoist · diagnostic scanner · tire machine · brake lathe · AC recovery unit |
| Plumber | hydro-jetter · pipe-threading machine · drain camera · trenching rig · press-fit system |
| Electrician | wire tugger · thermal scanner · bucket truck · conduit bender · generator hookup rig |
| Pipefitter | orbital welder · bevel machine · hydrostatic test pump · fusion welder · rigging hoist set |
| Welder | MIG/TIG station · plasma cutter · structural jig table · engine-driven welder · beam-line cutter |
| HVAC | recovery/charging station · ductwork roller · vacuum pump rig · rooftop lift · refrigerant analyzer |

### Shops (18) — 3 tiers × 6 trades
Garage (cap 2, low rent) → Shop+ (cap ~4, mid) → Warehouse (cap 6, high). Each is your own building
and carries incident cards (self-work → capitalise to 1600).

### Big projects (5) — phases → trades
| Project | Location | Phases (trades) |
|---|---|---|
| Maple Tower | Downtown | Foundation (Weld/Pipe) → Frame (Weld) → Systems (Plmb/Elec/HVAC) → Finish (Elec/Mech) |
| Hollow Crossing Center | Commercial | Sitework (Mech/Weld) → Shells (Weld/Elec) → Fit-out (Plmb/Elec/HVAC) → Signage (Elec) |
| City Hall Renovation | Civic | Abatement (Pipe/Plmb) → Mechanical (HVAC/Pipe) → Electrical (Elec) → Restoration (Mech) |
| County Hospital Wing | Civic | Foundation (Weld/Pipe) → Med-gas (Pipe/Plmb) → Clean HVAC (HVAC) → Power & finish (Elec) |
| Hunting & Fishing Lodge | Rural | Site & well (Plmb/Mech) → Timber frame (Weld) → Systems (Elec/HVAC) → Docks (Weld/Mech) |

### Seasonal events (50) — the town-life calendar (drives the videos)
**Spring (11):** First Thaw · Maple Syrup Boil · Easter Egg Hunt · Spring Planting · Little League
Opening Day · Mud Season · Town Cleanup Day · Garden Club Plant Sale · Prom Night · Mother's Day ·
Memorial Day Parade
**Summer (11):** Farmers Market Opens · Fourth of July Fireworks · County Fair · Fishing Derby ·
Drive-in Movie Night · Church Picnic · Little League Championship · Strawberry Social · Concert in
the Park · Soapbox Derby · Demolition Derby
**Fall (11):** Harvest Festival · Halloween Festival · Homecoming Game · Apple Picking · The Corn
Maze · Thanksgiving · First Frost · Hunting Season Opens · Leaf-Peeping Weekend · Chili Cook-off ·
Election Day
**Winter (11):** First Snowfall · Christmas Parade · Tree Lighting · New Year's Eve · Ice Fishing ·
Winter Carnival · Sledding on Crabtree Hill · Caroling · Valentine's Dance · Groundhog Day · Snow Day
**Weather / shocks (6):** Storm of the Decade · Spring Flood · Heat Wave · Ice Storm · Power Outage ·
Tornado Warning

---

## 4. The card catalog (~60 generic designs)
Type key: I=Incident · F=Fortune · P=Play/hand · M=Personal-persistent · G=Global. JE shown where a
transaction occurs.

### A. Tradesperson — working life (F / M)
| Card | Type | Effect | JE |
|---|---|---|---|
| Took his holiday | M (timer 1–2) | a worker off; capacity −1; still on payroll | Dr 6100 / Cr 1000 |
| Injured — workers' comp | M (condition) | worker down until recovered; pay claim (or deductible) | Dr 6900 / Cr 1000 |
| Sick day | M (timer 1) | brief capacity −1 | — |
| A tradesperson retires | F | lose a worker, hire a replacement | Dr 5000 / Cr 1000 |
| Poached! | F (hostile) | city/rival lures your worker unless you match a raise | Dr 6100 / Cr 1000 |
| Certification earned | M (standing) | pay training → unlocks a pro rig / +speed | Dr 6500 / Cr 1000 |
| Mandatory birthday | F | per-worker morale cost | Dr 6600 / Cr 1000 |

### B. Equipment (F / M)
| Card | Type | Effect | JE |
|---|---|---|---|
| Equipment breakdown | M (condition) | rig's speed suppressed until fixed | fix: Dr 7200 / Cr 1000 (or deductible) |
| Tool theft | F | lose a rig unless insured | Dr 6900 / Cr 1500 |
| Depreciation audit | F | per-equipment depreciation | Dr 7000 / Cr 1550 |
| Manufacturer recall | M (condition) | rig unusable until serviced (a turn down, free) | — |
| Warranty claim | F (+) | a breakdown fixed free | — |
| Efficiency award / patent | F (+) | per-equipment cash | Dr 1000 / Cr 4100 |
| Trade-in upgrade | P | swap a basic for a pro at a discount | asset swap (1500) |

### C. Building incidents — the work engine (I)
Skinned by the 40 buildings; owner is the customer (NPC pays) — unless it's *your* shop.
| Card | Spawns | JE (on completion) |
|---|---|---|
| Waterline break | plumber tender | Dr 1100 / Cr 4000; costs Dr 5000/5100 |
| Wiring / panel fault | electrician tender | " |
| Rooftop unit down | HVAC tender | " |
| Structural / steel repair | welder tender | " |
| Pipe-system leak | pipefitter tender | " |
| Mechanical breakdown | mechanic tender | " |
| Multi-trade disaster (fire/storm) | 2–4 tenders | the big collaborative job |
| Service contract | recurring small tenders (M, standing) | steady revenue |
| Renovation | a multi-phase mini-project | phased tenders |
| *(your own shop)* | self-work | Dr **1600** / Cr 1000 *(capital, not expense)* |

### D. Characters — agendas, rewards, antagonism (G / M / F + reward)
| Card | Source · Type | Effect | JE |
|---|---|---|---|
| Re-election drive | Mayor · G | donate → earn a favor; refuse → pressure | Dr 6600 / Cr 1000 |
| Surprise inspection | Inspector · F | roll → code-violation persistent until fixed | fix: Dr 7200 / Cr 1000 |
| Variance granted | Inspector · reward | clear a compliance card | — |
| Line of credit | Banker · M | cash now → liability + interest | Dr 1000 / Cr 2100; int Dr 6800 |
| Loan called | Banker · F | weak books → repay now | Dr 2100 / Cr 1000 |
| Word of mouth | Dot · M | good service → inject incidents; bad → thin them | — (deck reshaper) |
| Supplier account | Svenson · M | cheaper materials, recurring AP | Dr 5200 / Cr 2000 |
| Price hike | Svenson · G | COGS up this season | (raises 5200) |
| Disputed invoice | Hettrick · F | refuses to pay a tender → bad debt | Dr 7100 / Cr 1100 |
| Reassessment | Assessor · F | property tax / extra depreciation | Dr 6400 / Cr 2300 |
| Complaint filed | BBB · M (condition) | reputation penalty until you make it right | — |
| Small-business grant | Chamber · F (+) | conditional cash | Dr 1000 / Cr 4100 |
| Networking lunch | Chamber · reward | a Play card + a meal cost | Dr 6600 / Cr 1000 |
| Emergency call | Boon · I | urgent high-pay job, tight deadline | Dr 1100 / Cr 4000 |
| Liquidated damages | Developer · F | botched a phase → penalty | Dr 6900 / Cr 1000 |
| Strange doings | Newcomer · G | a wildcard, different each year | — |

### E. Seasonal events — atmosphere + a light effect (F / G)
The 50 events skin onto ~6 templates (most pure video flavor):
| Template | Type | Effect | JE |
|---|---|---|---|
| Festival / fair | F (+) | a booth → small income + job-draw boost | Dr 1000 / Cr 4100 |
| Holiday | F | crew time-off (cap −1) + gifts/M&E + goodwill | Dr 6600 / Cr 1000 |
| Parade / game | F | atmosphere + an advertising opening | — |
| Weather shock | G | spawns multi-trade damage + slows work + utilities up | — |
| Winter sets in | G (season) | more breakdowns, slower work, hydro up | Dr 6300 / Cr 1000 |
| Election day | G | ties into the Mayor's agenda | — |

### F. Big projects (I / G)
| Card | Type | Effect |
|---|---|---|
| Project kickoff | G | the boom begins; injects phase tenders over the year |
| Phase tender | I | a contested big job (specific trades) |
| Topping out / ribbon cutting | F (+) | completion bonus + reputation + side-award progress |
| Liquidated damages | F | botch a phase → penalty |

### G. Business services — bought, persistent overhead (M)
| Card | Effect | JE |
|---|---|---|
| Insurance policy | premium each turn; shocks/breakdowns → deductibles | Dr 6200 / Cr 1000 (prepaid 1200) |
| Marketing campaign | inject incidents into your deck | Dr 6700 / Cr 1000 |
| Accountant on retainer | audit shield / better factoring / cleaner books | Dr 6800 / Cr 1000 |
| Supplier account | lower COGS | Dr 5200 / Cr 2000 |
| Training program | crew speed up | Dr 6500 / Cr 1000 |
| Line of credit | cash now, liability + interest | Dr 1000 / Cr 2100 |

### H. Play / hand cards — earned rewards, one-shot (P)
| Card | Effect |
|---|---|
| Slick lawyer | reactive: ±2 getaway in a court/sue/damages window |
| Rush | finish / advance your job |
| Buy time | extend your deadline |
| Sabotage | set back a rival's job |
| Favor | nudge a persistent's clock — −1/cancel a positive, +1/red-tape a negative (scarce + counterable) |
| Permit fast-track | skip an inspection / clear a compliance card |
| Cash grant | a small windfall reward |

---

## 5. Build order (when we start coding)
Thin vertical slice first — prove the loop & the accounting are fun before the full catalog:
1. **G/L + P&L** (every existing transaction posts a JE; 4th tab renders the P&L).
2. **Incident → tenders** reframe + self-work capitalises to 1600 (minimal Balance Sheet).
3. **Two world cards** end-to-end: insurance→deductible, marketing→deck injection (the persistent +
   verb-set machinery), plus **Favor**.
4. Then go object-by-object filling the card catalog, and **balance** via the harness.

Parked for later / expansions: NPC institution agendas (reactive triggers), the full character
mini-games, Cash Flow statement, side-awards, online (M3).
