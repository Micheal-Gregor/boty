<script>
  import { ui, act, endTurn, isAI } from "../lib/store.js";
  import { seasonFor, findBuilding, findEquipment } from "@boty/engine";
  import Shop from "../components/Shop.svelte";

  const s = $derived($ui.game?.state);
  const econ = $derived($ui.economy);
  const me = $derived(s ? s.players[s.activePlayerIndex] : null);
  const season = $derived(s ? seasonFor(s) : null);
  const drawn = $derived($ui.ctx?.drawn ?? []);
  const rivals = $derived(s ? s.players.filter((_, i) => i !== s.activePlayerIndex) : []);
  const logTail = $derived(s ? s.log.slice(-6) : []);

  const nextBuilding = $derived.by(() => {
    if (!me) return null;
    const here = findBuilding(econ, me.building);
    return econ.buildings.find((b) => (b.tier ?? 1) === (here.tier ?? 1) + 1) ?? null;
  });
  const handHas = (type) => me?.hand.some((c) => c.type === type);
</script>

<div class="board">
  <header class="banner">
    <span class="town">{$ui.flavor?.town ?? "Order to Cash"}</span>
    <span class="season">{season?.name}</span>
    <span class="round">round {s.turn} / {econ.max_turns}</span>
    <span class="turn">▶ {me.name}'s turn</span>
  </header>

  <div class="columns">
    <!-- Community / Fortune -->
    <section class="panel community">
      <h2>Fortune</h2>
      {#if drawn.length}
        {#each drawn as d}
          <div class="card fortune">
            <div class="art-slot">[art: {d.name}]</div>
            <div class="card-name">{d.name}</div>
            {#if d.flavor}<div class="flavor">“{d.flavor}”</div>{/if}
            <div class="effect">{d.text}</div>
          </div>
        {/each}
      {:else}
        <p class="muted">No cards drawn this turn.</p>
      {/if}
      <h3>Table log</h3>
      <ul class="log">{#each logTail as line}<li>{line}</li>{/each}</ul>
    </section>

    <!-- Your shop -->
    <section class="panel">
      <Shop player={me} {econ} {handHas} {nextBuilding} />
      {#if $ui.error}<p class="error">✗ {$ui.error}</p>{/if}
      <div class="actions">
        <button onclick={() => act((g) => g.hire())}>Hire (+1)</button>
        <button onclick={() => act((g) => g.buyEquipment("basic"))}>Buy Basic Tools</button>
        <button onclick={() => act((g) => g.buyEquipment("pro"))}>Buy Pro Rig</button>
        <button onclick={() => act((g) => g.rentEquipment("basic"))}>Rent Basic</button>
        <button onclick={() => act((g) => g.rentEquipment("pro"))}>Rent Pro</button>
        {#if nextBuilding}
          <button onclick={() => act((g) => g.relocate(nextBuilding.id))}>Move → {nextBuilding.name}</button>
        {/if}
        <button class="end" onclick={endTurn}>End turn ▶</button>
      </div>
    </section>

    <!-- Rivals (open books) -->
    <section class="panel rivals">
      <h2>The table (open books)</h2>
      {#each rivals as r}
        <div class="rival" class:bankrupt={r.bankrupt}>
          <strong>{r.name}</strong> {isAI(r.id) ? "🤖" : "🧑"}
          <span>{r.cash} W</span>
          <span class="muted">{findBuilding(econ, r.building).name} · {r.tradesmen.length} crew · {r.jobs.length} jobs</span>
          {#if r.bankrupt}<span class="tag">bankrupt</span>{/if}
        </div>
      {/each}
    </section>
  </div>
</div>
