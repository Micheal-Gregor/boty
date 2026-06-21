<script>
  import { ui, act } from "../lib/store.js";
  import { findBuilding, findEquipment } from "@boty/engine";
  import Art from "./Art.svelte";

  let { player, econ, handHas, nextBuilding } = $props();

  const turn = $derived($ui.view?.turn ?? 0);
  const bld = $derived(findBuilding(econ, player.building));
  const idle = $derived(player.tradesmen.filter((t) => !t.assignedJob).length);
  const overhead = $derived(
    bld.rent +
      player.tradesmen.length * econ.wage_per_turn +
      player.equipment.filter((e) => !e.owned).reduce((sum, e) => sum + findEquipment(econ, e.defId).rent_per_turn, 0),
  );

  const canAssign = (j) => ["Queued", "OnHold", "Active"].includes(j.state) && j.assigned_tradesmen.length < j.max_tradesmen && idle > 0;
  const canSell = (j) => !j.hirer_id && (j.state === "Queued" || j.state === "OnHold");
  const reqs = (j) => [
    j.required_equipment ? `needs ${j.required_equipment}` : null,
    j.required_building_tier > 1 ? `tier-${j.required_building_tier} shop` : null,
    j.equipment_per_tradesman ? "tool/worker" : null,
  ].filter(Boolean).join(", ");
  // Payment terms → a familiar net-N label (a round ≈ 3 weeks; longer terms pay more, later).
  const termsLabel = (j) => {
    const t = j.terms ?? econ.invoice_terms;
    return t <= 1 ? "net-30" : t === 2 ? "net-60" : t === 3 ? "net-90" : "net-90+";
  };
  const sellPrice = (j) => Math.max(1, Math.floor(j.value * econ.sell_rate));

  // --- AR / AP aging ---------------------------------------------------------------------
  const allPlayers = $derived($ui.view?.players ?? []);
  const nameOf = (id) => allPlayers.find((p) => p.id === id)?.name ?? "a player";
  // Classify a due date relative to now. `pending` = a routed contract still being worked.
  function age(dueTurn, pending) {
    if (pending || dueTurn == null) return { txt: "in progress", cls: "pending", sort: 1e6 };
    const d = dueTurn - turn;
    if (d > 1) return { txt: `due in ${d}`, cls: "ok", sort: d };
    if (d === 1) return { txt: "due next turn", cls: "soon", sort: 1 };
    if (d === 0) return { txt: "DUE NOW", cls: "due", sort: 0 };
    return { txt: `OVERDUE by ${-d}`, cls: "overdue", sort: d };
  }
  // What you OWE: NPC vendor bills + player contracts (pending until the job is delivered).
  const apRows = $derived(
    player.payables
      .map((ap) => ({ ap, who: ap.is_npc ? ap.vendor : nameOf(ap.creditor_id), age: age(ap.due_turn, ap.pending) }))
      .sort((a, b) => a.age.sort - b.age.sort),
  );
  // What's owed TO you: own-job invoices (the client pays on time) + money other players owe you.
  const arRows = $derived(
    [
      ...player.invoices.map((inv) => ({ kind: "invoice", id: inv.id, amount: inv.amount, who: "client", age: age(inv.due_turn, false) })),
      ...allPlayers.flatMap((o) =>
        o.payables.filter((ap) => ap.creditor_id === player.id).map((ap) => ({ kind: "contract", id: ap.id, amount: ap.amount, who: o.name, age: age(ap.due_turn, ap.pending) })),
      ),
    ].sort((a, b) => a.age.sort - b.age.sort),
  );
</script>

<div class="shop">
  <h2>{player.name} <span class="trade">· {player.service}</span></h2>
  <div class="stats">
    <span class="cash">{player.cash} W</span>
    <span>{bld.name} (tier {bld.tier ?? 1}, cap {bld.capacity})</span>
    <span class="muted">overhead {overhead} W/turn</span>
  </div>

  <h3>Tradespeople ({player.tradesmen.length}/{bld.capacity + (player.capacityBonus ?? 0)})</h3>
  <div class="slots">
    {#each player.tradesmen as t}
      <div class="slot person" class:busy={t.assignedJob}>
        <Art kind="portraits" id={t.id} label="portrait" small />
        <div class="slot-id">{t.id}</div>
        <div class="muted">{t.assignedJob ? "on " + t.assignedJob : "idle"}</div>
      </div>
    {/each}
    {#if player.tradesmen.length}
      <button class="mini" onclick={() => act((g) => g.fire())}>Fire one</button>
    {/if}
  </div>

  <h3>Equipment</h3>
  <div class="slots">
    {#each player.equipment as e}
      <div class="slot gear">
        <Art kind="equipment" id={e.defId} label={findEquipment(econ, e.defId).name} small />
        <div class="slot-id">{findEquipment(econ, e.defId).name}</div>
        <div class="muted">{e.owned ? "owned" : "rented"}</div>
        {#if e.owned}
          <button class="mini" onclick={() => act((g) => g.disposeEquipment(e.id))}>Dispose</button>
        {:else}
          <button class="mini" onclick={() => act((g) => g.cancelRental(e.id))}>Cancel</button>
        {/if}
      </div>
    {:else}
      <p class="muted">No equipment.</p>
    {/each}
  </div>

  {#if player.defects?.length}
    <h3>🚧 Code issues ({player.defects.length})</h3>
    <div class="defects">
      {#each player.defects as d (d.id)}
        <div class="card defect-card">
          <div class="card-name">{d.name}</div>
          <div class="muted">−{d.productivity_hit} output · {d.fine} W/turn fine · fix for {d.fix_cost} W{#if d.fix_trade} ⟨needs {d.fix_trade}⟩{/if}</div>
          <button class="mini" title="Clear it now; the {d.fix_cost} W repair is booked as a payable due later" onclick={() => act((g) => g.fixDefect(d.id))}>Fix · {d.fix_cost} W</button>
        </div>
      {/each}
    </div>
  {/if}

  <h3>Jobs ({player.jobs.length})</h3>
  <div class="jobs">
    {#each player.jobs as j}
      <div class="card job">
        <div class="card-name">{j.name} <span class="state">[{j.state}]</span>{#if j.hirer_id} <span class="routed">⇄ contract</span>{/if}</div>
        <div class="bar"><div class="fill" style="width:{Math.min(100, (100 * j.work_done) / j.work_amount)}%"></div></div>
        <div class="muted">
          {j.work_done}/{j.work_amount} · {j.value} W · {termsLabel(j)} · due in {j.deadline_turn - turn} · crew {j.assigned_tradesmen.length}/{j.max_tradesmen}
          {#if reqs(j)} · ⟨{reqs(j)}⟩{/if}{#if !j.droppable} · ⚲sticky{/if}
        </div>
        <div class="job-actions">
          {#if canAssign(j)}<button class="mini" onclick={() => act((g) => g.assignJob(j.id))}>Assign</button>{/if}
          {#if j.state === "Active"}<button class="mini" onclick={() => act((g) => g.holdJob(j.id))}>Hold</button>{/if}
          {#if canSell(j)}<button class="mini" title="Sell to the bank instead of doing it" onclick={() => act((g) => g.sellJob(j.id))}>Sell {sellPrice(j)} W</button>{/if}
          {#if j.droppable}<button class="mini" onclick={() => act((g) => g.dropJob(j.id))}>Drop</button>{/if}
          {#if handHas("rush")}<button class="mini" onclick={() => act((g) => g.playRush(j.id))}>Rush</button>{/if}
          {#if handHas("buy_time")}<button class="mini" onclick={() => act((g) => g.playBuyTime(j.id))}>Buy Time</button>{/if}
        </div>
      </div>
    {:else}
      <p class="muted">No jobs in queue.</p>
    {/each}
  </div>

  <div class="ledger">
    <div class="ar">
      <h3>Receivables (AR) — owed to you</h3>
      {#each arRows as r (r.kind + r.id)}
        <div class="line aged {r.age.cls}">
          <span class="amt">{r.amount} W</span>
          <span class="who">{r.kind === "contract" ? "from " + r.who : r.who}</span>
          <span class="when">{r.age.txt}</span>
          {#if r.kind === "invoice"}<button class="mini" title="Sell for cash now, minus a {Math.round(econ.factoring_fee * 100)}% fee" onclick={() => act((g) => g.factorInvoice(r.id))}>Factor</button>
          {:else if r.age.cls !== "pending"}<button class="mini" title="Sell this debt to collections for a {Math.round(econ.factoring_fee * 100)}% fee — they chase {r.who} with a guaranteed lawyer" onclick={() => act((g) => g.factorClaim(r.id))}>Factor</button>{/if}
        </div>
      {:else}<p class="muted">none</p>{/each}
    </div>
    <div class="ap">
      <h3>Payables (AP) — you owe</h3>
      {#each apRows as r (r.ap.id)}
        <div class="line aged {r.age.cls}">
          <span class="amt">{r.ap.amount} W</span>
          <span class="who">{r.who}</span>
          <span class="when">{r.age.txt}{#if r.ap.turns_dodged} · dodged {r.ap.turns_dodged}×{/if}</span>
          {#if !r.ap.pending}<button class="mini" onclick={() => act((g) => g.payPayable(r.ap.id))}>Pay</button>{/if}
        </div>
      {:else}<p class="muted">none</p>{/each}
    </div>
  </div>

  {#if player.modifiers?.length}
    <h3>Standing cards</h3>
    <div class="hand">{#each player.modifiers as m}<span class="chip" title={m.name}>{m.positive ? "🛡️" : "⚠️"} {m.name}</span>{/each}</div>
  {/if}

  {#if player.hand.length}
    <h3>Hand</h3>
    <div class="hand">
      {#each player.hand as c}<span class="chip">{c.name}</span>{/each}
      <span class="muted">(play Rush / Buy Time on a job; Sabotage / Sue from the action bar)</span>
    </div>
  {/if}
</div>

<style>
  .routed { font-size: 0.8em; color: var(--accent, #e0b341); font-weight: 600; }
  .line.aged { display: grid; grid-template-columns: 3.5em 1fr auto auto; gap: 0.5em; align-items: center; padding: 0.15em 0; }
  .line.aged .amt { font-weight: 600; font-variant-numeric: tabular-nums; }
  .line.aged .who { color: var(--muted, #9aa0aa); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .line.aged .when { font-size: 0.82em; white-space: nowrap; }
  .line.aged.ok .when { color: var(--muted, #9aa0aa); }
  .line.aged.soon .when { color: #d8b24a; }
  .line.aged.due .when { color: #e8923a; font-weight: 700; }
  .line.aged.overdue .when { color: #e0564b; font-weight: 700; }
  .line.aged.pending .when { color: #6f93c9; font-style: italic; }
  .defect-card { border-left: 3px solid #e0564b; }
</style>
