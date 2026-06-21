# Maple Hollow — art & sound asset plan

This is the generation checklist for bringing Maple Hollow to life. The game engine is done; art
and sound are a **layer on top** that attaches to game entities by a stable **ID**. You generate an
asset in Grok, drop it at the right path, and it appears — **no code change per asset.**

## How it works

Drop a file at:

```
apps/web/src/assets/art/<kind>/<id>.<ext>        # webp preferred; png / jpg / svg also work
apps/web/src/assets/sound/<kind>/<id>.<ext>      # mp3 / ogg / m4a (sound pipeline, E3)
```

`<kind>` may be nested (e.g. `building/civic`, `shop/plumber/garage`). The UI looks up
`kind/id`; until a file exists it shows a labeled placeholder slot (which doubles as the
shot-list). Optional richer metadata (animation frames, caption, linked sound, seasonal variant)
lives in `apps/web/src/assets/manifest.json` keyed by `kind/id` — but a plain image needs no entry.

- **Format:** export `.webp` at ~1024px on the long edge for scenes, ~512px for portraits/cards,
  ~256px for icons/equipment. Keep file size modest (these ship in the bundle).
- **Naming:** lowercase, kebab-case IDs that match the game's IDs where one exists
  (e.g. card `code_violation` → `card/code_violation.webp`; trade `HVAC technician` →
  folder `hvac` — see the trade slugs below).
- **Animation (E3):** drop a short loop as `.webp`/`.gif`, or a sprite sheet + a `manifest.json`
  entry; details when we wire the animation phase.

Trade slugs: `mechanic`, `plumber`, `electrician`, `pipefitter`, `welder`, `hvac`.

## Catalog

| Folder (`art/…`) | What | Target count | Attaches to |
|---|---|---|---|
| `town/<season>/` | Main-street & town scenes per season (`spring`/`summer`/`fall`/`winter`) | ~12 (3 ea.) | Table tab backdrop |
| `crew/` | Tradesperson portraits (the hiring pool) | 50 | each hired tradesman, persistent |
| `shop/<trade>/<tier>/` | Each trade's Garage / Shop+ / Warehouse (`garage`/`shop`/`warehouse`) | 18 (6×3) | Shop tab header |
| `equipment/<trade>/` | Basic + pro rigs, tailored per trade (variants ok) | ~50 | equipment instances |
| `building/civic/` | City hall, courthouse, library, fire hall… | 10 | job & event locations |
| `building/business/` | Downtown shops, diner, bank, hardware… | 20 | job & event locations |
| `building/ag/` | Barns, grain elevator, mill… | 10 | job & event locations |
| `building/commercial/` | Strip mall, warehouses, garages… | 10 | job & event locations |
| `character/` | Townsfolk — clients, officials, wild cards | 25 | event/service/job givers |
| `event/` | Windfall / shock / civil / ambient moments (still + later anim) | 50 | fortune & civil cards |
| `card/` | Non-job fortune card faces (windfall/shock/gift/summons/payable/defect) | ~20 | those card IDs |
| `project/` | The five marquee BIG PROJECTS (World track) | 5 | shared big-job pool |

### Big projects (World track — art useful now, mechanic later)
`project/tower`, `project/shopping-center`, `project/city-hall`, `project/hospital`,
`project/lodge` (Hunting & Fishing Lodge).

### Sound (E3 — wired; drop files and they play)
The game already calls these IDs — drop a matching file and it sounds, no code change:

| Path | Fires when |
|---|---|
| `sound/music/spring.<ext>` (also `summer`, `fall`, `winter`) | the seasonal ambient loop, switches as the year turns |
| `sound/sfx/deal.<ext>` | the Fortune deck deals your cards |
| `sound/sfx/flip.<ext>` | you open a card's detail |
| `sound/sfx/gavel.<ext>` | a court / sue / damages / settlement window opens |
| `sound/sfx/click.<ext>` | a shop action lands (hire, buy, factor, pay…) — keep this one subtle |
| `sound/sfx/chime.<ext>` | the year ends — the Gala |

More SFX can be added later (cash chime on collect, hammer on job complete, bankruptcy knell) by
wiring a new `playSfx("id")` call. Formats: `.mp3` / `.ogg` / `.m4a` / `.wav`. A mute toggle in the
header (persisted) and the browser autoplay gate (sound unlocks on the Start click) are handled.

## Existing IDs to match

Cards/defects that already have IDs (use these exact slugs for `card/<id>` or `event/<id>`):
`insurance_payout`, `referral_bonus`, `old_client`, `tax_refund`, `trade_feature`, `county_fair`,
`equipment_breakdown`, `supplier_invoice`, `bad_weather`, `file_patent`, `equipment_award`,
`depreciation`, `birthday`, `profit_share`, `retirement`, `vendor_contract`, `supply_credit`,
`lease_payment`, `networking_lunch`, `courthouse_day`, `code_violation`, `osha_writeup`.

Job cards (if you want per-job art under `card/`): `brake_job`, `emergency_leak`,
`plumbing_call`, `wiring_call`, `water_heater`, `panel_upgrade`, `warehouse_fit`,
`rooftop_hvac`, `tower_fitout`.

## Tone
Maple Hollow is **Twin Peaks-wholesome** — friendly small-town Americana on the surface, with an
undercurrent of rivalry and trouble. Recurring cast to keep consistent: the **Pettigrew brothers**
(rivals), **Old Man Hettrick** (cheapskate), **Mayor Crabtree**, **Dot's Diner** (gossip), the
**Hollis mill**, **Svenson's** lumber yard, **Old Vern** (retiree).
