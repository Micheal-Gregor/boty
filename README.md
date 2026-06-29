# Business of the Year (Order to Cash)

A turn-based business game for **1–6 players** — run a small service trade in the town of
Maple Hollow and fight to be named the local BBB's **Business of the Year** (most cash at the
end of the fiscal year). Online multiplayer, web-first, with the engine shared by the client
and a server-authoritative backend.

This is a **monorepo**:

```
packages/engine/   the game engine — pure rules + content + the proof suite. Runs in Node,
                   the browser, and Deno. This is the single source of truth for the rules.
apps/web/          the Svelte 5 client (built & playable: solo-vs-AI, Supabase login, full art + audio).
docs/              design + planning docs.
PROJECT-PLAN.md    the roadmap: module strategy, online architecture, milestones.
```

## Run the engine (Node)

```bash
cd packages/engine
npm test     # the Stage 1–4 proof suite (zero dependencies)
npm start    # play the terminal version (a reference client)
npm run tune # the Stage 5 balancing harness (simulated games, dial readouts)
```

Or from the repo root: `npm test`, `npm start`, `npm run tune`.

## Using the engine as a module

```js
import { Game } from "@boty/engine";                 // pure, browser-safe
import { loadEconomy, loadDecks } from "@boty/engine/content-fs"; // Node-only loaders

const economy = await loadEconomy();
const decks = await loadDecks();
const game = new Game(economy, [{ name: "Ana", service: "mechanic" }], { ...decks, seed: 1 });
let ctx = game.start();
// ...drive the game through game.<method>() calls; illegal moves throw GameError.
```

In the browser (Vite), import the JSON directly and pass it to `Game` instead of using the
Node loaders — the engine core never touches the filesystem.

See [PROJECT-PLAN.md](PROJECT-PLAN.md) for the full roadmap and the engine package's own
[README](packages/engine/README.md) for the game design and rules.
