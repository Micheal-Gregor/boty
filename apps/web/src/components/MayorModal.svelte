<script>
  import { ui, resolveMayorUI } from "../lib/store.js";
  import { money } from "../lib/money.js";
  import Art from "./Art.svelte";
  const c = $derived(($ui.mayor ?? [])[0] ?? null);
  const cost = $derived($ui.economy?.mayor_favor_cost ?? 10);
</script>

{#if c}
  <div class="ent-overlay">
    <div class="confirm" onclick={(e) => e.stopPropagation()}>
      <div class="conf-art"><Art kind="townsfolk" id="crabtree" label="Mayor Crabtree" autoplay /></div>
      <h2>Mayor Crabtree's re-election drive</h2>
      <p class="cbody">Chip in <strong>{$money(cost)}</strong> and the Mayor remembers it — a <strong>Favor</strong> in your hand now, and he steers more work your way (seeds networking lunches into your deck). Or pass.</p>
      <div class="cbtns">
        <button class="no" onclick={() => resolveMayorUI(false)}>Pass</button>
        <button class="yes" onclick={() => resolveMayorUI(true)}>Chip in {$money(cost)} ▶</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ent-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 76; padding: 16px; }
  .confirm { background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 20px; max-width: 400px; width: 100%; }
  .conf-art { border-radius: 10px; overflow: hidden; margin-bottom: 10px; }
  .confirm h2 { margin: 0 0 8px; }
  .cbody { color: var(--ink, #e7e7ea); margin: 0 0 14px; }
  .cbtns { display: flex; gap: 8px; }
  .cbtns button { flex: 1; padding: 10px; font-weight: 700; border-radius: 8px; }
  .cbtns .no { background: var(--panel-2, #1b1f27); color: var(--ink, #e7e7ea); border: 1px solid var(--line, #2a2f3a); }
  .cbtns .yes { background: var(--accent, #e0b341); color: #1a1a1a; border: none; }
</style>
