<script>
  import { ui, resolvePoachUI } from "../lib/store.js";
  import { crewIdentity } from "../lib/crew.js";
  const c = $derived(($ui.poach ?? [])[0] ?? null);
  const who = $derived(c ? crewIdentity(c.workerId) : null);
  const offers = [
    { w: 1, odds: "1–3 ≈ 50%" },
    { w: 2, odds: "1–4 ≈ 67%" },
    { w: 3, odds: "1–5 ≈ 83%" },
  ];
</script>

{#if c}
  <div class="ent-overlay">
    <div class="confirm" onclick={(e) => e.stopPropagation()}>
      <h2>⚔️ Poached!</h2>
      <p class="cbody">The Pettigrews are dangling a paycheck at <strong>{who.name}</strong> ({c.workerId}). Counter-offer to keep them — you pay it and roll their loyalty — or let them walk.</p>
      <div class="offers">
        {#each offers as o}
          <button class="offer" onclick={() => resolvePoachUI(c.workerId, o.w)}><span class="ow">{o.w} W</span><span class="oo">stays {o.odds}</span></button>
        {/each}
      </div>
      <button class="walk" onclick={() => resolvePoachUI(c.workerId, 0)}>🚪 Let them go</button>
    </div>
  </div>
{/if}

<style>
  .ent-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 76; padding: 16px; }
  .confirm { background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 20px; max-width: 400px; width: 100%; }
  .confirm h2 { margin: 0 0 8px; }
  .cbody { color: var(--ink, #e7e7ea); margin: 0 0 14px; }
  .offers { display: flex; gap: 8px; margin-bottom: 8px; }
  .offer { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 10px 6px; background: var(--accent, #e0b341); color: #1a1a1a; border: none; border-radius: 9px; font-weight: 700; cursor: pointer; }
  .offer .ow { font-size: 1.1em; }
  .offer .oo { font-size: 0.72em; font-weight: 600; opacity: 0.85; }
  .walk { width: 100%; padding: 10px; font-weight: 700; background: var(--panel-2, #1b1f27); color: var(--ink, #e7e7ea); border: 1px solid var(--line, #2a2f3a); border-radius: 9px; }
</style>
