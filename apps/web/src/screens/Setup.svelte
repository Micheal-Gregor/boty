<script>
  import { newGame, services, backToMenu } from "../lib/store.js";

  const strategies = [
    { id: "balanced", label: "Balanced" },
    { id: "equipment", label: "Equipment specialist" },
    { id: "labor", label: "Labor shop" },
  ];
  const aiNames = ["Pettigrew Bros.", "Dot's Crew", "Crabtree Contracting", "Hollis & Sons", "Lundgren Trades"];

  const tiers = [
    { id: "steady", label: "Steady", blurb: "Dot's good word flows freely, bad word rarely bites, and you start with a little extra runway. A forgiving year." },
    { id: "standard", label: "Standard", blurb: "An even-handed Maple Hollow — word of mouth cuts both ways. The intended balance." },
    { id: "cutthroat", label: "Cutthroat", blurb: "Dot's word dries up, Hettrick & Lundgren never forget a slight, and you open lean. Only the sharp survive." },
  ];
  let difficulty = $state("standard");

  let count = $state(3);
  // One seat row per possible player; we slice to `count` on start.
  let seats = $state(
    Array.from({ length: 6 }, (_, i) => ({
      name: i === 0 ? "You" : aiNames[i - 1] ?? `Rival ${i}`,
      kind: i === 0 ? "human" : "ai",
      strategy: "balanced",
      service: services[i % services.length],
    })),
  );

  // Every trade is taken at most once. Pick a trade another seat holds and they SWAP onto the one
  // you just vacated (so it's an unused trade). Humans get priority simply by being the one who picks.
  function pickService(i, svc) {
    const old = seats[i].service;
    for (let j = 0; j < count; j++) if (j !== i && seats[j].service === svc) seats[j].service = old;
    seats[i].service = svc;
    seats = seats; // nudge reactivity
  }

  function start() {
    const chosen = seats.slice(0, count).map((s) => ({
      name: s.name.trim() || "Player",
      service: s.service,
      strategy: s.kind === "ai" ? s.strategy : null,
    }));
    newGame(chosen, difficulty);
  }
</script>

<section class="setup">
  <button class="back" onclick={backToMenu}>← Menu</button>
  <h1>BBB Business of the Year</h1>
  <p class="tagline">Run a trade in Maple Hollow. Be named <strong>Business of the Year</strong>.</p>

  <label class="count">
    Players:
    <select bind:value={count}>
      {#each [1, 2, 3, 4, 5, 6] as n}<option value={n}>{n}</option>{/each}
    </select>
  </label>

  <div class="seats">
    {#each seats.slice(0, count) as seat, i}
      <div class="seat">
        <span class="seat-no">{i + 1}</span>
        <input class="name" bind:value={seat.name} />
        <select bind:value={seat.kind}>
          <option value="human">Human</option>
          <option value="ai">AI</option>
        </select>
        <select value={seat.service} onchange={(e) => pickService(i, e.currentTarget.value)}>
          {#each services as svc}<option value={svc}>{svc}</option>{/each}
        </select>
        {#if seat.kind === "ai"}
          <select bind:value={seat.strategy}>
            {#each strategies as st}<option value={st.id}>{st.label}</option>{/each}
          </select>
        {:else}
          <span class="human-tag">— human seat</span>
        {/if}
      </div>
    {/each}
  </div>

  <div class="difficulty">
    <span class="dlabel">Difficulty</span>
    <div class="tiers">
      {#each tiers as t}
        <button class="tier" class:on={difficulty === t.id} onclick={() => (difficulty = t.id)}>{t.label}</button>
      {/each}
    </div>
    <p class="blurb">{tiers.find((t) => t.id === difficulty)?.blurb}</p>
  </div>

  <button class="start" onclick={start}>Start the year ▶</button>
</section>

<style>
  .difficulty { margin: 18px 0 6px; }
  .dlabel { font-weight: 700; color: var(--muted, #9aa0aa); font-size: 0.9em; }
  .tiers { display: flex; gap: 8px; margin: 8px 0; }
  .tier { flex: 1; padding: 9px; border-radius: 8px; background: var(--panel-2, #1b1f27); color: var(--ink, #e7e7ea); border: 1px solid var(--line, #2a2f3a); font-weight: 700; cursor: pointer; }
  .tier.on { background: var(--accent, #e0b341); color: #1a1a1a; border-color: var(--accent, #e0b341); }
  .blurb { color: var(--muted, #9aa0aa); font-size: 0.86em; min-height: 2.4em; margin: 4px 0 0; }
  .back { background: none; border: 1px solid var(--line, #2a2f3a); color: var(--muted, #9aa0aa); border-radius: 8px; padding: 6px 12px; cursor: pointer; margin-bottom: 10px; }
  .back:hover { color: var(--accent, #e0b341); border-color: var(--accent, #e0b341); }
</style>
