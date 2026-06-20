<script>
  import { ui, act } from "../lib/store.js";
  import { findBuilding, findEquipment } from "@boty/engine";

  let { player, econ, handHas, nextBuilding } = $props();

  const turn = $derived($ui.game.state.turn);
  const bld = $derived(findBuilding(econ, player.building));
  const idle = $derived(player.tradesmen.filter((t) => !t.assignedJob).length);
  const overhead = $derived(
    bld.rent +
      player.tradesmen.length * econ.wage_per_turn +
      player.equipment.filter((e) => !e.owned).reduce((sum, e) => sum + findEquipment(econ, e.defId).rent_per_turn, 0),
  );

  const canAssign = (j) => ["Queued", "OnHold", "Active"].includes(j.state) && j.assigned_tradesmen.length < j.max_tradesmen && idle > 0;
  const reqs = (j) => [
    j.required_equipment ? `needs ${j.required_equipment}` : null,
    j.required_building_tier > 1 ? `tier-${j.required_building_tier} shop` : null,
    j.equipment_per_tradesman ? "tool/worker" : null,
  ].filter(Boolean).join(", ");
</script>

<div class="shop">
  <h2>{player.name} <span class="trade">· {player.service}</span></h2>
  <div class="stats">
    <span class="cash">{player.cash} W</span>
    <span>{bld.name} (tier {bld.tier ?? 1}, cap {bld.capacity})</span>
    <span class="muted">overhead {overhead} W/turn</span>
  </div>

  <h3>Tradespeople ({player.tradesmen.length}/{bld.capacity})</h3>
  <div class="slots">
    {#each player.tradesmen as t}
      <div class="slot person" class:busy={t.assignedJob}>
        <div class="art-slot sm">[portrait]</div>
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
        <div class="art-slot sm">[art]</div>
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

  <h3>Jobs ({player.jobs.length})</h3>
  <div class="jobs">
    {#each player.jobs as j}
      <div class="card job">
        <div class="card-name">{j.name} <span class="state">[{j.state}]</span></div>
        <div class="bar"><div class="fill" style="width:{Math.min(100, (100 * j.work_done) / j.work_amount)}%"></div></div>
        <div class="muted">
          {j.work_done}/{j.work_amount} · {j.value} W · due in {j.deadline_turn - turn} · crew {j.assigned_tradesmen.length}/{j.max_tradesmen}
          {#if reqs(j)} · ⟨{reqs(j)}⟩{/if}{#if !j.droppable} · ⚲sticky{/if}
        </div>
        <div class="job-actions">
          {#if canAssign(j)}<button class="mini" onclick={() => act((g) => g.assignJob(j.id))}>Assign</button>{/if}
          {#if j.state === "Active"}<button class="mini" onclick={() => act((g) => g.holdJob(j.id))}>Hold</button>{/if}
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
      <h3>Invoices (AR)</h3>
      {#each player.invoices as inv}
        <div class="line">{inv.id}: {inv.amount} W @t{inv.due_turn}
          <button class="mini" onclick={() => act((g) => g.factorInvoice(inv.id))}>Factor</button></div>
      {:else}<p class="muted">none</p>{/each}
    </div>
    <div class="ap">
      <h3>Payables (AP)</h3>
      {#each player.payables as ap}
        <div class="line">{ap.id}: {ap.amount} W @t{ap.due_turn} ({ap.is_npc ? ap.vendor : "player"})
          <button class="mini" onclick={() => act((g) => g.payPayable(ap.id))}>Pay</button></div>
      {:else}<p class="muted">none</p>{/each}
    </div>
  </div>

  {#if player.hand.length}
    <h3>Hand</h3>
    <div class="hand">
      {#each player.hand as c}<span class="chip">{c.name}</span>{/each}
      <span class="muted">(Sabotage / Sue UI coming next)</span>
    </div>
  {/if}
</div>
