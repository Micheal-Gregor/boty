// Online lobby data layer. A "game" is a row in Supabase; players claim rows in game_seats. While
// you're in a lobby we subscribe to Realtime so seats appear/leave live. The actual turn-by-turn
// game sync (the RemoteTransport) is the next phase — here we get people into the same room.

import { writable, get } from "svelte/store";
import { supabase, supabaseReady } from "./supabase.js";
import { user } from "./auth.js";
import { myProfile } from "./social.js";
import economy from "@boty/engine/data/economy.json";

const TRADES = economy.services ?? [];
// The first trade no seat has taken — so a joining human starts with a trade (never "unassigned"),
// which they can still switch in the lobby.
const firstFreeTrade = (seats) => TRADES.find((t) => !(seats ?? []).some((s) => s.trade === t)) ?? null;

export const onlineGame = writable(null);   // the current games row (or null)
export const onlineSeats = writable([]);    // game_seats rows for it, ordered by seat
export const lobbyBusy = writable(false);   // a request is in flight
export const lobbyError = writable(null);   // last error to show
export const lobbyNote = writable(null);    // a friendly, non-error message

const MAX_SEATS = 6;
let channel = null;

const fail = (e) => { lobbyError.set(typeof e === "string" ? e : (e?.message ?? String(e))); lobbyBusy.set(false); return null; };
const nameOf = () => get(myProfile)?.username ?? (get(user)?.email ?? "player").split("@")[0]; // show the username, never the email
function genCode() {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let s = ""; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
  return `MAPLE-${s}`;
}
const firstOpenSeat = (seats) => { const t = new Set(seats.map((s) => s.seat)); let n = 0; while (t.has(n)) n++; return n; };

/** Claim the next open seat, resilient to a race: two clients (or rapid Add-AI clicks) can compute the
 *  SAME open seat off a stale seat list and collide on the (game_id, seat) unique index (a 409). So
 *  refetch the LIVE seats each attempt and, on a unique-violation, loop to grab the next free one.
 *  `rowFor(seat)` returns the extra columns. Returns the claimed seat, or -1 if the lobby is full. */
async function claimSeat(gameId, rowFor) {
  for (let tries = 0; tries < 8; tries++) {
    const { data: seats } = await supabase.from("game_seats").select("seat").eq("game_id", gameId);
    const seat = firstOpenSeat(seats ?? []);
    if (seat >= MAX_SEATS) return -1;
    const { error } = await supabase.from("game_seats").insert({ game_id: gameId, seat, ...rowFor(seat) });
    if (!error) return seat;
    if (error.code !== "23505" && !/duplicate|unique|conflict/i.test(error.message ?? "")) throw error; // a real error, not a seat race
    // else: someone took that seat between fetch and insert — refetch and try the next one
  }
  throw new Error("The lobby's busy filling seats — try again.");
}

/** Host a new game — creates the row, claims seat 0, and drops you into its lobby. */
export async function hostGame(difficulty = "standard") {
  if (!supabaseReady) return fail("Online play isn't configured.");
  const me = get(user); if (!me) return fail("Sign in first.");
  lobbyError.set(null); lobbyNote.set(null); lobbyBusy.set(true);
  let game = null;
  for (let tries = 0; tries < 5 && !game; tries++) {
    const { data, error } = await supabase.from("games").insert({ code: genCode(), difficulty }).select().single();
    if (!error) game = data;
    else if (!/duplicate|unique/i.test(error.message)) return fail(error);
  }
  if (!game) return fail("Couldn't reserve a game code — try again.");
  const { error: se } = await supabase.from("game_seats").insert({ game_id: game.id, seat: 0, user_id: me.id, display_name: nameOf(), trade: firstFreeTrade([]) });
  if (se) return fail(se);
  await enterGame(game);
  lobbyBusy.set(false);
}

/** Join an existing lobby by its code. */
export async function joinByCode(rawCode) {
  if (!supabaseReady) return fail("Online play isn't configured.");
  const me = get(user); if (!me) return fail("Sign in first.");
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return fail("Enter a game code.");
  lobbyError.set(null); lobbyNote.set(null); lobbyBusy.set(true);
  const { data: game, error } = await supabase.from("games").select("*").eq("code", code).eq("status", "lobby").maybeSingle();
  if (error) return fail(error);
  if (!game) return fail("No open game with that code.");
  const { data: seats } = await supabase.from("game_seats").select("*").eq("game_id", game.id);
  if (!(seats ?? []).some((s) => s.user_id === me.id)) { // not already seated
    try { if (await claimSeat(game.id, () => ({ user_id: me.id, display_name: nameOf(), trade: firstFreeTrade(seats ?? []) })) < 0) return fail("That game is full."); }
    catch (e) { return fail(e); }
  }
  await enterGame(game);
  lobbyBusy.set(false);
}

/** Pick your trade (each trade can be taken once — the UI offers only free ones). */
export async function pickTrade(trade) {
  const g = get(onlineGame), me = get(user); if (!g || !me) return;
  await supabase.from("game_seats").update({ trade }).eq("game_id", g.id).eq("user_id", me.id);
  await refreshSeats(g.id);
}

/** Host: set (or clear, with null) a specific seat's trade — used to pin a CPU seat. RLS lets the
 *  host write any seat; an empty trade means "auto", filled from the free trades at Start. */
export async function setSeatTrade(seat, trade) {
  const g = get(onlineGame); if (!g) return;
  await supabase.from("game_seats").update({ trade: trade || null }).eq("game_id", g.id).eq("seat", seat);
  await refreshSeats(g.id);
}

/** Host: add a CPU seat. */
export async function addAiSeat() {
  const g = get(onlineGame); if (!g) return;
  try { if (await claimSeat(g.id, (s) => ({ is_ai: true, display_name: `CPU ${s + 1}` })) < 0) return; }
  catch (e) { return fail(e); }
  await refreshSeats(g.id);
}

/** Host: remove a seat (kick a player or drop a CPU). */
export async function removeSeat(seat) {
  const g = get(onlineGame); if (!g) return;
  await supabase.from("game_seats").delete().eq("game_id", g.id).eq("seat", seat);
  await refreshSeats(g.id);
}

/** Leave the lobby — the host closes the whole game; a guest just frees their seat. */
export async function leaveGame() {
  const g = get(onlineGame), me = get(user);
  if (g && me) {
    if (g.host_id === me.id) await supabase.from("games").delete().eq("id", g.id);
    else await supabase.from("game_seats").delete().eq("game_id", g.id).eq("user_id", me.id);
  }
  teardown();
}

/** Replace the seat rows with a contiguous 0..n-1 set (called at Start). Keeps the engine's seat
 *  index == game_seats.seat, which the RLS turn-lock relies on even if someone left a gap. */
export async function replaceSeats(seats) {
  const g = get(onlineGame); if (!g) return;
  await supabase.from("game_seats").delete().eq("game_id", g.id);
  await supabase.from("game_seats").insert(seats.map((s) => ({ game_id: g.id, seat: s.seat, user_id: s.user_id, display_name: s.name, trade: s.trade, is_ai: s.is_ai })));
}

/** Write game state/status to the row (the sync primitive). RLS lets the host or the active player
 *  through. Used by the store's online transport to persist the seed + move log + whose turn it is. */
export async function writeGameState(patch) {
  const g = get(onlineGame); if (!g) return { error: "no game" };
  const { error } = await supabase.from("games").update(patch).eq("id", g.id);
  return { error: error?.message ?? null };
}

/** Read the current game row fresh. The store polls this as a fallback for Realtime messages that
 *  never arrive (a dropped channel, a flaky link) — without it, a single missed update wedges the
 *  deterministic lockstep forever. Returns the row, or null on any error (the next poll retries). */
export async function fetchGameRow() {
  const g = get(onlineGame); if (!g) return null;
  const { data, error } = await supabase.from("games").select("*").eq("id", g.id).maybeSingle();
  return error ? null : data;
}

// --- internals -------------------------------------------------------------------------------
async function enterGame(game) {
  onlineGame.set(game);
  await refreshSeats(game.id);
  subscribe(game.id);
}

async function refreshSeats(gameId) {
  const { data } = await supabase.from("game_seats").select("*").eq("game_id", gameId).order("seat");
  onlineSeats.set(data ?? []);
}

function subscribe(gameId) {
  if (channel) supabase.removeChannel(channel);
  channel = supabase
    .channel(`game:${gameId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "game_seats", filter: `game_id=eq.${gameId}` }, () => refreshSeats(gameId))
    .on("postgres_changes", { event: "*", schema: "public", table: "games", filter: `id=eq.${gameId}` }, (p) => {
      if (p.eventType === "DELETE") { lobbyNote.set("The host closed the lobby."); teardown(); }
      else onlineGame.set(p.new);
    })
    .subscribe();
}

function teardown() {
  if (channel) { supabase.removeChannel(channel); channel = null; }
  onlineGame.set(null); onlineSeats.set([]); lobbyError.set(null);
}
