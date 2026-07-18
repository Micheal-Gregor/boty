<script>
  // A tiny feedback modal, openable from anywhere (feedbackOpen store). Writes to the Supabase feedback
  // table. Captures the current screen as context so the owner knows where the tester was.
  import { feedbackOpen, closeFeedback, sendFeedback } from "../lib/feedback.js";
  import { ui } from "../lib/store.js";

  let msg = $state("");
  let sending = $state(false);
  let done = $state(false);
  let err = $state(null);

  async function submit() {
    sending = true; err = null;
    const r = await sendFeedback(msg, `screen:${$ui.screen}`);
    sending = false;
    if (r.error) err = r.error;
    else { done = true; setTimeout(reset, 1600); }
  }
  function reset() { closeFeedback(); msg = ""; done = false; err = null; sending = false; }
</script>

{#if $feedbackOpen}
  <div class="fb-overlay" onclick={reset}>
    <div class="fb-card" onclick={(e) => e.stopPropagation()}>
      {#if done}
        <p class="fb-thanks">🙏 Thanks — sent to the developer!</p>
      {:else}
        <h3>💬 Send feedback</h3>
        <p class="fb-sub">Hit a bug or have an idea? Tell me what happened — it goes straight to the developer.</p>
        <textarea bind:value={msg} rows="5" placeholder="What happened, or what would you change?"></textarea>
        {#if err}<p class="fb-err">{err}</p>{/if}
        <div class="fb-acts">
          <button class="fb-cancel" onclick={reset}>Cancel</button>
          <button class="fb-send" disabled={sending || !msg.trim()} onclick={submit}>{sending ? "Sending…" : "Send ▶"}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .fb-overlay { position: fixed; inset: 0; z-index: 1200; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.6); padding: 16px; }
  .fb-card { width: min(440px, 100%); background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
  .fb-card h3 { margin: 0 0 6px; }
  .fb-sub { color: var(--muted, #9aa0aa); font-size: 0.9rem; margin: 0 0 12px; }
  .fb-card textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line, #2a2f3a); background: var(--panel-2, #1b1f27); color: var(--ink, #e7e7ea); font: inherit; resize: vertical; }
  .fb-err { color: #e0564b; font-size: 0.85rem; margin: 8px 0 0; }
  .fb-acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
  .fb-acts button { padding: 9px 16px; font-weight: 700; border-radius: 8px; cursor: pointer; }
  .fb-cancel { background: transparent; color: var(--muted, #9aa0aa); border: 1px solid var(--line, #2a2f3a); }
  .fb-send { background: var(--accent, #e0b341); color: #1a1a1a; border: none; }
  .fb-send:disabled { opacity: 0.55; cursor: default; }
  .fb-thanks { text-align: center; font-size: 1.1rem; font-weight: 700; margin: 8px 0; color: #7fdca0; }
</style>
