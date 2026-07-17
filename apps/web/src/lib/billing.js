// Client side of billing. We never touch a card here — startCheckout asks our serverless function for a
// Stripe-hosted Checkout URL and redirects the browser to it. After paying, Stripe sends the user back to
// /?checkout=success; the webhook (server) has by then flipped profiles.licensed, so we just re-load the
// profile to reflect it. handleCheckoutReturn() runs that on app load.
import { get } from "svelte/store";
import { supabase, supabaseReady } from "./supabase.js";
import { loadProfile, myProfile } from "./social.js";

/** Kick off a Stripe Checkout for the $5 lifetime license ('license') or a donation ('donate', cents).
 *  Redirects to Stripe on success; returns { error } if it couldn't start. */
export async function startCheckout(purpose = "license", amount) {
  if (!supabaseReady) return { error: "Payments aren't configured." };
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { error: "Sign in first." };
  try {
    const res = await fetch("/api/create-checkout", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ purpose, amount }),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.url) { window.location.href = j.url; return {}; }
    return { error: j.error || "Couldn't start checkout." };
  } catch (e) {
    return { error: e?.message || "Network error — try again." };
  }
}

/** On app load: if we came back from Checkout, clean the URL and (on success) poll the profile until the
 *  webhook's license grant shows up. Returns { status: 'success'|'cancel', licensed? } or null. */
export async function handleCheckoutReturn() {
  if (typeof location === "undefined") return null;
  const status = new URLSearchParams(location.search).get("checkout");
  if (!status) return null;
  try { history.replaceState({}, "", location.pathname); } catch { /* ignore */ }
  if (status !== "success") return { status };
  // The webhook is async (usually <1s). Poll a few times for the license to land.
  for (let i = 0; i < 8; i++) {
    await loadProfile();
    if (get(myProfile)?.licensed) return { status: "success", licensed: true };
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { status: "success", licensed: false }; // paid, not reflected yet — it'll show on a later load
}
