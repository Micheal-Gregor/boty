<script>
  import { ui, rollDie, diceNext, cancelDice } from "../lib/store.js";
  const d = $derived($ui.dice);

  // Standard d6 pip layout on a 3×3 grid (cell indices 0–8).
  const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

  let face = $state(null);      // the pip value currently shown on the die
  let revealing = $state(false); // true while the die is tumbling toward its result

  // When the store hands us a rolled value, tumble the faces for a beat, then settle on it.
  $effect(() => {
    const v = d?.value ?? null;
    if (v == null) { revealing = false; face = null; return; }
    revealing = true;
    let ticks = 0;
    const t = setInterval(() => {
      face = 1 + Math.floor(Math.random() * 6);
      if (++ticks >= 11) { clearInterval(t); face = v; revealing = false; }
    }, 60);
    return () => clearInterval(t);
  });
</script>

{#if d}
  <div class="dice-overlay">
    <div class="dice-box">
      {#if d.stepIdx === 0 && d.value == null && !d.noCancel}<button class="x" onclick={cancelDice} title="Cancel">✕</button>{/if}
      <h2>{d.title}</h2>
      <p class="sub">{d.sub}</p>
      {#if d.steps > 1}<p class="step">Roll {d.stepIdx + 1} of {d.steps}</p>{/if}
      <p class="prompt">{d.prompt}</p>

      <div class="die-wrap">
        {#if d.value == null}
          <button class="die roll" onclick={rollDie}><span class="q">?</span></button>
        {:else}
          <div class="die {revealing ? 'tumbling' : (d.tone || '')}">
            {#each Array(9) as _, i}<span class="cell">{#if PIPS[face]?.includes(i)}<span class="pip"></span>{/if}</span>{/each}
          </div>
        {/if}
      </div>

      {#if d.value == null}
        <p class="hint">tap the die to roll</p>
      {:else if revealing}
        <p class="hint">rolling…</p>
      {:else}
        <p class="result {d.tone}">{d.result}</p>
        <button class="go {d.tone}" onclick={diceNext}>{d.finished ? "Done" : "Roll again ▶"}</button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .dice-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.62); display: flex; align-items: center; justify-content: center; z-index: 80; padding: 16px; }
  .dice-box { position: relative; background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 16px; padding: 22px 22px 20px; max-width: 380px; width: 100%; text-align: center; }
  .x { position: absolute; top: 8px; right: 10px; background: none; border: none; color: var(--muted, #9aa0aa); font-size: 1.1rem; cursor: pointer; padding: 4px 8px; }
  h2 { margin: 0 0 4px; }
  .sub { color: var(--muted, #9aa0aa); margin: 0 0 10px; font-size: 0.88rem; }
  .step { color: var(--accent, #e0b341); margin: 0 0 2px; font-size: 0.78rem; letter-spacing: 0.04em; text-transform: uppercase; }
  .prompt { color: var(--ink, #e7e7ea); margin: 0 0 14px; font-weight: 600; }
  .die-wrap { display: flex; justify-content: center; margin: 6px 0 12px; min-height: 92px; align-items: center; }

  .die { width: 84px; height: 84px; border-radius: 16px; background: #f4f1e8; box-shadow: inset 0 -4px 0 rgba(0,0,0,0.15), 0 6px 14px rgba(0,0,0,0.4);
         display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); padding: 9px; gap: 2px; border: none; }
  .die .cell { display: flex; align-items: center; justify-content: center; }
  .die .pip { width: 14px; height: 14px; border-radius: 50%; background: #20242c; }
  .die.roll { cursor: pointer; place-items: center; transition: transform 0.1s; }
  .die.roll:hover { transform: translateY(-2px) scale(1.04); }
  .die.roll .q { grid-column: 1 / 4; grid-row: 1 / 4; font-size: 2.6rem; font-weight: 800; color: #20242c; display: flex; align-items: center; justify-content: center; }
  .die.tumbling { animation: tumble 0.6s linear infinite; }
  .die.good { box-shadow: inset 0 -4px 0 rgba(0,0,0,0.15), 0 0 0 3px #5fb87a, 0 6px 14px rgba(0,0,0,0.4); }
  .die.bad { box-shadow: inset 0 -4px 0 rgba(0,0,0,0.15), 0 0 0 3px #e8746a, 0 6px 14px rgba(0,0,0,0.4); }
  @keyframes tumble { 0% { transform: rotate(0) scale(1); } 25% { transform: rotate(-12deg) scale(1.06); } 50% { transform: rotate(10deg) scale(0.96); } 75% { transform: rotate(-6deg) scale(1.04); } 100% { transform: rotate(0) scale(1); } }

  .hint { color: var(--muted, #9aa0aa); margin: 0; font-size: 0.85rem; font-style: italic; }
  .result { margin: 4px 0 14px; font-weight: 600; line-height: 1.4; }
  .result.good { color: #5fb87a; }
  .result.bad { color: #e8746a; }
  .go { width: 100%; padding: 11px; font-weight: 800; border-radius: 9px; border: none; background: var(--accent, #e0b341); color: #1a1a1a; cursor: pointer; }
  .go.bad { background: #e8746a; color: #1a1010; }
  .go.good { background: #5fb87a; color: #0f1a12; }
</style>
