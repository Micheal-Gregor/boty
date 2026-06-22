<script>
  import { ui, act, startPick, playSue } from "../lib/store.js";
  import { findBuilding, findEquipment } from "@boty/engine";
  import Art from "./Art.svelte";

  let { player, econ, handHas, nextBuilding } = $props();

  const turn = $derived($ui.view?.turn ?? 0);
  const bld = $derived(findBuilding(econ, player.building));
  const sidelined = (t) => t.out_until != null && t.out_until > turn;
  const idle = $derived(player.tradesmen.filter((t) => !t.assignedJob && !sidelined(t)).length);
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

  const hasMod = (k) => player.modifiers?.some((m) => m.kind === k);
  const modDesc = { insurance: "shocks become deductibles", marketing: "extra work each turn", accountant: "cheaper factoring + cleaner books", training: "the crew burns work faster" };
  const handDesc = { slick_lawyer: "±2 in a court / sue / damages window", rush: "finish or advance a job", buy_time: "extend a deadline", sabotage: "set back a rival's job", favor: "cancel a rival's standing perk" };

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
        o.payables.filter((ap) => ap.creditor_id === player.id).map((ap) => ({ kind: "contract", id: ap.id, amount: ap.amount, who: o.name, debtorId: o.id, suable: ap.sue_window_remaining > 0, age: age(ap.due_turn, ap.pending) })),
      ),
    ].sort((a, b) => a.age.sort - b.age.sort),
  );
</script>

<div class="shop">
  <h2>{player.name} <span class="trade">· {player.service}</span></h2>
  <div class="stats">
    <span class="cash">{player.cash} W</span>
    <span class="muted">overhead {overhead} W/turn</span>
  </div>

  <div class="warehouse">
    <span class="wh-name">🏚️ {bld.name} <span class="muted">tier {bld.tier ?? 1} · cap {bld.capacity + (player.capacityBonus ?? 0)}</span></span>
    <span class="wh-actions">
      {#if player.bbbThisTurn}<button class="mini" title="Capital improvement: +1 capacity, booked to the balance sheet" onclick={() => act((g) => g.improveShop())}>⬆️ Upgrade</button>{/if}
      {#if nextBuilding}<button class="mini" onclick={() => act((g) => g.relocate(nextBuilding.id))}>Move → {nextBuilding.name}</button>{/if}
    </span>
  </div>

  <h3>Tradespeople ({player.tradesmen.length}/{bld.capacity + (player.capacityBonus ?? 0)})</h3>
  <div class="slots">
    {#each player.tradesmen as t}
      <div class="slot person" class:busy={t.assignedJob} class:out={sidelined(t)}>
        <Art kind="portraits" id={t.id} label="portrait" small />
        <div class="slot-id">{t.id}</div>
        <div class="muted">{sidelined(t) ? "out until t" + t.out_until : t.assignedJob ? "on " + t.assignedJob : "idle"}</div>
        <button class="mini" onclick={() => act((g) => g.fire(t.id))}>Fire</button>
      </div>
    {/each}
    <button class="mini add" onclick={() => act((g) => g.hire())}>+ Hire</button>
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
    {/each}
    <div class="buy-col">
      <button class="mini" onclick={() => act((g) => g.buyEquipment("basic"))}>Buy Basic</button>
      <button class="mini" onclick={() => act((g) => g.buyEquipment("pro"))}>Buy Pro</button>
      <button class="mini" onclick={() => act((g) => g.rentEquipment("basic"))}>Rent Basic</button>
      <button class="mini" onclick={() => act((g) => g.rentEquipment("pro"))}>Rent Pro</button>
    </div>
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
          <span class="row-actions">
            {#if r.kind === "invoice"}<button class="mini" title="Sell for cash now, minus a {Math.round(econ.factoring_fee * 100)}% fee" onclick={() => act((g) => g.factorInvoice(r.id))}>Factor</button>
            {:else if r.age.cls !== "pending"}
              {#if r.suable}<button class="mini hostile" title="Take {r.who} to court to collect this debt" onclick={() => playSue(r.debtorId, r.id)}>⚖️ Sue</button>{/if}
              <button class="mini" title="Sell this debt to collections for a {Math.round(econ.factoring_fee * 100)}% fee — they chase {r.who} with a guaranteed lawyer" onclick={() => act((g) => g.factorClaim(r.id))}>Factor</button>
            {/if}
          </span>
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

  {#if player.modifiers?.length || player.bbbThisTurn}
    <h3>Standing cards</h3>
    <div class="cardlist">
      {#each player.modifiers as m (m.id)}
        <div class="cardrow">
          <span class="cardname">{m.positive ? "🛡️" : "⚠️"} {m.name}</span>
          <span class="muted">{modDesc[m.kind] ?? ""}{#if m.turnsLeft} · {m.turnsLeft} turn(s) left{/if}</span>
        </div>
      {/each}
      {#if player.bbbThisTurn}
        <div class="cardrow bbb">
          <span class="cardname">🏛️ BBB Special</span>
          <span class="bbb-buys">
            {#if !hasMod("insurance")}<button class="mini" onclick={() => act((g) => g.buyService("insurance"))}>Insurance</button>{/if}
            {#if !hasMod("marketing")}<button class="mini" onclick={() => act((g) => g.buyService("marketing"))}>Marketing</button>{/if}
            {#if !hasMod("accountant")}<button class="mini" onclick={() => act((g) => g.buyService("accountant"))}>Accountant</button>{/if}
            {#if !hasMod("training")}<button class="mini" onclick={() => act((g) => g.buyService("training"))}>Training</button>{/if}
          </span>
        </div>
      {/if}
    </div>
  {/if}

  {#if player.hand.length}
    <h3>Hand</h3>
    <div class="cardlist">
      {#each player.hand as c}
        <div class="cardrow">
          <span class="cardname">🃏 {c.name}</span>
          <span class="muted">{handDesc[c.type] ?? c.text ?? ""}</span>
          {#if c.type === "sabotage"}<button class="mini hostile" onclick={() => startPick("sabotage")}>⚔️ Play…</button>{/if}
          {#if c.type === "favor"}<button class="mini hostile" onclick={() => startPick("favor")}>🪙 Play…</button>{/if}
        </div>
      {/each}
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
  .slot .mini { margin-top: 4px; width: 100%; }
  .slots .add { align-self: center; padding: 8px 12px; }
  .buy-col { display: flex; flex-direction: column; gap: 4px; justify-content: center; }
  .cardlist { display: flex; flex-direction: column; gap: 5px; }
  .cardrow { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .cardrow .cardname { font-weight: 600; min-width: 130px; }
  .cardrow.bbb .cardname { color: var(--accent); }
  .bbb-buys { display: flex; gap: 4px; flex-wrap: wrap; }
  .warehouse { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin: 4px 0 4px; padding: 6px 8px; background: var(--panel-2, #1b1f27); border-radius: 8px; }
  .wh-name { font-weight: 600; }
  .wh-actions { display: flex; gap: 4px; flex-wrap: wrap; }
  .line.aged .row-actions { display: flex; gap: 4px; justify-content: flex-end; }
</style>
