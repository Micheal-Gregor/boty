<script>
  import { ui, confirmYes, confirmNo, confirmAlt } from "../lib/store.js";
  import { cashText } from "../lib/money.js";
  import Art from "./Art.svelte";
  const c = $derived($ui.confirm);
</script>

{#if c}
  <div class="ent-overlay" onclick={confirmNo}>
    <div class="confirm" onclick={(e) => e.stopPropagation()}>
      {#if c.npc}<div class="conf-art"><Art kind="townsfolk" id={c.npc} label={c.title} autoplay /></div>{/if}
      <h2>{c.title}</h2>
      <p class="cbody">{$cashText(c.body)}</p>
      <div class="cbtns">
        <button class="no" onclick={confirmNo}>No</button>
        <button class="yes" onclick={confirmYes}>{$cashText(c.yes)} ▶</button>
      </div>
      {#if c.alt}
        <button class="alt" onclick={confirmAlt}>⚖️ {$cashText(c.alt.label)}</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .ent-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 75; padding: 16px; }
  .confirm { background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 20px; max-width: 380px; width: 100%; }
  .conf-art { border-radius: 10px; overflow: hidden; margin-bottom: 10px; }
  .confirm h2 { margin: 0 0 8px; }
  .cbody { color: var(--ink, #e7e7ea); margin: 0 0 14px; }
  .cbtns { display: flex; gap: 8px; }
  .cbtns button { flex: 1; padding: 10px; font-weight: 700; }
  .cbtns .no { background: var(--panel-2, #1b1f27); color: var(--ink, #e7e7ea); border: 1px solid var(--line, #2a2f3a); }
  .alt { width: 100%; margin-top: 8px; padding: 9px; font-weight: 700; background: var(--panel-2, #1b1f27); color: var(--accent, #e0b341); border: 1px solid var(--accent, #e0b341); border-radius: 8px; }
</style>
