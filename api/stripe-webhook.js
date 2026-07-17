// Vercel serverless function: Stripe calls this on payment events. On a completed LICENSE checkout it
// flips profiles.licensed = true using the Supabase SERVICE-ROLE key (which bypasses RLS — a normal
// client can never grant a license). It verifies Stripe's signature against the RAW request body, so a
// forged call can't grant a license. Secrets (Vercel env, never the repo): STRIPE_SECRET_KEY,
// STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY (+ the Supabase URL).
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const config = { api: { bodyParser: false } }; // Stripe needs the exact raw bytes to verify the signature

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;

async function readRaw(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const key = process.env.STRIPE_SECRET_KEY;
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !whsec || !svc || !SUPABASE_URL) return res.status(500).json({ error: "Not configured" });

  const stripe = new Stripe(key);
  let event;
  try {
    const raw = await readRaw(req);
    event = stripe.webhooks.constructEvent(raw, req.headers["stripe-signature"], whsec);
  } catch (e) {
    console.error("[webhook] bad signature:", e?.message ?? e);
    return res.status(400).json({ error: "Bad signature" });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const userId = s.metadata?.user_id || s.client_reference_id;
    if (s.metadata?.purpose === "license" && userId && s.payment_status === "paid") {
      try {
        const admin = createClient(SUPABASE_URL, svc, { auth: { persistSession: false } });
        const { error } = await admin.from("profiles").update({ licensed: true }).eq("id", userId);
        if (error) throw error;
        console.log("[webhook] licensed", userId);
      } catch (e) {
        console.error("[webhook] license write failed:", e?.message ?? e);
        return res.status(500).json({ error: "write failed" }); // 500 → Stripe retries
      }
    }
  }
  return res.status(200).json({ received: true });
}
