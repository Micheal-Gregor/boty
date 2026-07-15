<script>
  // The guided-tutorial coach: a fixed banner at the bottom that steps through the lesson. It never
  // blocks the board (guided, not gated) — the player can act while it's up. Next advances; Skip ends it.
  import { ui, nextTutorial, skipTutorial } from "../lib/store.js";
  const t = $derived($ui.tutorial);
  const total = 6;
  const last = $derived(t ? t.step >= total - 1 : false);
</script>

{#if t}
  <div class="coach" role="dialog" aria-label="Tutorial">
    <div class="coach-head">
      <span class="coach-title">{t.title}</span>
      <span class="coach-step">Step {t.step + 1} / {total}</span>
    </div>
    <p class="coach-text">{t.text}</p>
    <div class="coach-btns">
      <button class="skip" onclick={skipTutorial}>Skip tutorial</button>
      <button class="next" onclick={nextTutorial}>{last ? "Finish ✓" : "Next ▶"}</button>
    </div>
    <div class="coach-dots">
      {#each Array(total) as _, i}<span class="dot" class:on={i <= t.step}></span>{/each}
    </div>
  </div>
{/if}

<style>
  .coach {
    position: fixed; left: 50%; bottom: 12px; transform: translateX(-50%);
    z-index: 70; width: min(560px, calc(100vw - 24px)); box-sizing: border-box;
    background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px;
    padding: 14px 16px 12px; box-shadow: 0 12px 40px rgba(0,0,0,0.55);
  }
  .coach-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
  .coach-title { font-weight: 800; color: var(--accent, #e0b341); }
  .coach-step { font-size: 0.78rem; color: var(--muted, #9aa0aa); white-space: nowrap; }
  .coach-text { margin: 0 0 12px; font-size: 0.92rem; line-height: 1.45; color: var(--ink, #e7e7ea); }
  .coach-btns { display: flex; gap: 8px; }
  .coach-btns button { flex: 1; padding: 9px; font-weight: 700; }
  .coach-btns .skip { background: var(--panel-2, #1b1f27); color: var(--muted, #9aa0aa); border: 1px solid var(--line, #2a2f3a); }
  .coach-dots { display: flex; gap: 5px; justify-content: center; margin-top: 10px; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--line, #2a2f3a); }
  .dot.on { background: var(--accent, #e0b341); }
</style>
