// Vercel serverless function: create a Stripe Checkout session for the $5 lifetime host license (or a
// donation). The buyer's card NEVER touches our code — Stripe hosts the payment page. On a successful
// payment the companion stripe-webhook function grants the license. All secrets live in Vercel env vars
// (never in the repo): STRIPE_SECRET_KEY, plus the Supabase URL + anon key to identify the signed-in buyer.
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !SUPABASE_URL || !SUPABASE_ANON) return res.status(500).json({ error: "Payments aren't configured." });
  try {
    // Who's buying? Validate the Supabase access token the client sent (never trust a client-supplied id).
    const authz = req.headers.authorization || "";
    const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Sign in first." });
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
    const { data: { user } = {}, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: "Invalid session." });

    const body = typeof req.body === "object" && req.body ? req.body : JSON.parse(req.body || "{}");
    const purpose = body.purpose === "donate" ? "donate" : "license";
    const origin = req.headers.origin || `https://${req.headers.host}`;
    // $5 for the license; a donation is $1–$1000 (default $5), clamped server-side.
    const amount = purpose === "donate" ? Math.max(100, Math.min(100000, Math.round(Number(body.amount) || 500))) : 500;

    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: { name: purpose === "donate" ? "Support Business of the Year" : "Business of the Year — Host License (lifetime)" },
        },
      }],
      client_reference_id: user.id,
      metadata: { user_id: user.id, purpose },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error("[create-checkout]", e?.message ?? e);
    return res.status(500).json({ error: "Couldn't start checkout." });
  }
}
