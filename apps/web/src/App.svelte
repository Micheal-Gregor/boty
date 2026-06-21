<script>
  import { ui } from "./lib/store.js";
  import Setup from "./screens/Setup.svelte";
  import Board from "./screens/Board.svelte";
  import Reckoning from "./screens/Reckoning.svelte";
  import Gala from "./screens/Gala.svelte";
  import TargetPicker from "./components/TargetPicker.svelte";
  import ResponseModal from "./components/ResponseModal.svelte";
  import CourtModal from "./components/CourtModal.svelte";
</script>

<main>
  {#if $ui.screen === "setup"}
    <Setup />
  {:else if $ui.screen === "board"}
    <Board />
  {:else if $ui.screen === "reckoning"}
    <Reckoning />
  {:else if $ui.screen === "gala"}
    <Gala />
  {/if}

  <!-- Overlays render above any screen -->
  <CourtModal />
  <TargetPicker />
  <ResponseModal />
</main>
