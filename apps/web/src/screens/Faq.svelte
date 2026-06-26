<script>
  import { backToMenu } from "../lib/store.js";
  import Shell from "./Shell.svelte";

  const faqs = [
    ["What is this game?", "A turn-based business game. You run one of six service trades in the town of Maple Hollow across a 24-round fiscal year, competing for the Better Business Bureau's “Business of the Year.”"],
    ["How do I win?", "Most cash in the drawer when the books close at year-end. Profit on paper doesn't count — only cash. (Unpaid debts don't subtract; stiffing a vendor and outrunning the clock is a legitimate, risky strategy.)"],
    ["What are the six trades?", "Mechanic, plumber, electrician, pipefitter, welder, and HVAC technician. In a full table each trade is taken once — so a job that isn't yours routes to whoever can do it, and you do business with each other."],
    ["What's the loop each turn?", "Draw work from the Fortune deck, staff and gear your crew to burn through jobs, collect on what you've delivered, pay (or dodge) your bills, and pass the turn. Jobs pay on terms (net-30/60/90), so cash flow is everything."],
    ["Dollars or W?", "The game balances in W (work-units); the screen shows you dollars at $50 per W. Flip it in Settings → “Show amounts in.”"],
    ["How many players, how long?", "1–6 (humans and/or AI). A game is 24 rounds — four seasons of a fiscal year — and the town's 200-year story unspools quietly behind it."],
    ["What makes it hard?", "Overhead never stops, shocks hit your cash, deadlines are hard, and rivals can poach your crew, sue you, or factor your debts to a collections agency. Three difficulty tiers — Steady, Standard, Cutthroat — set how rough the town plays."],
    ["Any tips?", "Watch your cash, not your paper profit. Don't over-hire before you have the work. Mind your deadlines. And remember Dot's good word is worth more than the bank's."],
  ];
</script>

<Shell bg="bbb_review" label="How to play">
  <div class="page">
    <button class="back" onclick={backToMenu}>← Menu</button>
    <h1>How to Play &amp; FAQ</h1>
    {#each faqs as [q, a]}
      <section class="qa"><h2>{q}</h2><p>{a}</p></section>
    {/each}
  </div>
</Shell>

<style>
  .page { background: rgba(16,18,24,0.72); border: 1px solid var(--line, #2a2f3a); border-radius: 14px; padding: 22px 24px; }
  .back { background: none; border: 1px solid var(--line, #2a2f3a); color: var(--muted, #9aa0aa); border-radius: 8px; padding: 6px 12px; cursor: pointer; margin-bottom: 12px; }
  .back:hover { color: var(--accent, #e0b341); border-color: var(--accent, #e0b341); }
  h1 { margin: 0 0 16px; }
  .qa { margin: 0 0 16px; }
  .qa h2 { font-size: 1.05rem; margin: 0 0 4px; color: var(--accent, #e0b341); }
  .qa p { color: #cdd2da; line-height: 1.55; margin: 0; }
</style>
