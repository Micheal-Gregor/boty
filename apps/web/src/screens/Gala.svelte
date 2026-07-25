<script>
  import { ui, restart } from "../lib/store.js";
  import { money } from "../lib/money.js";
  import Shell from "./Shell.svelte";
  import Donate from "../components/Donate.svelte";
  const final = $derived($ui.final ?? {});
  const results = $derived(final.results ?? []);
  const awards = $derived(final.awards ?? []);
  const award = $derived(final.award ?? "Business of the Year");
  const town = $derived(final.town ?? "town");
  const winner = $derived(results.find((r) => !r.bankrupt));

  let tab = $state("winner");
</script>

<Shell bg="gala" label="Award night" loopFrom={6} framed>
  <section class="gala">
  <h1>🏆 The {award} Gala</h1>
  <p class="muted">{final.bureau ?? "The Better Business Bureau"} reviews the year's open books…</p>

  <div class="gala-tabs">
    <button class:on={tab === "winner"} onclick={() => (tab = "winner")}>🏆 Winner</button>
    <button class:on={tab === "awards"} onclick={() => (tab = "awards")}>🎖️ Prizes</button>
    <button class:on={tab === "books"} onclick={() => (tab = "books")}>📒 Financials</button>
  </div>

  {#if tab === "winner"}
    {#if winner}
      <p class="crown">🏆 <strong>{winner.name}</strong> is named {town}'s {award} with <strong>{$money(winner.cash)}</strong>!</p>
    {:else}
      <p class="crown">Every shop went under. The {award} goes unawarded this year.</p>
    {/if}
    <ol class="standings">
      {#each results as r}
        <li class:winner={r === winner} class:bankrupt={r.bankrupt}>
          <span class="place">{r.place}</span>
          <span class="who">{r.name} <span class="muted">· {r.service}</span></span>
          <span class="cash">{r.bankrupt ? "shuttered" : $money(r.cash)}</span>
        </li>
      {/each}
    </ol>

  {:else if tab === "awards"}
    <div class="awards">
      {#each awards as a}
        <div class="award-row"><span class="ai">{a.icon}</span><span class="al">{a.label}</span><span class="aw">{a.who} <span class="muted">({a.val})</span></span></div>
      {:else}<p class="muted">No prizes to hand out this year.</p>{/each}
    </div>

  {:else}
    <div class="books-scroll">
      {#each results as r}
        <div class="pbook" class:dead={r.bankrupt}>
          <div class="pbook-head"><strong>#{r.place} {r.name}</strong> <span class="muted">· {r.service}</span></div>
          {#if r.bankrupt}<div class="stamp">BANKRUPT</div>{/if}
          <div class="fin">
            <div class="fin-row"><span>Revenue</span><span>{$money(r.pnl.revenue)}</span></div>
            <div class="fin-row sub"><span>− COGS</span><span>{$money(r.pnl.cogs)}</span></div>
            <div class="fin-row"><span>Gross margin</span><span>{$money(r.pnl.grossMargin)}</span></div>
            <div class="fin-row sub"><span>− Overhead</span><span>{$money(r.pnl.overhead)}</span></div>
            <div class="fin-row tot"><span>Net income</span><span>{$money(r.pnl.netIncome)}</span></div>
            <div class="fin-row split"><span>Assets {$money(r.bs.assets)} · Liab {$money(r.bs.liabilities)} · Equity {$money(r.bs.equity)}</span><span></span></div>
            <div class="fin-row"><span>Cash</span><span>{$money(r.cash)}</span></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <button class="start" onclick={restart}>New game</button>
  <div class="gala-support">
    <p>That's a wrap on the year. Business of the Year is free — if you had fun, you can tip the developer.</p>
    <Donate tone="ghost" />
  </div>
  </section>
</Shell>

<style>
  .gala-tabs { display: flex; gap: 6px; justify-content: center; margin: 12px 0; }
  .gala-tabs button { background: var(--panel-2, #1b1f27); color: var(--ink, #e7e7ea); border: 1px solid var(--line, #2a2f3a); }
  .gala-tabs button.on { border-color: var(--accent, #e0b341); color: var(--accent, #e0b341); font-weight: 700; }
  .awards { max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; gap: 6px; }
  .award-row { display: grid; grid-template-columns: 28px 1fr auto; gap: 8px; align-items: center; background: var(--panel-2, #1b1f27); border-radius: 8px; padding: 8px 10px; }
  .award-row .ai { font-size: 1.2em; } .award-row .aw { font-weight: 600; }
  .books-scroll { max-width: 480px; margin: 0 auto; max-height: 50vh; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  .pbook { position: relative; background: var(--panel-2, #1b1f27); border: 1px solid var(--line, #2a2f3a); border-radius: 10px; padding: 10px 12px; }
  .pbook.dead .fin { opacity: 0.35; filter: grayscale(1); }
  .pbook-head { margin-bottom: 6px; }
  .stamp { position: absolute; top: 38%; left: 50%; transform: translate(-50%, -50%) rotate(-18deg); border: 4px solid #e0564b; color: #e0564b; font-weight: 900; font-size: 1.6em; letter-spacing: 2px; padding: 2px 14px; border-radius: 8px; opacity: 0.85; pointer-events: none; }
  .fin { display: flex; flex-direction: column; gap: 1px; font-variant-numeric: tabular-nums; }
  .fin-row { display: flex; justify-content: space-between; font-size: 0.9em; }
  .fin-row.sub span:first-child { color: var(--muted, #9aa0aa); padding-left: 8px; }
  .fin-row.tot { border-top: 1px solid var(--line, #2a2f3a); font-weight: 700; padding-top: 2px; margin-top: 2px; }
  .fin-row.split { color: var(--muted, #9aa0aa); font-size: 0.8em; margin-top: 4px; }
  .gala-support { max-width: 420px; margin: 20px auto 0; text-align: center; border-top: 1px solid var(--line, #2a2f3a); padding-top: 16px; }
  .gala-support p { color: var(--muted, #9aa0aa); font-size: 0.88rem; line-height: 1.5; margin: 0 0 12px; }
</style>
