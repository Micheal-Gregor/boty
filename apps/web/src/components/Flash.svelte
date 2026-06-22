<script>
  import { ui } from "../lib/store.js";
  let { section } = $props();
  const show = $derived($ui.flash?.section === section);
</script>

{#if show}
  {#key $ui.flash.msg}<span class="flash">✗ {$ui.flash.msg}</span>{/key}
{/if}

<style>
  .flash { display: inline-block; color: #e8746a; font-size: 0.78em; font-weight: 600; margin-left: 8px; animation: flashfade 2.6s forwards; }
  @keyframes flashfade { 0% { opacity: 0; transform: translateY(-2px); } 8% { opacity: 1; transform: none; } 78% { opacity: 1; } 100% { opacity: 0; } }
</style>
