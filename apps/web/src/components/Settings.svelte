<script>
  import { ui, closeSettings } from "../lib/store.js";
  import { settings, setSetting } from "../lib/settings.js";
  import { openFeedback } from "../lib/feedback.js";
  import { user, deleteAccount } from "../lib/auth.js";

  const open = $derived($ui.settingsOpen);
  const rivalOptions = [
    ["interesting", "Interesting only"],
    ["all", "All cards"],
    ["none", "None"],
  ];

  let confirmDelete = $state(false);
  let deleting = $state(false);
  let delError = $state("");

  async function doDelete() {
    if (deleting) return;
    deleting = true;
    delError = "";
    const { error } = await deleteAccount();
    if (error) { delError = error; deleting = false; return; }
    // Success → deleteAccount() signed us out; the app routes back to sign-in. Tidy the modal.
    deleting = false;
    confirmDelete = false;
    closeSettings();
  }
</script>

{#if open}
  <div class="pop-overlay" onclick={closeSettings}>
    <div class="pop settings" onclick={(e) => e.stopPropagation()}>
      <h2>⚙️ Settings</h2>

      <label class="set-row">
        <span>Sound effects</span>
        <input type="checkbox" checked={$settings.sound} onchange={(e) => setSetting("sound", e.currentTarget.checked)} />
      </label>
      <label class="set-row">
        <span>Music</span>
        <input type="checkbox" checked={$settings.music} onchange={(e) => setSetting("music", e.currentTarget.checked)} />
      </label>
      <label class="set-row vol">
        <span>Volume</span>
        <span class="vol-ctl">
          <input type="range" min="0" max="100" value={Math.round(($settings.volume ?? 0.7) * 100)} oninput={(e) => setSetting("volume", e.currentTarget.value / 100)} />
          <span class="vol-pct">{Math.round(($settings.volume ?? 0.7) * 100)}%</span>
        </span>
      </label>
      <label class="set-row">
        <span>Auto-close my pop-ups</span>
        <input type="checkbox" checked={$settings.autoClose} onchange={(e) => setSetting("autoClose", e.currentTarget.checked)} />
      </label>
      <label class="set-row">
        <span>Animate my cards on open</span>
        <input type="checkbox" checked={$settings.animateCards} onchange={(e) => setSetting("animateCards", e.currentTarget.checked)} />
      </label>
      <label class="set-row">
        <span>Card animation sound</span>
        <input type="checkbox" checked={$settings.cardSound} onchange={(e) => setSetting("cardSound", e.currentTarget.checked)} />
      </label>
      <p class="muted hint">Cards play clean by default. Turn these on for auto-playing, sounding card animations; the on-card buttons are gone, so the art shows uncluttered. Card sound rides the Volume slider above.</p>
      <label class="set-row">
        <span>Confirm before ending my turn</span>
        <input type="checkbox" checked={$settings.confirmEndTurn} onchange={(e) => setSetting("confirmEndTurn", e.currentTarget.checked)} />
      </label>

      <h3>Show amounts in</h3>
      <div class="seg">
        {#each [["usd", "Dollars ($)"], ["w", "Work-units (W)"]] as [val, label]}
          <button class="seg-btn" class:on={($settings.currency ?? "usd") === val} onclick={() => setSetting("currency", val)}>{label}</button>
        {/each}
      </div>
      <p class="muted hint">Money is shown in dollars at <strong>$50 per W</strong> — one <em>W</em> (work-unit) is a tradesperson's wage for one turn. Switch to <em>W</em> to read raw work-units. Job sizes, crew output and rankings are always counted in work, never cash.</p>

      <h3>Rivals' cards I want to see pop up</h3>
      <div class="seg">
        {#each rivalOptions as [val, label]}
          <button class="seg-btn" class:on={$settings.rivalPopups === val} onclick={() => setSetting("rivalPopups", val)}>{label}</button>
        {/each}
      </div>
      <p class="muted hint">“Interesting” = civic projects, big projects, building incidents, and any move against you.</p>

      {#if $user}<button class="fb-row" onclick={() => { closeSettings(); openFeedback(); }}>💬 Send feedback to the developer</button>{/if}
      <button class="pop-close" onclick={closeSettings}>Done</button>

      {#if $user}
        <div class="danger-zone">
          {#if !confirmDelete}
            <button class="danger-row" onclick={() => { delError = ""; confirmDelete = true; }}>🗑️ Delete my account</button>
          {:else}
            <p class="danger-warn">This permanently deletes your account and everything tied to it — your profile, your host license, and your seat in every game. It can't be undone.</p>
            {#if delError}<p class="err">{delError}</p>{/if}
            <div class="danger-actions">
              <button class="danger-confirm" onclick={doDelete} disabled={deleting}>{deleting ? "Deleting…" : "Yes, delete everything"}</button>
              <button class="danger-cancel" onclick={() => { confirmDelete = false; delError = ""; }} disabled={deleting}>Cancel</button>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .pop-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 70; padding: 16px; }
  .pop { background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 20px; max-width: 380px; width: 100%; max-height: 85vh; overflow-y: auto; }
  .pop h2 { margin: 0 0 12px; }
  .pop h3 { margin: 16px 0 8px; font-size: 0.92em; }
  .set-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line, #2a2f3a); }
  .set-row input { width: 20px; height: 20px; accent-color: var(--accent, #e0b341); }
  .vol-ctl { display: flex; align-items: center; gap: 10px; }
  .vol-ctl input[type="range"] { width: 150px; height: auto; accent-color: var(--accent, #e0b341); cursor: pointer; }
  .vol-pct { min-width: 36px; text-align: right; color: var(--muted, #9aa0aa); font-variant-numeric: tabular-nums; font-size: 0.9em; }
  .seg { display: flex; gap: 4px; }
  .seg-btn { flex: 1; padding: 8px; background: var(--panel-2, #1b1f27); border: 1px solid var(--line, #2a2f3a); border-radius: 8px; }
  .seg-btn.on { border-color: var(--accent, #e0b341); color: var(--accent, #e0b341); font-weight: 700; }
  .hint { font-size: 0.8em; margin: 8px 0 0; }
  .fb-row { margin-top: 16px; width: 100%; padding: 10px; font-weight: 700; background: var(--panel-2, #1b1f27); color: var(--accent, #e0b341); border: 1px solid var(--accent, #e0b341); border-radius: 8px; cursor: pointer; }
  .pop-close { margin-top: 8px; width: 100%; padding: 10px; font-weight: 700; }
  .danger-zone { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line, #2a2f3a); }
  .danger-row { width: 100%; padding: 9px; font-weight: 600; font-size: 0.9em; background: none; color: var(--muted, #9aa0aa); border: 1px solid var(--line, #2a2f3a); border-radius: 8px; cursor: pointer; }
  .danger-row:hover { color: #e0564b; border-color: #e0564b; }
  .danger-warn { font-size: 0.86em; color: #e7c9c6; line-height: 1.45; margin: 0 0 10px; }
  .danger-actions { display: flex; gap: 8px; }
  .danger-confirm { flex: 1; padding: 10px; font-weight: 700; background: #b23a2e; color: #fff; border: none; border-radius: 8px; cursor: pointer; }
  .danger-confirm:disabled { opacity: 0.6; cursor: default; }
  .danger-cancel { flex: 1; padding: 10px; font-weight: 700; background: var(--panel-2, #1b1f27); color: var(--ink, #e7e7ea); border: 1px solid var(--line, #2a2f3a); border-radius: 8px; cursor: pointer; }
  .err { color: #e0564b; font-size: 0.86em; margin: 0 0 8px; }
</style>
