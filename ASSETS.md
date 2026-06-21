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
- **Card format = image first, animation second.** Every card is *title · flavor · thumbnail
  still → tap to enlarge → ≤6s animation*. The **still is what the game needs**; the animation is
  the enhancement (a second pass on the cinematic assets). Drop the still now, the animation later.

Trade slugs: `mechanic`, `plumber`, `electrician`, `pipefitter`, `welder`, `hvac`.

## The key rule: cards inherit object art

The ~60 card *designs* need **zero dedicated art** — a card shows the image of the **object it
skins**: a building incident shows the *building*, a crew card shows the *tradesperson's portrait*,
a character card shows the *character*, a seasonal event shows the *event*. So your art workload is
**the object catalog + the hand-card deck**, not the cards. Only the **play/hand cards** (and a few
abstract **service cards**) get their own art, because they aren't tied to a physical object.

See `WORLD.md` for the full object catalog and the card list that rides on it.

## Catalog (basic edition — ~218 unique visuals)

Objects the cards ride on:

| Folder (`art/…`) | What | Count | Attaches to |
|---|---|---|---|
| `town/<season>/` | Base main-street backdrop per season (`spring`/`summer`/`fall`/`winter`) | 4 | Table tab backdrop |
| `crew/` | Tradesperson portraits (the hiring pool) | 40 | each hired tradesman *(trim to ~20 if heavy)* |
| `character/` | The 12 named townsfolk / antagonists | 12 | character cards |
| `building/downtown/` | Downtown retail (diner, bank, hardware…) | 8 | incidents |
| `building/ag/` | Rural agricultural (farms, barns, elevator…) | 8 | incidents |
| `building/industrial/` | Industrial / commercial (mill, lumber yard, plants…) | 8 | incidents |
| `building/civic/` | Civic (city hall, courthouse, hospital, fire hall…) | 8 | incidents |
| `building/residential/` | Urban residential homes & apartments | 8 | incidents |
| `equipment/` | 10 generic basics + 30 pro rigs (`equipment/<trade>/…`) | 40 | equipment instances |
| `shop/<trade>/<tier>/` | Garage / Shop+ / Warehouse per trade | 18 (6×3) | Shop tab header |
| `project/` | The 5 big projects (hero shot; phase art optional) | 5 | big-project tenders |
| `event/` | The 50 seasonal events (the immersion core) | 50 | seasonal Fortune cards |
| **Objects subtotal** | | **209** | every card reuses these |

Card-specific art (the only cards that need their own image):

| Folder (`art/…`) | What | Count |
|---|---|---|
| `card/play/` | Slick lawyer, rush, buy-time, sabotage, favor, permit, grant | 7 |
| `card/service/` | Insurance, marketing, accountant, supplier account, training, line of credit *(or reuse a character)* | ~6 |

**Total ≈ 220 stills**, of which the cinematic ones (~70: the 50 events + 12 characters + 5
projects) most reward a ≤6s animation. **Lean first pass ≈ 150** (crew→20, pros→~3/trade, hero-only
projects); full immersion ≈ 220 stills + ~70 animations. The game is fully playable at **zero** art
(placeholders), so generate in priority order and fill in.

### Big project IDs
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
