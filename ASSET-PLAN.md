# Maple Hollow — asset plan v2 (pared to the basic game)

This replaces the ~220-asset vision in [ASSETS.md](ASSETS.md) with **what the game actually renders today**, plus a few small code hooks to land the ideas you care about (animated turn intros, per-trade pro gear, crew names). Pare freely — anything you cut just falls back to a labeled placeholder, nothing breaks.

**How art loads:** drop a file at `apps/web/src/assets/art/<folder>/<id>.<ext>` and it appears — no code change. Still = `.webp/.png/.jpg/.svg`; animation = `.mp4/.webm` (its first frame is the still). One asset per slot is enough; provide *both* only for the few things that animate.

**Legend:** ✅ = wired now, drop files and they show · 🔧 = I add a small code hook first (so don't bulk-generate these until it's in)

---

## At a glance — recommended counts

| # | Category | Folder | Status | Full | Lean first pass |
|---|----------|--------|--------|------|-----------------|
| 1 | **Turn-start "town comes alive"** (animated) | `townlife/` | 🔧 | **48** (2/turn) | 24 (1/turn) |
| 2 | Main Street, by season | `town/<season>/mainst` | ✅ | 4 | 4 *(done)* |
| 3 | Fortune cards (where the townsfolk & locations live) | `card/<id>` | ✅ | ~60 | ~30 |
| 4 | Crew portraits (a shared pool) | `crew/` | ✅ | 20 | 12 |
| 5 | Crew **names + flavor** (text, not art) | — | 🔧 | — | — |
| 6 | Equipment — basic (generic) | `equipment/basic` | ✅ | 2–3 | 1 |
| 7 | Equipment — **pro, per trade** | `equipment/pro/<trade>` | 🔧 | 6 | 6 |
| 8 | Shops, by trade × building | `shop/<trade>/<building>` | ✅ | 18 | 6 |

**Full set ≈ 159 stills (48 of them animated). Lean first pass ≈ 83.** Down from 220.

---

## 1. Turn-start "town comes alive" 🔧 — the immersion core
Each round opens on a slice of Maple Hollow over the year — a picture that animates. You wanted **50, tightened to 48 so each turn (×24) has two to randomly choose from.** That's the right call.
- Folder: **`townlife/`**, any filenames (it's a pool, like crew). Animated preferred (`.mp4/.webm`); a still alone is fine too.
- I'd group them **12 per season** (`townlife/spring-*`, etc.) so the scenes match the time of year — but that's optional; a flat pool works.
- **Hook I'll add:** swap the current round-intro art (today it's just the 4 `season/*` images) for a pool that picks one of the two candidates for that turn.
- Lean start: **24** (one per turn), expand to 48 later.

## 2. Main Street by season ✅ *(done)*
`town/spring/mainst`, `summer`, `fall`, `winter` — the board backdrop. You've built these.

## 3. Fortune cards ✅ — your townsfolk & locations live here
One image per card id. **This is where the named cast and places go** — there's no separate `character/` or `building/` slot; the character *is* the card art:
- **The Mayor** → `card/reelection_drive`, `card/civic_townhall`, `card/civic_firehouse`, `card/county_hospital`, `card/opera_house`
- **The inspector** → `card/code_violation`, `card/osha_writeup`, `card/surprise_inspection`
- **Dot's Diner / Dot** → `card/diner_trouble`
- …and so on. Reuse the same face across that character's cards.

The 60 ids, grouped so you can prioritize (the **job / shock / windfall / incident** rows show up most; start there):

| Type | Card ids |
|---|---|
| **job** (the bread-and-butter work) | `brake_job, emergency_call, emergency_leak, panel_upgrade, plumbing_call, rooftop_hvac, tower_fitout, warehouse_fit, water_heater, wiring_call` |
| **windfall** (good news) | `birthday, county_fair, equipment_award, file_patent, harvest_festival, insurance_payout, old_client, referral_bonus, small_business_grant, tax_refund, trade_feature` |
| **shock** (bad news) | `bad_weather, depreciation, equipment_breakdown, heat_wave, ice_storm, profit_share, storm_of_decade, supplier_invoice` |
| **incident** (a place in trouble) | `diner_trouble, downtown_storm, grange_main, mill_breakdown` |
| **crew event** (your people) | `holiday, injury, poached, sick_day, winter_holidays` |
| **defect** (the inspector) | `code_violation, osha_writeup, surprise_inspection` |
| **payable** (bills) | `lease_payment, reassessment, supply_credit, vendor_contract` |
| **subcontract / civic** (broker a job; the town) | `civic_firehouse, civic_townhall, sub_hvac, sub_repipe, sub_rewire, county_hospital, opera_house` |
| **special** | `bbb_special, courthouse_day, networking_lunch, perf_review, retirement, tool_theft, union_drive, reelection_drive` |

The cinematic ones (incidents, civic, big jobs) most reward a short animation; the routine ones can stay stills. Lean pass: illustrate the ~30 most-seen first.

## 4. Crew portraits ✅ — a shared pool
`crew/` — any filenames, assigned to workers by a stable hash. **~20 faces** comfortably covers a 6-player table with rare repeats; **12** is a fine lean start. A worker keeps its face all game.

## 5. Crew names + flavor 🔧 — the part that makes 20 faces feel like 200 people
You asked for a **name generator + random flavor** per tradesperson. That's a code feature, not art:
- **Hook I'll add:** a pool of first/last names + a pool of one-line personalities ("never misses a Monday", "great with customers, slow with paperwork"), assigned when you hire — shown on the worker card next to the pooled face. Give me a list of names/quips you like, or I'll seed a Maple-Hollow-flavored set.

## 6. Equipment — basic ✅ / pro per trade 🔧
- **Basic gear** `equipment/basic` — 1 generic image (or 2–3 variants if you want variety). ✅
- **Pro gear, specialised per trade** so a welder's rig ≠ a plumber's: `equipment/pro/<trade>` (mechanic, plumber, electrician, pipefitter, welder, hvac) = **6**. 🔧 **Hook I'll add:** key the pro-gear art by the shop's trade.

## 7. Shops ✅
`shop/<trade>/<building>` — **6 trades × 3 buildings = 18.** Trades: `mechanic, plumber, electrician, pipefitter, welder, hvac`. Buildings: `garage, shop, warehouse`. Lean: the 6 `garage` images first (every shop starts there), then add `shop`, then `warehouse`.

---

## The three code hooks I'd add (so your art lands)
1. **`townlife/` pool** for the animated turn-start intro (48 scenes, 2/turn) — replaces the 4 fixed season images.
2. **`equipment/pro/<trade>`** — per-trade pro-gear art.
3. **Crew name + flavor generator** — names & personalities assigned at hire.

Say the word and I'll build all three; then everything in this doc is "drop a file and it shows."

## Cut from the original 220 (folded in or dropped)
- `character/` (12 townsfolk) → **folded into `card/<id>`** (the character is the card art).
- `building/<category>/` (40 incident scenes) → **folded into `card/<id>`** (the incident cards).
- `event/<id>` (50 seasonal events) → these **were** `card/<id>` all along (doc drift).
- `project/` (5 big projects) → the projects became civic/subcontract/big-job **cards**, so `card/<id>`.
- `card/service/` → not a separate slot; the BBB fair is one card (`card/bbb_special`).
