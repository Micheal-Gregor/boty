<script>
  // Shown after this client's shop folds: a persistent bar making it clear you're out of the game —
  // no more actions, just watch the rest play out (the board keeps updating behind it) or leave. The
  // store already blocks all actions once iAmOut(); this is the visible half of observer mode.
  import { ui, backToMenu } from "../lib/store.js";

  const show = $derived($ui.view?.observer && ($ui.screen === "board" || $ui.screen === "reckoning"));
</script>

{#if show}
  <div class="observer-bar" role="status" aria-live="polite">
    <span class="skull">💀</span>
    <span class="msg"><strong>Your shop has folded.</strong> You're out of the game — the bank has wound up your estate. Watching the rest play out.</span>
    <button class="leave" onclick={backToMenu}>Leave to menu</button>
  </div>
{/if}

<style>
  .observer-bar {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 900;
    display: flex; align-items: center; gap: 12px;
    padding: 10px 16px;
    background: linear-gradient(0deg, rgba(58,18,22,0.97), rgba(40,14,18,0.94));
    border-top: 1px solid #e0564b;
    color: #f3e3e0; font-size: 0.95rem;
    box-shadow: 0 -2px 14px rgba(0,0,0,0.45);
  }
  .skull { font-size: 1.35rem; line-height: 1; }
  .msg { flex: 1; }
  .msg strong { color: #ff8a7a; }
  .leave {
    padding: 7px 14px; font-weight: 700; border-radius: 8px;
    background: #e0564b; color: #1a1a1a; border: none; cursor: pointer; white-space: nowrap;
  }
  .leave:hover { background: #ef6a5e; }
</style>
