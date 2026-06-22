<script>
  import { ui, openEntity, closeHand } from "../lib/store.js";
  import { findEquipment } from "@boty/engine";

  const econ = $derived($ui.economy);
  const view = $derived($ui.view);
  const me = $derived(view ? view.players[view.activePlayerIndex] : null);
  const open = $derived($ui.handView);
  const gearName = (e) => findEquipment(econ, e.defId).name;

  function pick(kind, id) { closeHand(); openEntity(kind, id); }
</script>

{#if open && me}
  <div class="ent-overlay" onclick={closeHand}>
    <div class="hand-modal" onclick={(e) => e.stopPropagation()}>
      <button class="ent-x" onclick={closeHand}>✕</button>
      <h2>🃏 {me.name}'s hand</h2>

      <h3>Tradespeople</h3>
      <div class="chips">
        {#each me.tradesmen as t}<button class="chip clickable" onclick={() => pick("worker", t.id)}>{t.id} ⚡{t.productivity}</button>{:else}<span class="muted">none</span>{/each}
      </div>

      <h3>Equipment</h3>
      <div class="chips">
        {#each me.equipment as e}<button class="chip clickable" onclick={() => pick("equipment", e.id)}>{gearName(e)} {e.assigned_to ? `→${e.assigned_to}` : "💤"}</button>{:else}<span class="muted">none</span>{/each}
      </div>

      <h3>Jobs</h3>
      <div class="chips">
        {#each me.jobs as j}<button class="chip clickable" onclick={() => pick("job", j.id)}>{j.name} {j.work_done}/{j.work_amount}</button>{:else}<span class="muted">none</span>{/each}
      </div>

      {#if me.modifiers?.length}
        <h3>Standing cards</h3>
        <div class="chips">{#each me.modifiers as m}<span class="chip">{m.positive ? "🛡️" : "⚠️"} {m.name}</span>{/each}</div>
      {/if}

      {#if me.hand?.length}
        <h3>Play cards</h3>
        <div class="chips">{#each me.hand as c}<span class="chip">🃏 {c.name}</span>{/each}</div>
      {/if}

      {#if (view.projects ?? []).filter((p) => p.leadId === me.id).length}
        <h3>Projects</h3>
        <div class="chips">{#each view.projects.filter((p) => p.leadId === me.id) as p}<span class="chip">🏛️ {p.name} ({p.phases.filter((x) => x.done).length}/{p.phases.length})</span>{/each}</div>
      {/if}

      <button class="pop-close" onclick={closeHand}>Close</button>
    </div>
  </div>
{/if}

<style>
  .ent-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 66; padding: 16px; }
  .hand-modal { position: relative; background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 20px; max-width: 440px; width: 100%; max-height: 86vh; overflow-y: auto; }
  .ent-x { position: absolute; top: 10px; right: 12px; background: none; border: none; font-size: 1.1em; cursor: pointer; color: var(--muted, #9aa0aa); }
  .hand-modal h2 { margin: 0 0 8px; }
  .hand-modal h3 { margin: 12px 0 5px; font-size: 0.85em; color: var(--muted, #9aa0aa); }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .chip { background: var(--panel-2, #1b1f27); border: 1px solid var(--line, #2a2f3a); border-radius: 14px; padding: 4px 10px; font-size: 0.85em; color: var(--ink, #e7e7ea); font-weight: normal; }
  .chip.clickable { cursor: pointer; }
  .chip.clickable:hover { border-color: var(--accent, #e0b341); }
  .pop-close { margin-top: 16px; width: 100%; padding: 10px; font-weight: 700; }
</style>
