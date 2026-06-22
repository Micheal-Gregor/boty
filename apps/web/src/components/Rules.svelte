<script>
  import { ui, closeRules } from "../lib/store.js";
  const open = $derived($ui.rulesOpen);
  const max = $derived($ui.economy?.max_turns ?? 24);
</script>

{#if open}
  <div class="ent-overlay" onclick={closeRules}>
    <div class="rules" onclick={(e) => e.stopPropagation()}>
      <button class="ent-x" onclick={closeRules}>✕</button>
      <h2>📖 How to play</h2>

      <h3>The goal</h3>
      <p>Run your trade in Maple Hollow for {max} rounds. Whoever has the <strong>most cash</strong> at
        year-end is named <strong>Business of the Year</strong>. (Profit on the books isn't the same as
        cash in the bank — that gap is the game.)</p>

      <h3>Each round</h3>
      <p>Your turn opens with <strong>upkeep</strong> — rent, wages, equipment, premiums, fines and any
        levy come out, invoices that are due come in. Then you <strong>draw Fortune cards</strong>, take
        actions, and your crew <strong>works your jobs</strong>.</p>

      <h3>Crew &amp; equipment</h3>
      <p>Hire tradespeople (up to your shop's capacity) and buy or rent tools. Each tool is
        <strong>assigned to one worker</strong>: a geared worker burns faster, a bare-handed one slower,
        and a tool with no worker still costs rent but does nothing. Open a worker or tool card to
        reassign.</p>

      <h3>Jobs</h3>
      <p>Assign crew to a job; its work burns by the crew's combined productivity. Finish before the
        deadline to bill the customer (paid on terms). Need cash now? <strong>Factor</strong> an invoice
        for a fee, or <strong>sell</strong> a job you can't staff.</p>

      <h3>Working together</h3>
      <p><strong>Subcontract</strong> jobs you can't do — a rival does the work for a fee while you bill
        the customer and keep the markup. <strong>Civic jobs</strong> pay favours when delivered but drop
        a town-wide levy on everyone if they collapse. <strong>Projects</strong> pay 50% up front and the
        balance only when every phase lands.</p>

      <h3>Growing</h3>
      <p>Moving to a bigger shop (or adding capacity) is a <strong>capital project</strong>: pay a deposit
        and insurance, the town does the fit-out for contracts, and you move in next round when you pay
        the balance.</p>

      <h3>Playing rough</h3>
      <p><strong>Sue</strong> a rival who dodges a debt they owe you; defend a suit with a Slick Lawyer.
        <strong>Sabotage</strong> sets back a rival's job. <strong>Favor</strong> waives one of your own
        code violations, or cancels a rival's standing perk.</p>

      <h3>The books</h3>
      <p>Every move posts a real journal entry. The 📒 Books tab shows your <strong>P&amp;L</strong> and
        <strong>balance sheet</strong> — watch the cash-vs-profit gap.</p>

      <button class="pop-close" onclick={closeRules}>Got it</button>
    </div>
  </div>
{/if}

<style>
  .ent-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 72; padding: 16px; }
  .rules { position: relative; background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 22px; max-width: 460px; width: 100%; max-height: 88vh; overflow-y: auto; }
  .ent-x { position: absolute; top: 10px; right: 12px; background: none; border: none; font-size: 1.1em; cursor: pointer; color: var(--muted, #9aa0aa); }
  .rules h2 { margin: 0 0 8px; }
  .rules h3 { margin: 14px 0 3px; font-size: 0.95em; color: var(--accent, #e0b341); }
  .rules p { margin: 0; font-size: 0.9em; line-height: 1.45; }
  .pop-close { margin-top: 18px; width: 100%; padding: 10px; font-weight: 700; }
</style>
