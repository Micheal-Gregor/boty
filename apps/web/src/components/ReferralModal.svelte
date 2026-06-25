<script>
  import { ui, resolveReferralUI } from "../lib/store.js";
  const r = $derived(($ui.referral ?? [])[0] ?? null);
  const players = $derived($ui.view?.players ?? []);
  const referrer = $derived(r ? players.find((p) => p.id === r.referrer_id)?.name ?? "A rival" : "");
</script>

{#if r}
  <div class="ent-overlay">
    <div class="confirm" onclick={(e) => e.stopPropagation()}>
      <h2>🤝 A job comes your way</h2>
      <p class="cbody"><strong>{referrer}</strong> can't do this one — it's your trade. Take <strong>{r.job?.name ?? "the job"}</strong> ({r.job?.value} W) and they collect a <strong>{r.fee} W</strong> finder's fee; or pass and it walks.</p>
      <div class="cbtns">
        <button class="no" onclick={() => resolveReferralUI(r.id, false)}>Pass</button>
        <button class="yes" onclick={() => resolveReferralUI(r.id, true)}>Take it ▶</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .ent-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 76; padding: 16px; }
  .confirm { background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 20px; max-width: 400px; width: 100%; }
  .confirm h2 { margin: 0 0 8px; }
  .cbody { color: var(--ink, #e7e7ea); margin: 0 0 14px; }
  .cbtns { display: flex; gap: 8px; }
  .cbtns button { flex: 1; padding: 10px; font-weight: 700; border-radius: 8px; }
  .cbtns .no { background: var(--panel-2, #1b1f27); color: var(--ink, #e7e7ea); border: 1px solid var(--line, #2a2f3a); }
  .cbtns .yes { background: var(--accent, #e0b341); color: #1a1a1a; border: none; }
</style>
