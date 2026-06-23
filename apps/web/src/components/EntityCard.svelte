<script>
  import { ui, act, closeEntity, confirmFire, confirmDispose, confirmSell, playFavor } from "../lib/store.js";
  import { findEquipment } from "@boty/engine";
  import Art from "./Art.svelte";

  const econ = $derived($ui.economy);
  const view = $derived($ui.view);
  const me = $derived(view ? view.players[view.activePlayerIndex] : null);
  const ec = $derived($ui.entityCard);

  const worker = $derived(ec?.kind === "worker" && me ? me.tradesmen.find((t) => t.id === ec.id) : null);
  const gear = $derived(ec?.kind === "equipment" && me ? me.equipment.find((e) => e.id === ec.id) : null);
  const job = $derived(ec?.kind === "job" && me ? me.jobs.find((j) => j.id === ec.id) : null);
  const defect = $derived(ec?.kind === "defect" && me ? me.defects?.find((d) => d.id === ec.id) : null);
  const glob = $derived(ec?.kind === "global" && view ? (view.globalEffects ?? []).find((g) => g.id === ec.id) : null);
  const entity = $derived(worker ?? gear ?? job ?? defect ?? glob ?? null);
  const globalDesc = (g) =>
    g.kind === "levy" ? `Every shop in town pays a ${g.magnitude} W levy every turn — you included.`
    : g.kind === "boom" ? `Boom times: new jobs pay +${Math.round(g.magnitude * 100)}%.`
    : g.kind === "recession" ? `Lean times: new jobs pay −${Math.round(g.magnitude * 100)}%.`
    : g.kind === "union" ? `The trades are organised. Firing anyone is far riskier (+2 to their odds) — even a thief is hard to shake. A Favor busts it.`
    : `A town-wide effect.`;

  // The entity vanished (fired / disposed / completed / fixed) → close the card.
  $effect(() => { if (ec && me && !entity) closeEntity(); });

  let picking = $state(false); // inline assign-picker open?
  const gearName = (e) => findEquipment(econ, e.defId).name;
  const sidelined = (t) => t.out_until != null && t.out_until > (view?.turn ?? 0);
  const freeWorkers = $derived(me ? me.tradesmen.filter((t) => t.assignedJob == null && !sidelined(t)) : []);
  const handHas = (type) => me?.hand?.some((c) => c.type === type);
  const workScore = (j) => j.assigned_tradesmen.reduce((s, tid) => s + (me.tradesmen.find((t) => t.id === tid)?.productivity ?? 0), 0);
  const sellPrice = (j) => Math.max(1, Math.floor(j.value * econ.sell_rate));
  const canAssignJob = (j) => ["Queued", "OnHold", "Active"].includes(j.state) && j.assigned_tradesmen.length < j.max_tradesmen && freeWorkers.length > 0;

  function go(fn) { picking = false; act(fn); }
</script>

{#if entity}
  <div class="ent-overlay" onclick={closeEntity}>
    <div class="ent" onclick={(e) => e.stopPropagation()}>
      <button class="ent-x" onclick={closeEntity}>✕</button>

      {#if worker}
        <span class="headline">⚡{worker.productivity}</span>
        <div class="ent-art"><Art kind="portraits" id={worker.id} label="portrait" /></div>
        <h2>{worker.id}</h2>
        <div class="stack">
          <div class="stack-row"><span>Tool</span><span>{worker.tool ?? "bare-handed"}</span></div>
          {#if worker.prod_mod}<div class="stack-row"><span>Last review</span><span class={worker.prod_mod > 0 ? "bonus" : "malus"}>{worker.prod_mod > 0 ? `⭐ +${worker.prod_mod}` : `📉 ${worker.prod_mod}`}/turn</span></div>{/if}
          {#if me.modifiers?.some((m) => m.kind === "training")}<div class="stack-row"><span>Training</span><span class="bonus">🎓 +1/turn · shop-wide</span></div>{/if}
          {#if me.defects?.length}<div class="stack-row"><span>Code drag</span><span class="malus">🚧 −{me.defects.reduce((s, d) => s + (d.productivity_hit ?? 0), 0)}/turn · shop-wide</span></div>{/if}
          <div class="stack-row"><span>Status</span><span>{worker.out_until && worker.out_until > view.turn ? "out until t" + worker.out_until : worker.assignedJob ? "on a job" : "idle"}</span></div>
        </div>
        {#if worker.flag}<p class="flag">{worker.flag === "theft" ? "🚨 Suspected of theft" : "📋 On notice — poor review"} · grounds to fire <em>with cause</em></p>{/if}
        {#if picking}
          <div class="picker">
            <p class="muted">Put a tool on {worker.id}:</p>
            {#each me.equipment as e}
              <button class="opt" onclick={() => go((g) => g.assignEquipment(e.id, worker.id))}>{gearName(e)} {e.assigned_to ? `(on ${e.assigned_to})` : "(idle)"}</button>
            {:else}<p class="muted">No tools owned.</p>{/each}
          </div>
        {/if}
        <div class="ent-actions">
          <button onclick={() => (picking = !picking)}>🔧 Assign equipment</button>
          {#if worker.tool}<button onclick={() => go((g) => g.unassignEquipment(me.equipment.find((e) => e.assigned_to === worker.id).id))}>Unassign</button>{/if}
          <button class="hostile" onclick={() => confirmFire(worker.id)}>Fire</button>
        </div>

      {:else if gear}
        <div class="ent-art"><Art kind="equipment" id={gear.defId} label={gearName(gear)} /></div>
        <h2>{gearName(gear)}</h2>
        <div class="stack">
          <div class="stack-row"><span>Tenure</span><span>{gear.owned ? "owned" : "rented"}</span></div>
          <div class="stack-row"><span>Assigned</span><span>{gear.assigned_to ?? "💤 idle (rent, no output)"}</span></div>
        </div>
        {#if picking}
          <div class="picker">
            <p class="muted">Put this tool on a worker:</p>
            {#each me.tradesmen as t}
              <button class="opt" onclick={() => go((g) => g.assignEquipment(gear.id, t.id))}>{t.id} ⚡{t.productivity}</button>
            {/each}
          </div>
        {/if}
        <div class="ent-actions">
          <button onclick={() => (picking = !picking)}>🔧 Assign to worker</button>
          {#if gear.assigned_to}<button onclick={() => go((g) => g.unassignEquipment(gear.id))}>Idle it</button>{/if}
          {#if gear.owned}<button class="hostile" onclick={() => confirmDispose(gear.id, gearName(gear))}>Dispose</button>
          {:else}<button class="hostile" onclick={() => go((g) => g.cancelRental(gear.id))}>Cancel rental</button>{/if}
        </div>

      {:else if job}
        <span class="headline">{job.work_done}/{job.work_amount}</span>
        <div class="ent-art"><Art kind="card" id={job.card} label={job.name} /></div>
        <h2>{job.name} <span class="muted">[{job.state}]</span></h2>
        <div class="bar"><div class="fill" style="width:{Math.min(100, (100 * job.work_done) / job.work_amount)}%"></div></div>
        <div class="stack">
          <div class="stack-row"><span>Work score / turn</span><span>⚡{workScore(job)}</span></div>
          <div class="stack-row"><span>Crew</span><span>{job.assigned_tradesmen.length} / {job.max_tradesmen}</span></div>
          <div class="stack-row"><span>Value · due</span><span>{job.value} W · turn {job.deadline_turn}</span></div>
        </div>
        <div class="ent-actions">
          {#if canAssignJob(job)}<button onclick={() => go((g) => g.assignJob(job.id))}>👷 Assign worker</button>
          {:else if ["Queued", "OnHold", "Active"].includes(job.state) && job.assigned_tradesmen.length < job.max_tradesmen}<button disabled title="All your crew are on jobs or out — hire one, or free one up first">👷 No free crew</button>{/if}
          {#if job.state === "Active"}<button onclick={() => go((g) => g.holdJob(job.id))}>Hold</button>{/if}
          {#if handHas("rush")}<button onclick={() => go((g) => g.playRush(job.id))}>⏩ Rush</button>{/if}
          {#if handHas("buy_time")}<button onclick={() => go((g) => g.playBuyTime(job.id))}>⏳ Buy Time</button>{/if}
          {#if !job.hirer_id && (job.state === "Queued" || job.state === "OnHold")}<button onclick={() => confirmSell(job.id, sellPrice(job))}>Sell</button>{/if}
          {#if job.droppable}<button class="hostile" onclick={() => go((g) => g.dropJob(job.id))}>Drop</button>{/if}
        </div>

      {:else if defect}
        <div class="ent-art"><Art kind="card" id="code_violation" label={defect.name} /></div>
        <h2>🚧 {defect.name}</h2>
        <div class="stack">
          <div class="stack-row"><span>Output drag</span><span>−{defect.productivity_hit}/turn</span></div>
          <div class="stack-row"><span>Fine</span><span>{defect.fine} W/turn</span></div>
          <div class="stack-row"><span>Fix cost</span><span>{defect.fix_cost} W{#if defect.fix_trade} · needs {defect.fix_trade}{/if}</span></div>
        </div>
        <div class="ent-actions">
          <button onclick={() => go((g) => g.fixDefect(defect.id))}>🔧 Fix · {defect.fix_cost} W</button>
        </div>

      {:else if glob}
        <div class="ent-art"><Art kind="card" id={glob.kind === "union" ? "union_drive" : "county_fair"} label={glob.name} /></div>
        <h2>🌐 {glob.name}</h2>
        <p class="gdesc">{globalDesc(glob)}</p>
        <div class="stack">
          <div class="stack-row"><span>Reach</span><span>town-wide</span></div>
          <div class="stack-row"><span>Lasts</span><span>{glob.kind === "union" ? "until busted" : `${glob.turnsLeft} round${glob.turnsLeft === 1 ? "" : "s"}`}</span></div>
        </div>
        {#if glob.kind === "union"}
          <div class="ent-actions">
            {#if handHas("favor")}<button onclick={() => { closeEntity(); playFavor(me.id, "union"); }}>🪙 Bust the union (play a Favor)</button>
            {:else}<p class="flag">You need a Favor card in hand to bust the union.</p>{/if}
          </div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .ent-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 65; padding: 16px; }
  .ent { position: relative; background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 20px; max-width: 380px; width: 100%; }
  .ent-x { position: absolute; top: 10px; left: 12px; background: none; border: none; font-size: 1.1em; cursor: pointer; color: var(--muted, #9aa0aa); }
  .headline { position: absolute; top: 12px; right: 16px; font-size: 1.4em; font-weight: 800; color: var(--accent, #e0b341); font-variant-numeric: tabular-nums; }
  .ent-art { border-radius: 10px; overflow: hidden; margin: 6px 0 8px; }
  .ent h2 { margin: 0 0 8px; }
  .stack { display: flex; flex-direction: column; gap: 3px; margin-bottom: 10px; }
  .stack-row { display: flex; justify-content: space-between; font-size: 0.9em; }
  .stack-row span:first-child { color: var(--muted, #9aa0aa); }
  .stack-row .bonus { color: #5fb87a; }
  .stack-row .malus { color: #e8746a; }
  .flag { margin: 8px 0 0; padding: 8px 10px; border-radius: 8px; background: rgba(232,116,106,0.12); border: 1px solid rgba(232,116,106,0.4); color: #f0a59c; font-size: 0.85rem; }
  .flag em { font-style: normal; font-weight: 700; color: #5fb87a; }
  .gdesc { color: var(--ink, #e7e7ea); margin: 0 0 10px; line-height: 1.4; }
  .bar { height: 6px; background: var(--panel-2, #1b1f27); border-radius: 3px; overflow: hidden; margin-bottom: 8px; }
  .bar .fill { height: 100%; background: var(--accent, #e0b341); }
  .picker { background: var(--panel-2, #1b1f27); border-radius: 8px; padding: 8px; margin-bottom: 10px; display: flex; flex-direction: column; gap: 4px; }
  .picker .opt { text-align: left; }
  .ent-actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .ent-actions button { flex: 1 1 auto; padding: 9px; }
</style>
