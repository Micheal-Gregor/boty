<script>
  import { newGame, services } from "../lib/store.js";

  const strategies = [
    { id: "balanced", label: "Balanced" },
    { id: "equipment", label: "Equipment specialist" },
    { id: "labor", label: "Labor shop" },
  ];
  const aiNames = ["Pettigrew Bros.", "Dot's Crew", "Crabtree Contracting", "Hollis & Sons", "Lundgren Trades"];

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

  function start() {
    const chosen = seats.slice(0, count).map((s) => ({
      name: s.name.trim() || "Player",
      service: s.service,
      strategy: s.kind === "ai" ? s.strategy : null,
    }));
    newGame(chosen);
  }
</script>

<section class="setup">
  <h1>Order to Cash</h1>
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
        <select bind:value={seat.service}>
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

  <button class="start" onclick={start}>Start the year ▶</button>
</section>
