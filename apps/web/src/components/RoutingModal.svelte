<script>
  import { ui, decideRoutingUI } from "../lib/store.js";
  import { money } from "../lib/money.js";

  const plan = $derived(($ui.routingDecision ?? [])[0] ?? null);
  const isIncident = $derived(plan?.kind === "incident");
  const val = $derived(plan ? (isIncident ? plan.value : plan.subVal) : 0);
  const markup = $derived(plan?.markup ?? 0);

  // Per-trade choice for the choosable portions; defaults to routing the local pro. Reset per plan.
  let choices = $state({});
  $effect(() => {
    if (!plan) return;
    const c = {};
    for (const p of plan.portions) if (p.choosable) c[p.trade] = "local";
    choices = c;
  });

  const set = (trade, v) => { choices = { ...choices, [trade]: v }; };
  function confirm() {
    const decline = {};
    for (const [trade, v] of Object.entries(choices)) if (v === "bank") decline[trade] = "bank";
    decideRoutingUI(decline);
  }
</script>

{#if plan}
  <div class="overlay">
    <div class="modal route">
      <h2>🧰 {plan.cardName} — who runs each trade?</h2>
      <p class="sub">
        You're {isIncident ? "the PM" : "the GC"}. Send a trade to the local pro — they earn it and you
        {isIncident ? "keep the PM fee in play" : "bank the markup"}, but a stall can sink the job (you'd sue).
        Or hand it to the {isIncident ? "county" : "bank"}: safe, denies the rival{isIncident ? "" : ", but you forgo the markup"}.
        <strong>Due turn {plan.deadlineTurn}.</strong>
      </p>
      <div class="rt-rows">
        {#each plan.portions as p}
          <div class="rt-row">
            <span class="rt-trade">{p.trade}</span>
            {#if p.role === "self"}
              <span class="rt-fixed">You — your own crew</span>
            {:else if !p.choosable}
              <span class="rt-fixed">{isIncident ? "County" : "Bank"} — no local pro for this trade</span>
            {:else}
              <div class="rt-toggle">
                <button class:on={choices[p.trade] === "local"} onclick={() => set(p.trade, "local")}>
                  {p.subName}{isIncident ? ` · NPC pays ${$money(val)}` : markup ? ` · +${$money(markup)} to you` : ""}
                </button>
                <button class="deny" class:on={choices[p.trade] === "bank"} onclick={() => set(p.trade, "bank")}>
                  {isIncident ? "County" : "Bank"} · safe
                </button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
      <button class="rt-confirm" onclick={confirm}>Confirm routing ▶</button>
    </div>
  </div>
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 62; padding: 16px; }
  .modal.route { background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 20px; max-width: 460px; width: 100%; box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
  .modal.route h2 { margin: 0 0 6px; }
  .sub { color: var(--muted, #9aa0aa); font-size: 0.88em; margin: 0 0 12px; line-height: 1.4; }
  .rt-rows { display: flex; flex-direction: column; gap: 8px; }
  .rt-row { display: grid; grid-template-columns: 1fr 2.2fr; align-items: center; gap: 10px; }
  .rt-trade { text-transform: capitalize; font-weight: 700; }
  .rt-fixed { color: var(--muted, #9aa0aa); font-size: 0.86em; }
  .rt-toggle { display: grid; grid-template-columns: 1fr auto; gap: 6px; }
  .rt-toggle button { padding: 8px 10px; font-size: 0.84em; background: var(--panel-2, #1b1f27); color: var(--ink, #e7e7ea); border: 1px solid var(--line, #2a2f3a); border-radius: 7px; }
  .rt-toggle button.on { border-color: var(--accent, #e0b341); background: rgba(224,179,65,0.14); font-weight: 700; }
  .rt-toggle button.deny.on { border-color: #e8746a; background: rgba(232,116,106,0.14); }
  .rt-confirm { width: 100%; margin-top: 16px; padding: 11px; font-weight: 700; }
</style>
