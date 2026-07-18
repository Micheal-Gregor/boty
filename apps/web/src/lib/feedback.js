// Tester feedback: a signed-in player writes a note from inside the app; it's inserted into the Supabase
// `feedback` table for the owner to read in the dashboard. No external form, no backend of our own.
import { writable, get } from "svelte/store";
import { supabase, supabaseReady } from "./supabase.js";
import { user } from "./auth.js";
import { myProfile } from "./social.js";

export const feedbackOpen = writable(false);
export function openFeedback() { feedbackOpen.set(true); }
export function closeFeedback() { feedbackOpen.set(false); }

export async function sendFeedback(message, context) {
  if (!supabaseReady) return { error: "Feedback isn't available offline." };
  const me = get(user); if (!me) return { error: "Sign in first." };
  const msg = (message || "").trim();
  if (!msg) return { error: "Please write something first." };
  const { error } = await supabase.from("feedback").insert({
    user_id: me.id,
    username: get(myProfile)?.username ?? null,
    message: msg.slice(0, 2000),
    context: context ?? null,
  });
  return { error: error?.message ?? null };
}
