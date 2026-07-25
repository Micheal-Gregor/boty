<script>
  // A self-contained "support the game" button. The game is free (donation-supported), so this is the
  // only ask. On click it opens Stripe Checkout (startCheckout redirects the page); if it can't, it shows
  // an inline note. Requires a signed-in user, since the checkout is tied to the buyer's account.
  import { startCheckout } from "../lib/billing.js";
  import { user } from "../lib/auth.js";

  let { amount = 500, label = "☕ Support the game — $5", tone = "solid" } = $props();
  let busy = $state(false);
  let err = $state("");

  async function go() {
    if (busy) return;
    busy = true;
    err = "";
    const r = await startCheckout("donate", amount);
    // On success startCheckout navigates away to Stripe — if we're still here, it failed.
    if (r?.error) { err = r.error; busy = false; }
  }
</script>

{#if $user}
  <button class="donate {tone}" onclick={go} disabled={busy}>{busy ? "Opening checkout…" : label}</button>
  {#if err}<p class="donate-err">{err}</p>{/if}
{/if}

<style>
  .donate { font-weight: 700; border-radius: 10px; cursor: pointer; padding: 10px 16px; font-size: 0.95rem; }
  .donate.solid { background: var(--accent, #e0b341); color: #1a1a1a; border: none; box-shadow: 0 4px 14px rgba(224,179,65,0.28); }
  .donate.solid:hover { filter: brightness(1.05); }
  .donate.ghost { background: none; color: var(--accent, #e0b341); border: 1px solid var(--accent, #e0b341); }
  .donate.ghost:hover { background: rgba(224,179,65,0.08); }
  .donate:disabled { opacity: 0.6; cursor: default; }
  .donate-err { color: #e0564b; font-size: 0.82rem; margin: 6px 0 0; }
</style>
