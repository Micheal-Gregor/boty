<script>
  import { ui, closeSettings } from "../lib/store.js";
  import { settings, setSetting } from "../lib/settings.js";

  const open = $derived($ui.settingsOpen);
  const rivalOptions = [
    ["interesting", "Interesting only"],
    ["all", "All cards"],
    ["none", "None"],
  ];
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
      <label class="set-row">
        <span>Auto-close my pop-ups</span>
        <input type="checkbox" checked={$settings.autoClose} onchange={(e) => setSetting("autoClose", e.currentTarget.checked)} />
      </label>

      <h3>Rivals' cards I want to see pop up</h3>
      <div class="seg">
        {#each rivalOptions as [val, label]}
          <button class="seg-btn" class:on={$settings.rivalPopups === val} onclick={() => setSetting("rivalPopups", val)}>{label}</button>
        {/each}
      </div>
      <p class="muted hint">“Interesting” = civic projects, big projects, building incidents, and any move against you.</p>

      <button class="pop-close" onclick={closeSettings}>Done</button>
    </div>
  </div>
{/if}

<style>
  .pop-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; z-index: 70; padding: 16px; }
  .pop { background: var(--panel, #161a22); border: 1px solid var(--accent, #e0b341); border-radius: 14px; padding: 18px 20px; max-width: 380px; width: 100%; }
  .pop h2 { margin: 0 0 12px; }
  .pop h3 { margin: 16px 0 8px; font-size: 0.92em; }
  .set-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line, #2a2f3a); }
  .set-row input { width: 20px; height: 20px; accent-color: var(--accent, #e0b341); }
  .seg { display: flex; gap: 4px; }
  .seg-btn { flex: 1; padding: 8px; background: var(--panel-2, #1b1f27); border: 1px solid var(--line, #2a2f3a); border-radius: 8px; }
  .seg-btn.on { border-color: var(--accent, #e0b341); color: var(--accent, #e0b341); font-weight: 700; }
  .hint { font-size: 0.8em; margin: 8px 0 0; }
  .pop-close { margin-top: 16px; width: 100%; padding: 10px; font-weight: 700; }
</style>
