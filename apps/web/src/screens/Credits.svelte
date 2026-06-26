<script>
  import { backToMenu } from "../lib/store.js";
  import Shell from "./Shell.svelte";

  // Fill in your name / collaborators where it says [Your name].
  const credits = [
    ["Created &amp; designed by", ["[Your name]"]],
    ["Art &amp; animation", ["[Your name]"]],
    ["Music &amp; sound", ["[Your name]"]],
    ["World &amp; story — Maple Hollow", ["Original fiction, in the small-town-Americana tradition"]],
    ["Engine &amp; build", ["Crafted with Claude Code (Anthropic)"]],
    ["With thanks to", ["the pre-launch testers of Maple Hollow"]],
  ];
</script>

<Shell bg="bbb_review" label="Credits">
  <div class="page">
    <button class="back" onclick={backToMenu}>← Menu</button>
    <p class="bbb">🎀 Business of the Year</p>
    <h1>Credits</h1>
    {#each credits as [role, names]}
      <section class="cr">
        <p class="role">{@html role}</p>
        {#each names as n}<p class="name">{@html n}</p>{/each}
      </section>
    {/each}
    <p class="closer">Maple Hollow is open for business. It always was.</p>
  </div>
</Shell>

<style>
  .page { background: rgba(16,18,24,0.72); border: 1px solid var(--line, #2a2f3a); border-radius: 14px; padding: 22px 24px; text-align: center; }
  .back { background: none; border: 1px solid var(--line, #2a2f3a); color: var(--muted, #9aa0aa); border-radius: 8px; padding: 6px 12px; cursor: pointer; margin-bottom: 12px; float: left; }
  .back:hover { color: var(--accent, #e0b341); border-color: var(--accent, #e0b341); }
  .bbb { color: var(--accent, #e0b341); font-weight: 600; margin: 8px 0 2px; clear: both; }
  h1 { margin: 0 0 22px; }
  .cr { margin: 0 0 18px; }
  .role { color: var(--muted, #9aa0aa); font-size: 0.82rem; letter-spacing: 0.05em; text-transform: uppercase; margin: 0 0 2px; }
  .name { font-size: 1.1rem; font-weight: 600; margin: 0; }
  .closer { color: var(--muted, #9aa0aa); font-style: italic; border-top: 1px solid var(--line, #2a2f3a); padding-top: 16px; margin-top: 8px; }
</style>
