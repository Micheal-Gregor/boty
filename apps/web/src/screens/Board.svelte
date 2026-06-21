<script>
  import { ui, act, endTurn, isAI, startPick, viewCard, cardInLine } from "../lib/store.js";
  import { seasonFor, findBuilding } from "@boty/engine";
  import Shop from "../components/Shop.svelte";
  import Art from "../components/Art.svelte";

  // Which play-area is showing on a phone. On wide screens all three are columns and this is moot.
  let tab = $state("shop");

  const s = $derived($ui.view);
  const econ = $derived($ui.economy);
  const me = $derived(s ? s.players[s.activePlayerIndex] : null);
  const season = $derived(s ? seasonFor({ turn: s.turn, economy: econ, flavor: $ui.flavor }) : null);
  const seasonSlug = $derived(season ? season.name.toLowerCase() : "spring");
  const drawn = $derived($ui.ctx?.drawn ?? []);
  const rivals = $derived(s ? s.players.filter((_, i) => i !== s.activePlayerIndex) : []);
  const logTail = $derived(s ? s.log.slice(-8) : []);

  const nextBuilding = $derived.by(() => {
    if (!me) return null;
    const here = findBuilding(econ, me.building);
    return econ.buildings.find((b) => (b.tier ?? 1) === (here.tier ?? 1) + 1) ?? null;
  });
  const handHas = (type) => me?.hand.some((c) => c.type === type);
  // Trade → art slug (most services are one word; HVAC technician is the exception).
  const tradeSlug = (svc) => (svc === "HVAC technician" ? "hvac" : svc.toLowerCase());

  // On a fresh turn that dealt cards, flip to the Fortune tab so you watch the draw, then you
  // tap over to your shop to act. (On wide screens all three are columns, so this is a no-op.)
  let lastSig = $state("");
  $effect(() => {
    const sig = s ? `${s.turn}:${s.activePlayerIndex}` : "";
    if (sig && sig !== lastSig) {
      lastSig = sig;
      if (drawn.length) tab = "fortune";
    }
  });
</script>

<div class="board">
  <header class="banner">
    <span class="town">{$ui.flavor?.town ?? "Order to Cash"}</span>
    <span class="season">{season?.name}</span>
    <span class="round">round {s.turn} / {econ.max_turns}</span>
    <span class="turn">▶ {me.name}'s turn</span>
  </header>

  {#if $ui.aiActing}
    <div class="ai-banner">🤖 {$ui.aiActing} is working the phones…</div>
  {/if}

  <div class="tabs">
    <!-- TABLE: the town stage + the open books + the running log -->
    <section class="tabview" class:active={tab === "table"}>
      <div class="town-stage">
        <Art kind={`town/${seasonSlug}`} id="mainst" label={`${season?.name ?? ""} — Maple Hollow`} />
      </div>
      <h2>The table</h2>
      <div class="rivals">
        {#each rivals as r}
          <div class="rival" class:bankrupt={r.bankrupt}>
            <strong>{r.name}</strong> {isAI(r.id) ? "🤖" : "🧑"}
            <span class="cash">{r.cash} W</span>
            <span class="muted">{findBuilding(econ, r.building).name} · {r.tradesmen.length} crew · {r.jobs.length} jobs</span>
            {#if r.bankrupt}<span class="tag">bankrupt</span>{/if}
          </div>
        {/each}
      </div>
      <h3>Table log</h3>
      <ul class="log">
        {#each logTail as line}
          {@const card = cardInLine(line)}
          {#if card}
            <li><button class="logline" onclick={() => viewCard(card)}>{line} <span class="peek">🃏</span></button></li>
          {:else}
            <li>{line}</li>
          {/if}
        {/each}
      </ul>
    </section>

    <!-- FORTUNE: the deck and what it dealt this turn -->
    <section class="tabview" class:active={tab === "fortune"}>
      <div class="fortune-head">
        <h2>Fortune</h2>
        <div class="deck-wrap" title="the Fortune deck">
          <span class="deck-count">{s.deckLeft} left</span>
          <div class="deck">
            <span class="deck-card"></span><span class="deck-card"></span><span class="deck-card"></span>
          </div>
        </div>
      </div>
      {#if drawn.length}
        {#each drawn as d, i (d.cardId + i)}
          <button class="card fortune dealt" style="animation-delay:{i * 140}ms" onclick={() => viewCard(d)}>
            <Art kind="card" id={d.cardId} label={d.name} />
            <div class="card-name">{d.name} <span class="peek">🔍</span></div>
            {#if d.flavor}<div class="flavor">“{d.flavor}”</div>{/if}
            <div class="effect">{d.text}</div>
          </button>
        {/each}
      {:else}
        <p class="muted">No cards drawn this turn — the deck is quiet for now.</p>
      {/if}
    </section>

    <!-- YOUR SHOP: your sheet + the action bar -->
    <section class="tabview shop-view" class:active={tab === "shop"}>
      <div class="shop-stage">
        <Art kind={`shop/${tradeSlug(me.service)}`} id={me.building} label={`${me.service} ${findBuilding(econ, me.building).name}`} small />
      </div>
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
        {#if me.hand.some((c) => c.type === "sabotage")}
          <button class="hostile" onclick={() => startPick("sabotage")}>⚔️ Sabotage…</button>
        {/if}
        <button class="hostile" onclick={() => startPick("sue")}>⚖️ Sue…</button>
        <button class="end" onclick={endTurn}>End turn ▶</button>
      </div>
    </section>
  </div>

  <!-- Bottom tab bar — phones only; wide screens show all three as columns -->
  <nav class="tabbar">
    <button class:on={tab === "table"} onclick={() => (tab = "table")}>🗺️<span>Table</span></button>
    <button class:on={tab === "fortune"} onclick={() => (tab = "fortune")}>🃏<span>Fortune</span></button>
    <button class:on={tab === "shop"} onclick={() => (tab = "shop")}>🏪<span>Your shop</span></button>
  </nav>
</div>
