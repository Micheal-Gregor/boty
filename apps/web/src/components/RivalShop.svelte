<script>
  // Read-only browse of every shop at the table — scroll with ◀ ▶ to see what rivals are up to.
  import { ui, closeRivals } from "../lib/store.js";
  import { findEquipment, findBuilding } from "@boty/engine";
  import Art from "./Art.svelte";

  const econ = $derived($ui.economy);
  const view = $derived($ui.view);
  const open = $derived($ui.rivalView);
  const players = $derived(view?.players ?? []);

  let idx = $state(0);
  $effect(() => { if (open && idx >= players.length) idx = 0; });
  const p = $derived(players[idx]);
  const bld = $derived(p ? findBuilding(econ, p.building) : null);
  const gearName = (e) => findEquipment(econ, e.defId).name;
  const next = () => (idx = (idx + 1) % players.length);
  const prev = () => (idx = (idx - 1 + players.length) % players.length);
</script>

{#if open && p}
  <div class="ent-overlay" onclick={closeRivals}>
    <div class="rival" onclick={(e) => e.stopPropagation()}>
      <button class="ent-x" onclick={closeRivals}>✕</button>
      <div class="nav">
        <button class="arr" onclick={prev}>◀</button>
        <div class="who"><strong>{p.name}</strong> <span class="muted">· {p.service}</span></div>
        <button class="arr" onclick={next}>▶</button>
      </div>
      <div class="stats">
        <span class="cash" class:broke={p.bankrupt}>{p.bankrupt ? "BANKRUPT" : p.cash + " W"}</span>
        <span class="muted">{bld?.name} · cap {(bld?.capacity ?? 0) + (p.capacityBonus ?? 0)}</span>
      </div>
      <div class="shop-art"><Art kind={`shop/${p.service}`} id={p.building} label={`${p.service} ${bld?.name}`} small /></div>

      <h3>Crew ({p.tradesmen.length})</h3>
      <div class="chips">{#each p.tradesmen as t}<span class="chip">{t.id} ⚡{t.productivity}{#if t.tool} · {t.tool}{/if}</span>{:else}<span class="muted">none</span>{/each}</div>
      <h3>Equipment</h3>
      <div class="chips">{#each p.equipment as e}<span class="chip">{gearName(e)} {e.assigned_to ? `→${e.assigned_to}` : "💤"}</span>{:else}<span class="muted">none</span>{/each}</div>
      <h3>Jobs ({p.jobs.length})</h3>
      <div class="chips">{#each p.jobs as j}<span class="chip">{j.name} {j.work_done}/{j.work_amount}</span>{:else}<span class="muted">none</span>{/each}</div>
      {#if p.modifiers?.length}
        <h3>Standing cards</h3>
        <div class="chips">{#each p.modifiers as m}<span class="chip">{m.positive ? "🛡️" : "⚠️"} {m.name}</span>{/each}</div>
      {/if}

      <button class="pop-close" onclick={closeRivals}>Close</button>
    </div>
  </div>
{/if}

<style>
  .ent-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 66; padding: 16px; }
  .rival { position: relative; background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 20px; max-width: 440px; width: 100%; max-height: 86vh; overflow-y: auto; }
  .ent-x { position: absolute; top: 10px; right: 12px; background: none; border: none; font-size: 1.1em; cursor: pointer; color: var(--muted, #9aa0aa); }
  .nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 0 8px; }
  .nav .arr { background: var(--panel-2, #1b1f27); border: 1px solid var(--line, #2a2f3a); border-radius: 8px; padding: 4px 12px; color: var(--ink, #e7e7ea); }
  .who { font-size: 1.05em; }
  .stats { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .cash { font-size: 1.3em; font-weight: 800; color: var(--accent, #e0b341); }
  .cash.broke { color: #e0564b; font-size: 1em; }
  .shop-art { border-radius: 10px; overflow: hidden; margin-bottom: 8px; }
  .rival h3 { margin: 10px 0 4px; font-size: 0.82em; color: var(--muted, #9aa0aa); }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip { background: var(--panel-2, #1b1f27); border: 1px solid var(--line, #2a2f3a); border-radius: 14px; padding: 4px 10px; font-size: 0.85em; }
  .pop-close { margin-top: 16px; width: 100%; padding: 10px; font-weight: 700; }
</style>
