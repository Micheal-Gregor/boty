# Order to Cash — Project Plan

*From prototype to product. Online multiplayer (1–6 players, up to 6 on separate devices),
web-first, packaged to app stores later. The rule of the road: **make it fun before adding
graphics**, and never let the build run ahead of a proven core.*

---

## 1. Repo & module strategy

The current prototype is a clean, well-tested game **engine** with a CLI and a tuning harness
bolted on. The plan separates the durable part (the engine) from everything that consumes it.

**Recommended layout — start with the engine as its own repo:**

```
order-to-cash-engine/      ← fresh GitHub repo: the reusable game module (this is step 1)
order-to-cash-app/         ← later: the web client (and, inside it, the Supabase functions)
```

- The **engine repo** is a publishable module: pure rules + content + loaders, no UI, no
  network, no payments. It is the single source of truth for "what is a legal move and what
  happens." Both the local web client *and* the server run the exact same engine.
- Consumers depend on it via **GitHub Packages** or a **git URL** (no need to publish public
  npm). Pin a version; bump it deliberately.
- *Alternative:* a single **monorepo** (pnpm workspaces: `packages/engine`, `apps/web`,
  `apps/server`). Easier for a solo dev — one checkout, shared tooling. Either is fine; the
  module boundary below is identical. **Decision to lock: separate repos vs monorepo.**

---

## 2. The engine module

### What's IN the module
- `src/engine/*` — economy, deck, dice, fortune, jobs, payables, litigation, cards, season,
  turn, game (the orchestrator / move-validator).
- `src/state/*` — state factories.
- `data/*.json` — economy, fortune, jobprogress, civil, flavor (content/dials).
- `test/*` — the proof suite travels with the rules it protects.

### What's OUT (these become consumers, not part of the module)
- `src/ui/cli.js`, `index.js` — the terminal client (keep as a dev tool / reference consumer).
- `tools/*` — the tuning harness and bots (a dev consumer; the bot logic may later promote
  into the module as shippable AI opponents — see §5).

### Public API (the module's `index.js` barrel exports)
- `Game` — construct with `(economy, playerSeeds, options)`; methods are the only legal moves
  (`hire`, `assignJob`, `playSabotage`, `sue`, `respondToThreat`, `endTurn`, `closeBooks`, …).
- Content loaders + factories + `GameError` + the seeded RNG/dice.
- A serializable `state` object (already plain JSON) — this is what the server persists and
  Realtime broadcasts.

### One required refactor: decouple data loading from the filesystem
Today `loadEconomy` / `loadDecks` / `loadFlavor` use Node's `fs`. That won't run in a browser
or a Supabase Edge Function (Deno). Fix:
- The engine **core** already accepts data as plain objects (decks come in via `options`).
  Keep that as the canonical path.
- Provide **two thin loaders**: `loadContentFromFs()` (Node/CLI/tests) and bundled JSON
  imports for web/Deno (`import economy from "../data/economy.json"`). Core logic stays
  environment-agnostic — runs in Node, the browser, and Deno unchanged.

### Server-authoritative is non-negotiable
Once tokens/money exist, the engine runs on the **server**; clients send *intents* and render
*state*. The engine's "throw `GameError` on anything illegal" design already is a validator —
the server just runs `game.<method>()` inside a try/catch and rejects bad intents. Never trust
a client's claimed result.

---

## 3. Phase 1 — "Fun first": the local web client (no networking, no art)

Goal: prove the game is fun on a screen, and produce the **asset spec** for Grok. Zero
networking, placeholder art.

- **Stack:** Svelte + Vite (light, fast, ideal for a card UI) — or React if you prefer the
  bigger ecosystem. **Decision to lock: Svelte vs React.**
- **Transport seam (the key to no rework):** the UI talks to a `GameTransport` interface, not
  the engine directly. Ship two implementations:
  - `LocalTransport` — runs the engine in the browser (Phase 1: pass-and-play + AI).
  - `RemoteTransport` — talks to Supabase (Phase 2). **Same UI, swapped data layer.**
- **MVP screens** (see §7 for the full list): title → main menu → game setup (seats:
  Human/AI) → board (community area · your shop with slots · ledger tabs) → year-end gala.
- **Placeholder assets:** every image/animation is a labeled empty slot. The finished slot map
  *is* Grok's shot list.

**Definition of done:** a full year is playable solo-vs-AI in a browser and it's *fun*; the
asset manifest is complete.

---

## 4. Phase 2 — Online (Supabase), free games first

Get six devices playing before money is involved.

- **Auth** — Supabase accounts.
- **Postgres tables (sketch):** `profiles`, `wallets`, `games`, `game_state(jsonb)`,
  `game_players`, `transactions`. RLS so players only touch their own games.
- **Edge Functions (Deno):** host the engine as the move-validator. Flow: client sends intent
  → function loads state → `game.method()` → on success persist new state → Realtime
  broadcasts → all clients re-render.
- **Realtime:** clients subscribe to their `game_state` row.
- **Lobby/invites:** create a game, invite up to 5 others (+ AI seats), start when ready.
- **The response window online** (Sabotage→Rush, Sue→Slick-Lawyer, out-of-turn on another
  device): server sets a `pending_threat` with a **deadline timestamp**; the target's client
  shows a prompt + countdown; they counter or pass; on timeout it auto-resolves "let it land."
  Needs careful design — it's the one genuinely hard networked interaction.

**Definition of done:** six devices complete a free online game, including a contested
sabotage and a sue, with clean turn hand-off and reconnect.

---

## 5. AI opponents (cheap — promote the harness bots)

The tuning bots (`balanced` / `equipment` / `labor`) are already working AI. Promote them into
the engine module as selectable opponents with names + difficulty (e.g. "The Pettigrew Bros."
play `labor` aggressively). Solo and "fill empty seats with AI" fall out for free, on web and
online alike. AI seats are free; human seats cost tokens.

---

## 6. Phase 3 — Token economy

- **Wallet** in Postgres; **gifting** = wallet-to-wallet transfer (internal, no store cut).
- **Paid seats:** starting an online game charges tokens per **human** seat (host pays all, or
  each invitee pays their own — both easy). AI seats free.
- **Buying tokens:** **Stripe on web** (~3% fee). On mobile you **must** use Apple/Google IAP
  (15–30% cut, their rule for digital goods) — price bundles with that in mind.
- Server validates purchases and is the only writer of wallet balances.

---

## 7. Phase 4 — Packaging & the full screen/asset/audio spec

- **Capacitor** wraps the same web app → iOS + Android (+ store IAP plugin). PWA or Tauri shell
  → Microsoft/desktop. One codebase everywhere.
- **Screens:** title · main menu · setup · board (community draw + season banner · per-player
  shop slots: tradespeople / equipment / jobs · tap-to-view detail with name·trade·**quote**)
  · ledger tabs (balance sheet · cash flow · **AR-aging** · **AP-aging**, interactive:
  pay/stretch/litigate) · year-end gala · settings.
- **Art (Grok):** pool of tradesperson portraits + equipment + shops; one image per card;
  animated versions of each; event animations (season change, slick-lawyer, litigation →
  win/fail, job complete/fail). Static by default, animated on view/trigger.
- **Audio:** SFX for clicks/actions + short situational stingers (litigation win/lose, gala
  fanfare). **No background music** (and a toggle anyway). Settings screen: separate
  SFX / music / animation-speed / mute controls.

### Make the content art-ready now (safe, inert)
Add optional fields the engine ignores but the UI reads:
- Cards: `image`, `anim`.
- Tradespeople & equipment: a **pool of identities** (name · trade · quote · portrait) the
  engine assigns on hire/purchase, giving each hire personality.

---

## 8. Milestone ladder

1. **M1 — Engine module** extracted to its own repo, fs-decoupled, tests green in CI (GitHub
   Actions), consumable as a package.
2. **M2 — Fun proven**: local web client, full year solo-vs-AI, asset manifest done.
3. **M3 — Online free play**: six devices, Supabase, contested sabotage + sue working.
4. **M4 — Tokens**: wallet, gifting, paid seats, Stripe (web).
5. **M5 — Stores**: Capacitor builds + IAP; art + audio integrated.

---

## 9. Open decisions (to lock before/within M1–M2)

- Separate repos vs **monorepo**.
- **Svelte vs React** for the client.
- Token packaging/pricing per platform (given the IAP cut).
- Online turn model details: timer length for the response window; reconnection/abandonment
  rules; what happens if a paid player drops mid-game.

---

## Parked game-design ideas (already noted; not built)
Winter "bites" (season → mechanics); holidays (tradesperson time-off + a holiday mini-game for
extra cards/cash); draw-power decoupling (last Dial-3 lever); auto-debt on undelivered forced
jobs at the buzzer.
