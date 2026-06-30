<script>
  import { ui, act, startPick, playSue, openEntity, openConfirm, confirmSell, confirmFire, confirmDispose, sueDamagesUI, offerSettlementUI, respondSettlementUI, favorDropSuitUI } from "../lib/store.js";
  import { money } from "../lib/money.js";
  import { findBuilding, findEquipment, SERVICES } from "@boty/engine";
  import { crewIdentity } from "../lib/crew.js";
  import Art from "./Art.svelte";
  import Flash from "./Flash.svelte";

  let { player, econ, handHas, nextBuilding } = $props();
  const suits = $derived($ui.view?.lawsuits ?? { mine: [], against: [] }); // persistent player-v-player lawsuits
  const pm = $derived($ui.view?.pmContracts ?? []); // contracts YOU broker (PM tenders / GC contracts) + the fee/markup you'll earn
  const tradeSlug = (svc) => (svc === "HVAC technician" ? "hvac" : (svc ?? "").toLowerCase());
  const equipArtId = (e) => (e.defId === "pro" ? `pro/${tradeSlug(player.service)}` : e.defId); // per-trade pro gear

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
  const canSell = (j) => !j.hirer_id && j.droppable && (j.state === "Queued" || j.state === "OnHold"); // sticky jobs (Boon) can't be sold
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
  const modDesc = { insurance: "shocks become deductibles", marketing: "extra work each turn", accountant: "cheaper factoring + cleaner books", training: "the crew burns work faster", private_security: "stops thieves + catches saboteurs" };
  const handDesc = { slick_lawyer: "±2 in a court / sue / damages window", rush: "finish or advance a job", buy_time: "extend a deadline", sabotage: "set back a rival's job", favor: "cancel a rival's standing perk" };
  const premium = (k) => SERVICES[k]?.premium ?? 0; // BBB service fee per turn (W)

  // --- Job queue sorting -----------------------------------------------------------------
  let jobSort = $state("due");
  const jobSortOpts = [["due", "Due"], ["pay", "Pay"], ["progress", "Progress"], ["crew", "Crew need"]];
  const sortedJobs = $derived.by(() => {
    const js = [...player.jobs];
    if (jobSort === "due") js.sort((a, b) => (a.deadline_turn ?? 1e6) - (b.deadline_turn ?? 1e6));
    else if (jobSort === "pay") js.sort((a, b) => b.value - a.value);
    else if (jobSort === "progress") js.sort((a, b) => b.work_done / b.work_amount - a.work_done / a.work_amount);
    else if (jobSort === "crew") js.sort((a, b) => (b.max_tradesmen - b.assigned_tradesmen.length) - (a.max_tradesmen - a.assigned_tradesmen.length));
    return js;
  });

  // --- AR / AP aging ---------------------------------------------------------------------
  const allPlayers = $derived($ui.view?.players ?? []);
  const myProjects = $derived(($ui.view?.projects ?? []).filter((p) => p.leadId === player.id));
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
    <span class="cash">{$money(player.cash)}</span>
    <span class="muted">overhead {$money(overhead)}/turn</span>
  </div>

  <div class="warehouse">
    <span class="wh-name">🏚️ {bld.name} <span class="muted">tier {bld.tier ?? 1} · cap {bld.capacity + (player.capacityBonus ?? 0)}</span></span>
    {#if player.pendingExpansion}
      <span class="wh-readying">🏗️ readying {player.pendingExpansion.targetName} — move in next round</span>
    {:else}
      <span class="wh-actions">
        {#if player.bbbThisTurn}<button class="mini cta" title="Capital project: deposit + insurance now, six trade contracts to the town, +1 capacity next round (the fee capitalises)" onclick={() => act((g) => g.startExpansion("improve"))}>⬆️ Upgrade</button>{/if}
        {#if nextBuilding}<button class="mini cta" onclick={() => openConfirm({ title: `Move to the ${nextBuilding.name}?`, body: `Readying it is a capital project: you pay a deposit + insurance now, and trade contracts go out to the town for the fit-out. You start paying the NEW shop's higher rent right away — and you can't move in until every fit-out contract is finished, so dragging it out (or a stalling crew) bites. At move-in you pay the balance; can't cover it and you forfeit the deposit.`, yes: "Start the move" }, () => act((g) => g.startExpansion(nextBuilding.id)))}>Move → {nextBuilding.name}</button>{/if}
      </span>
    {/if}
  </div>

  {#each myProjects as proj (proj.id)}
    <div class="project-card">
      <div class="proj-head">🏛️ <strong>{proj.name}</strong> <span class="muted">· {$money(proj.balance)} balance on delivery</span></div>
      <div class="proj-phases">
        {#each proj.phases as ph}
          <span class="phase" class:done={ph.done}>{ph.done ? "✓" : "○"} {ph.name}{#if ph.trade} <span class="muted">({ph.trade})</span>{/if}</span>
        {/each}
      </div>
    </div>
  {/each}

  <h3>Tradespeople ({player.tradesmen.length}/{bld.capacity + (player.capacityBonus ?? 0)}) <Flash section="crew" /></h3>
  <div class="slots">
    {#each player.tradesmen as t (t.id)}
      <div class="slot person" class:busy={t.assignedJob} class:out={sidelined(t)}>
        <button class="thumb" onclick={() => openEntity("worker", t.id)}>
          <Art kind="crew" id={t.id} label="portrait" small />
          <div class="slot-id"><span class="nm">{crewIdentity(t.id).name}</span><span class="prod" title="work score / turn">⚡{t.productivity}</span></div>
          <div class="muted">{t.id} · {t.tool ?? "bare-handed"}</div>
          <div class="muted">{sidelined(t) ? "out until t" + t.out_until : t.assignedJob ? "on " + t.assignedJob : "idle"}</div>
        </button>
        <button class="mini" onclick={() => confirmFire(t.id)}>Fire</button>
      </div>
    {/each}
    <button class="add" onclick={() => act((g) => g.hire())}>+ Hire</button>
  </div>

  <h3>Equipment <Flash section="equip" /></h3>
  <div class="slots">
    {#each player.equipment as e (e.id)}
      <div class="slot gear">
        <button class="thumb" onclick={() => openEntity("equipment", e.id)}>
          <Art kind="equipment" id={equipArtId(e)} seed={e.id} label={findEquipment(econ, e.defId).name} small />
          <div class="slot-id">{findEquipment(econ, e.defId).name}</div>
          <div class="muted">{e.owned ? "owned" : "rented"} · {e.assignedToId ? "→ " + crewIdentity(e.assignedToId).name : "💤 idle"}</div>
        </button>
        {#if e.owned}<button class="mini" onclick={() => confirmDispose(e.id, findEquipment(econ, e.defId).name)}>Dispose</button>
        {:else}<button class="mini" onclick={() => act((g) => g.cancelRental(e.id))}>Cancel</button>{/if}
      </div>
    {/each}
    <div class="buy-col">
      <button onclick={() => act((g) => g.buyEquipment("basic"))}>Buy Basic</button>
      <button onclick={() => act((g) => g.buyEquipment("pro"))}>Buy Pro</button>
      <button onclick={() => act((g) => g.rentEquipment("basic"))}>Rent Basic</button>
      <button onclick={() => act((g) => g.rentEquipment("pro"))}>Rent Pro</button>
    </div>
  </div>

  {#if player.defects?.length}
    <h3>🚧 Code issues ({player.defects.length}) <Flash section="jobs" /></h3>
    <div class="defects">
      {#each player.defects as d (d.id)}
        <div class="card defect-card">
          <button class="thumb" onclick={() => openEntity("defect", d.id)}>
            <div class="card-name">🚧 {d.name}</div>
            <div class="muted">−{d.productivity_hit} output · {$money(d.fine)}/turn fine · fix for {$money(d.fix_cost)}{#if d.fix_trade} ⟨needs {d.fix_trade}⟩{/if}</div>
          </button>
          <button class="mini" title="Clear it now; the {$money(d.fix_cost)} repair is booked as a payable due later" onclick={() => act((g) => g.fixDefect(d.id))}>Fix · {$money(d.fix_cost)}</button>
        </div>
      {/each}
    </div>
  {/if}

  <h3 class="jobs-head">Jobs ({player.jobs.length}) <Flash section="jobs" />
    {#if player.jobs.length > 1}
      <span class="sortbar">sort:{#each jobSortOpts as [val, label]}<button class="sort-btn" class:on={jobSort === val} onclick={() => (jobSort = val)}>{label}</button>{/each}</span>
    {/if}
  </h3>
  <div class="jobs">
    {#each sortedJobs as j (j.id)}
      <div class="card job">
        <button class="thumb" onclick={() => openEntity("job", j.id)}>
          <div class="card-name">{j.name} <span class="state">[{j.state}]</span>{#if j.readying} <span class="routed">🏗️ fit-out</span>{:else if j.project_id} <span class="routed">🏛️ project phase</span>{:else if j.political} <span class="routed">🏛️ civic</span>{:else if j.hirer_id} <span class="routed">⇄ contract</span>{/if}</div>
          <div class="bar"><div class="fill" style="width:{Math.min(100, (100 * j.work_done) / j.work_amount)}%"></div></div>
          <div class="muted">
            {j.work_done}/{j.work_amount} · {$money(j.value)} · {termsLabel(j)} · due in {j.deadline_turn - turn} · crew {j.assigned_tradesmen.length}/{j.max_tradesmen}
            {#if reqs(j)} · ⟨{reqs(j)}⟩{/if}{#if !j.droppable} · ⚲sticky{/if}
          </div>
        </button>
        <div class="job-actions">
          {#if canAssign(j)}<button class="mini" onclick={() => act((g) => g.assignJob(j.id))}>Assign</button>{/if}
          {#if j.state === "Active"}<button class="mini" onclick={() => act((g) => g.holdJob(j.id))}>Hold</button>{/if}
          {#if j.state === "OnHold"}<button class="mini" onclick={() => act((g) => g.resumeJob(j.id))}>▶ Resume</button>{/if}
          {#if j.state === "OnHold" && j.assigned_tradesmen.length > 0}<button class="mini" onclick={() => act((g) => g.holdJob(j.id))}>Free crew</button>{/if}
          {#if canSell(j)}<button class="mini" onclick={() => confirmSell(j.id, sellPrice(j))}>Sell {$money(sellPrice(j))}</button>{/if}
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
          <span class="amt">{$money(r.amount)}</span>
          <span class="who">{r.kind === "contract" ? "from " + r.who : r.who}</span>
          <span class="when">{r.age.txt}</span>
          <span class="row-actions">
            {#if r.kind === "invoice"}<button class="mini" title="Sell for cash now, minus the factoring fee" onclick={() => openConfirm({ title: "Factor this invoice?", body: `Sell this ${$money(r.amount)} invoice for ${$money(r.amount - Math.round(r.amount * econ.factoring_fee))} cash now — the ${Math.round(econ.factoring_fee * 100)}% fee (${$money(Math.round(r.amount * econ.factoring_fee))}) is the price of getting paid today.`, yes: "Factor it" }, () => act((g) => g.factorInvoice(r.id)))}>Factor</button>
            {:else if r.age.cls !== "pending"}
              {#if r.suable}<button class="mini hostile" title="Take {r.who} to court to collect this debt" onclick={() => playSue(r.debtorId, r.id)}>⚖️ Sue</button>{/if}
              <button class="mini" title="Sell this debt to collections" onclick={() => openConfirm({ title: "Sell this debt to collections?", body: `Sell ${r.who}'s ${$money(r.amount)} debt for about ${$money(r.amount - Math.round(r.amount * econ.factoring_fee))} now (a ${Math.round(econ.factoring_fee * 100)}% fee — less if they're near broke). The agency then hounds ${r.who} with a guaranteed lawyer.`, yes: "Sell the debt" }, () => act((g) => g.factorClaim(r.id)))}>Factor</button>
            {/if}
          </span>
        </div>
      {:else}<p class="muted">none</p>{/each}
    </div>
    <div class="ap">
      <h3>Payables (AP) — you owe</h3>
      {#each apRows as r (r.ap.id)}
        <div class="line aged {r.age.cls}">
          <span class="amt">{$money(r.ap.amount)}</span>
          <button class="who wholink" title="What's this expense?" onclick={() => openEntity("ap", r.ap.id)}>{r.who} 🔍</button>
          <span class="when">{r.age.txt}{#if r.ap.turns_dodged} · dodged {r.ap.turns_dodged}×{/if}</span>
          {#if !r.ap.pending}<button class="mini" onclick={() => act((g) => g.payPayable(r.ap.id))}>Pay</button>{/if}
        </div>
      {:else}<p class="muted">none</p>{/each}
    </div>
  </div>

  {#if pm.length}
    <h3>🏗️ Your contracts (PM / GC) <span class="muted">— fees & markups you earn while the trades sub the work</span></h3>
    <div class="suits">
      {#each pm as c (c.id)}
        <div class="pm-row">
          <div class="line">
            <span class="who">{c.name} <span class="muted">[{c.kind}]</span></span>
            <span class="when gain">+{$money(c.commission)}{#if c.gross} · bills {$money(c.gross)}{/if} · due turn {c.deadline}</span>
          </div>
          <div class="pm-portions">
            {#each c.portions as pt}
              <span class="pm-portion" class:done={pt.done} class:mine={pt.mine}>{pt.trade}: {pt.who} {pt.done ? "✓" : "…"}</span>
            {/each}
          </div>
        </div>
      {/each}
      <div class="pm-total">Potential commissions in flight: <strong class="gain">{$money(pm.reduce((s, c) => s + c.commission, 0))}</strong> <span class="muted">— if a sub botches a portion, the contract collapses and you can sue them (below)</span></div>
    </div>
  {/if}

  {#if suits.mine.length || suits.against.length}
    <h3>⚖️ Lawsuits <span class="muted">— claims you can pursue (a sub botched YOUR contract) + suits against you; open until sued, settled, or a Favor closes them</span></h3>
    <div class="suits">
      {#each suits.mine as c (c.jobId)}
        <div class="line">
          <span class="who">{c.other} botched {c.jobName}</span>
          {#if c.settlement != null}
            <span class="when">offers {$money(c.settlement)} to settle</span>
            <span class="row-actions">
              <button class="mini" onclick={() => respondSettlementUI(c.jobId, true)}>Accept</button>
              <button class="mini hostile" onclick={() => respondSettlementUI(c.jobId, false)}>Refuse</button>
            </span>
          {:else}
            <span class="when">up to {$money(c.value)}</span>
            <span class="row-actions">
              <button class="mini hostile" onclick={() => sueDamagesUI(c.jobId, false)}>⚖️ Sue</button>
              {#if handHas("slick_lawyer")}<button class="mini" onclick={() => sueDamagesUI(c.jobId, true)}>🧑‍⚖️ +Lawyer</button>{/if}
            </span>
          {/if}
        </div>
      {/each}
      {#each suits.against as c (c.jobId)}
        <div class="line">
          <span class="who">{c.other} v. you — {c.jobName}</span>
          <span class="when">{$money(c.value)}{#if c.settlement != null} · you offered {$money(c.settlement)}{/if}</span>
          <span class="row-actions">
            {#if c.settlement == null}<button class="mini" title="Offer half to close it" onclick={() => offerSettlementUI(c.jobId)}>Settle {$money(Math.max(1, Math.ceil(c.value / 2)))}</button>{/if}
            {#if handHas("favor")}<button class="mini" title="Spend a Favor to make it disappear" onclick={() => favorDropSuitUI(c.jobId)}>🃏 Favor: drop</button>{/if}
          </span>
        </div>
      {/each}
    </div>
  {/if}

  {#if player.modifiers?.length || player.bbbThisTurn}
    <h3>Standing cards</h3>
    <div class="cardlist">
      {#each player.modifiers as m (m.id)}
        <div class="cardrow">
          <span class="cardname">{m.positive ? "🛡️" : "⚠️"} {m.name}</span>
          <span class="muted">{modDesc[m.kind] ?? ""}{#if premium(m.kind)} · {$money(premium(m.kind))}/turn{/if}{#if m.turnsLeft} · {m.turnsLeft} turn(s) left{/if}</span>
          {#if premium(m.kind)}<button class="mini" title="Stop this service — no more premiums (no refund of what you've already paid)" onclick={() => openConfirm({ title: `Cancel ${m.name}?`, body: `Stops the ${$money(premium(m.kind))}/turn premium from next upkeep. No refund of premiums already paid.`, yes: "Cancel it" }, () => act((g) => g.cancelService(m.kind)))}>Cancel</button>{/if}
        </div>
      {/each}
      {#if player.bbbThisTurn}
        <div class="bbb-card">
          <div class="cardname bbb-name">🏛️ BBB vendor fair <span class="muted">— buy this turn only</span></div>
          {#if !hasMod("insurance")}<div class="bbb-opt"><button onclick={() => act((g) => g.buyService("insurance"))}>Insurance · {$money(premium("insurance"))}/turn</button><span class="muted">{modDesc.insurance}</span></div>{/if}
          {#if !hasMod("marketing")}<div class="bbb-opt"><button onclick={() => act((g) => g.buyService("marketing"))}>Marketing · {$money(premium("marketing"))}/turn</button><span class="muted">{modDesc.marketing}</span></div>{/if}
          {#if !hasMod("accountant")}<div class="bbb-opt"><button onclick={() => act((g) => g.buyService("accountant"))}>Accountant · {$money(premium("accountant"))}/turn</button><span class="muted">{modDesc.accountant}</span></div>{/if}
          {#if !hasMod("training")}<div class="bbb-opt"><button onclick={() => act((g) => g.buyService("training"))}>Training · {$money(premium("training"))}/turn</button><span class="muted">{modDesc.training}</span></div>{/if}
          {#if !hasMod("private_security")}<div class="bbb-opt"><button onclick={() => act((g) => g.buyService("private_security"))}>Private security · {$money(premium("private_security"))}/turn</button><span class="muted">{modDesc.private_security}</span></div>{/if}
          <div class="bbb-opt"><button onclick={() => act((g) => g.startExpansion("improve"))}>⬆️ Upgrade</button><span class="muted">+1 crew capacity (capital project)</span></div>
        </div>
      {/if}
    </div>
  {/if}

  {#if player.hand.length}
    <h3>Hand</h3>
    <div class="cardlist">
      {#each player.hand as c}
        <div class="cardrow">
          <span class="cardname"><span class="card-thumb"><Art kind="card" id={c.art ?? c.type} label={c.name} /></span> {c.name}</span>
          <span class="muted">{handDesc[c.type] ?? c.text ?? ""}</span>
          {#if c.type === "favor"}<button class="mini hostile" onclick={() => startPick("favor")}>Play…</button>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .routed { font-size: 0.8em; color: var(--accent, #e0b341); font-weight: 600; }
  .gain { color: #7fdca0; }
  .pm-row { border: 1px solid var(--line, #2a3140); border-radius: 8px; padding: 6px 8px; margin: 4px 0; background: rgba(127,220,160,0.04); }
  .pm-portions { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
  .pm-portion { font-size: 0.78em; padding: 1px 7px; border-radius: 6px; background: rgba(255,255,255,0.05); color: var(--muted, #9aa4b2); }
  .pm-portion.done { color: #7fdca0; background: rgba(127,220,160,0.12); }
  .pm-portion.mine { border: 1px solid rgba(224,179,65,0.5); }
  .pm-total { font-size: 0.82em; margin-top: 6px; padding-top: 5px; border-top: 1px solid var(--line, #2a3140); }
  .line.aged { display: grid; grid-template-columns: 3.5em 1fr auto auto; gap: 0.5em; align-items: center; padding: 0.15em 0; }
  .line.aged .amt { font-weight: 600; font-variant-numeric: tabular-nums; }
  .line.aged .who { color: var(--muted, #9aa0aa); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .line.aged button.wholink { text-align: left; background: none; border: none; padding: 0; cursor: pointer; font: inherit; }
  .line.aged button.wholink:hover { color: var(--accent, #e0b341); text-decoration: underline; }
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
  .cardrow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cardrow .cardname { font-weight: 600; min-width: 130px; display: inline-flex; align-items: center; gap: 6px; }
  .card-thumb { width: 26px; height: 26px; flex: none; border-radius: 4px; overflow: hidden; background: var(--panel-2, #1b1f27); }
  .card-thumb :global(img), .card-thumb :global(video), .card-thumb :global(.art-anim) { width: 100%; height: 100%; object-fit: cover; display: block; }
  .cardrow.bbb .cardname { color: var(--accent); }
  .bbb-buys { display: flex; gap: 4px; flex-wrap: wrap; }
  .bbb-card { background: var(--panel-2, #1b1f27); border-left: 3px solid var(--accent, #e0b341); border-radius: 8px; padding: 8px 10px; margin: 5px 0; display: flex; flex-direction: column; gap: 5px; }
  .bbb-name { font-weight: 600; }
  .bbb-opt { display: flex; align-items: center; gap: 8px; }
  .bbb-opt button { flex: 0 0 auto; min-width: 116px; }
  .bbb-opt .muted { font-size: 0.85em; }
  .jobs-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sortbar { display: inline-flex; align-items: center; gap: 3px; font-size: 0.72em; font-weight: 400; color: var(--muted, #9aa0aa); text-transform: none; letter-spacing: 0; }
  .sort-btn { padding: 2px 8px; margin-left: 2px; background: var(--panel-2, #1b1f27); border: 1px solid var(--line, #2a2f3a); border-radius: 6px; font-size: 1em; color: var(--muted, #9aa0aa); cursor: pointer; }
  .sort-btn.on { border-color: var(--accent, #e0b341); color: var(--accent, #e0b341); font-weight: 700; }
  .warehouse { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; margin: 4px 0 4px; padding: 6px 8px; background: var(--panel-2, #1b1f27); border-radius: 8px; }
  .wh-name { font-weight: 600; }
  .wh-actions { display: flex; gap: 4px; flex-wrap: wrap; }
  /* Capital-project actions (Upgrade / Move) — accent-filled so they're not missed, like the other CTAs. */
  .mini.cta { background: var(--accent, #e0b341); color: #1a1a1a; border-color: var(--accent, #e0b341); font-weight: 700; }
  .mini.cta:hover { background: #edc24f; border-color: #edc24f; }
  .wh-readying { font-size: 0.85em; color: var(--accent, #e0b341); font-weight: 600; }
  .project-card { margin: 6px 0; padding: 8px 10px; background: var(--panel-2, #1b1f27); border-left: 3px solid var(--accent, #e0b341); border-radius: 8px; }
  .proj-head { margin-bottom: 4px; }
  .proj-phases { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 0.88em; }
  .phase { color: var(--muted, #9aa0aa); }
  .phase.done { color: #5fb87a; }
  .line.aged .row-actions { display: flex; gap: 4px; justify-content: flex-end; }
  .slot-id { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
  .slot-id .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .prod { color: var(--accent, #e0b341); font-weight: 700; font-size: 0.85em; white-space: nowrap; }
</style>
