<script>
  import { onMount } from "svelte";
  import { ui } from "./lib/store.js";
  import { playSfx } from "./lib/sound.js";
  import { handleCheckoutReturn } from "./lib/billing.js";
  import Loading from "./screens/Loading.svelte";
  import Login from "./screens/Login.svelte";
  import Menu from "./screens/Menu.svelte";
  import Lobby from "./screens/Lobby.svelte";
  import History from "./screens/History.svelte";
  import Faq from "./screens/Faq.svelte";
  import Credits from "./screens/Credits.svelte";
  import Players from "./screens/Players.svelte";
  import Setup from "./screens/Setup.svelte";
  import Board from "./screens/Board.svelte";
  import Reckoning from "./screens/Reckoning.svelte";
  import Gala from "./screens/Gala.svelte";
  import TargetPicker from "./components/TargetPicker.svelte";
  import ResponseModal from "./components/ResponseModal.svelte";
  import CourtModal from "./components/CourtModal.svelte";
  import RoutingModal from "./components/RoutingModal.svelte";
  import SettleModal from "./components/SettleModal.svelte";
  import EstateModal from "./components/EstateModal.svelte";
  import CardModal from "./components/CardModal.svelte";
  import PoachModal from "./components/PoachModal.svelte";
  import MayorModal from "./components/MayorModal.svelte";
  import ReferralModal from "./components/ReferralModal.svelte";
  import Popup from "./components/Popup.svelte";
  import EntityCard from "./components/EntityCard.svelte";
  import HandView from "./components/HandView.svelte";
  import Confirm from "./components/Confirm.svelte";
  import Dice from "./components/Dice.svelte";
  import Settings from "./components/Settings.svelte";
  import UsernamePrompt from "./components/UsernamePrompt.svelte";
  import ObserverBanner from "./components/ObserverBanner.svelte";
  import SessionBanner from "./components/SessionBanner.svelte";
  import Feedback from "./components/Feedback.svelte";

  // One soft click for EVERY button press, app-wide (capture phase, so it still fires when a modal
  // stops propagation). Card opens / litigation / the Gala layer their own accent (flip/gavel/chime)
  // on top; this just guarantees no button — Next, Continue, End turn, header icons — is ever silent.
  onMount(() => {
    const onClick = (e) => { const b = e.target?.closest?.("button"); if (b && !b.disabled) playSfx("click", 0.3); };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  });

  // Returning from Stripe Checkout: confirm the purchase and reflect the license.
  let checkoutMsg = $state(null);
  onMount(async () => {
    const r = await handleCheckoutReturn();
    if (!r) return;
    if (r.status === "cancel") checkoutMsg = { ok: false, text: "Checkout cancelled — no charge was made." };
    else if (r.licensed) checkoutMsg = { ok: true, text: "🎉 Thanks! Your host license is active — you can host games now." };
    else checkoutMsg = { ok: true, text: "Payment received — thank you! Your unlock will appear in a moment." };
    setTimeout(() => (checkoutMsg = null), 8000);
  });
</script>

<main>
  {#if checkoutMsg}
    <div class="checkout-toast" class:err={!checkoutMsg.ok} role="status">{checkoutMsg.text}</div>
  {/if}
  {#if $ui.screen === "loading"}
    <Loading />
  {:else if $ui.screen === "login"}
    <Login />
  {:else if $ui.screen === "menu"}
    <Menu />
  {:else if $ui.screen === "lobby"}
    <Lobby />
  {:else if $ui.screen === "history"}
    <History />
  {:else if $ui.screen === "faq"}
    <Faq />
  {:else if $ui.screen === "credits"}
    <Credits />
  {:else if $ui.screen === "players"}
    <Players />
  {:else if $ui.screen === "setup"}
    <Setup />
  {:else if $ui.screen === "board"}
    <Board />
  {:else if $ui.screen === "reckoning"}
    <Reckoning />
  {:else if $ui.screen === "gala"}
    <Gala />
  {/if}

  <!-- Overlays render above any screen (incl. Reckoning/Last Licks + Gala) -->
  <ObserverBanner />
  <SessionBanner />
  <Feedback />
  <Popup />
  <EntityCard />
  <HandView />
  <Confirm />
  <Dice />
  <Settings />
  <UsernamePrompt />
  <CardModal />
  <SettleModal />
  <EstateModal />
  <CourtModal />
  <RoutingModal />
  <TargetPicker />
  <ResponseModal />
  <PoachModal />
  <MayorModal />
  <ReferralModal />
</main>
