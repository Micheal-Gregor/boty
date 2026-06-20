<script>
  import { ui } from "./lib/store.js";
  import Setup from "./screens/Setup.svelte";
  import Board from "./screens/Board.svelte";
  import Gala from "./screens/Gala.svelte";
</script>

<main>
  {#if $ui.screen === "setup"}
    <Setup />
  {:else if $ui.screen === "board"}
    <Board />
  {:else if $ui.screen === "gala"}
    <Gala />
  {/if}
</main>
