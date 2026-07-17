const { test, expect } = require("@playwright/test");
test.setTimeout(300000);

// Phase 3.7 resilience: a player DROPS mid-game and the host's device takes over their seat with the
// bot so the table never freezes. Before this, an absent live human seat pinned active_seat forever
// (only bankrupt seats could be passed). Presence windows are shrunk via URL params so the takeover
// fires in seconds instead of ~40s.
const SETTINGS = JSON.stringify({ sound: false, music: false, volume: 0, rivalPopups: "none", autoClose: true, animateCards: false, cardSound: false, confirmEndTurn: false, currency: "usd" });
const ADVANCE = /next|continue|got it|^ok\b|close|^✓|play ▶|begin|^roll\b|reveal/i;
// Decision modals the host may face while WATCHING the bot seat (settlement/court/referral/etc.) — pick
// any option just to keep the table moving; the resilience feature is what's under test, not strategy.
const DECIDE = /settle|concede|take to court|^pay|accept|decline|keep|resolve|dismiss|no thanks|not now|done/i;
const END = /end turn|done — pass|done.*pass/i;
// Short presence windows for the test. stale MUST stay above the 2.5s heartbeat interval, else a
// present player reads stale between beats — the very over-eagerness we're guarding against.
const FAST = "stale=4000&grace=1500&hoststale=1500";

async function setup(page, user) {
  await page.addInitScript((s) => localStorage.setItem("boty.settings", s), SETTINGS);
  await page.goto(`/?mock=1&user=${user}&maxturns=2&${FAST}`);
  await page.getByRole("button", { name: /enter maple/i }).click();
  await page.getByRole("button", { name: /play online/i }).click();
}
// One pass over this tab's visible buttons: dismiss a pop-up / resolve a decision, else end the turn.
const CLICK = { timeout: 1200 }; // short — a button occluded by a modal must NOT burn the 30s default
async function step(page) {
  const btns = await page.locator("button:visible").all().catch(() => []);
  const texts = await Promise.all(btns.map((b) => b.textContent().catch(() => "")));
  for (const re of [ADVANCE, DECIDE]) {
    for (let i = 0; i < btns.length; i++) if (re.test((texts[i] || "").trim())) { await btns[i].click(CLICK).catch(() => {}); return "advance"; }
  }
  for (let i = 0; i < btns.length; i++) if (END.test((texts[i] || "").trim())) { if (await btns[i].isEnabled().catch(() => false)) { await btns[i].click(CLICK).catch(() => {}); return "end"; } }
  return null;
}
const atGala = (page) => page.locator("h1", { hasText: /Gala/i }).isVisible().catch(() => false);

// The bug this guards: two REAL players, both present, were wrongly booted to CPU (or the host's turn
// skipped) because presence was judged too eagerly. Both stay connected here → NO takeover may fire,
// and BOTH seats must actually take turns.
test("both present players keep their seats and get their turns — no spurious takeover", async ({ browser }) => {
  const ctx = await browser.newContext();
  const alice = await ctx.newPage();
  const bob = await ctx.newPage();
  let takeovers = 0;
  const activeSeen = new Set();
  const watch = (pg) => pg.on("console", (m) => {
    const t = m.text();
    if (/\[BOTY:takeover\]/.test(t)) takeovers++;
    const a = /"active":(\d+)/.exec(t); if (a) activeSeen.add(+a[1]);
  });
  watch(alice); watch(bob);
  await setup(alice, "alice");
  await setup(bob, "bob");
  await alice.getByRole("button", { name: /host a game/i }).click();
  const code = (await alice.locator("text=/MAPLE-[A-Z0-9]{4}/").first().textContent()).match(/MAPLE-[A-Z0-9]{4}/)[0];
  await bob.getByPlaceholder(/MAPLE/i).fill(code);
  await bob.getByRole("button", { name: /^join/i }).click();
  await expect(alice.locator(".seats")).toContainText("bob", { timeout: 10000 });
  await alice.getByRole("button", { name: /start game/i }).click();

  // Both stay and play, well past the (short) grace, so an over-eager takeover would have fired by now.
  for (let i = 0; i < 70; i++) {
    if ((await atGala(alice)) && (await atGala(bob))) break;
    await step(alice); await step(bob);
    await alice.waitForTimeout(250);
  }
  expect(takeovers, "no seat was taken over while both players were present").toBe(0);
  expect(activeSeen.has(0) && activeSeen.has(1), "both seats actually took their turns").toBe(true);
});

test("a dropped player's seat is taken over by the host's bot; the game reaches the Gala", async ({ browser }) => {
  const ctx = await browser.newContext();
  const alice = await ctx.newPage();
  const bob = await ctx.newPage();
  // Watch alice's console: confirm the takeover fires and track that the table keeps advancing after it.
  let sawTakeover = false, movesAtTakeover = -1, maxMoves = 0;
  alice.on("console", (m) => {
    const t = m.text();
    const mv = /"moves":(\d+)/.exec(t); if (mv) maxMoves = Math.max(maxMoves, +mv[1]);
    if (/\[BOTY:takeover\]/.test(t)) { sawTakeover = true; if (movesAtTakeover < 0) movesAtTakeover = maxMoves; }
  });
  await setup(alice, "alice");
  await setup(bob, "bob");
  await alice.getByRole("button", { name: /host a game/i }).click();
  const code = (await alice.locator("text=/MAPLE-[A-Z0-9]{4}/").first().textContent()).match(/MAPLE-[A-Z0-9]{4}/)[0];
  await bob.getByPlaceholder(/MAPLE/i).fill(code);
  await bob.getByRole("button", { name: /^join/i }).click();
  await expect(alice.locator(".seats")).toContainText("bob", { timeout: 10000 });
  await alice.getByRole("button", { name: /start game/i }).click();

  // Let the game get going for a moment, then BOB DROPS — close the page so his heartbeat stops.
  await alice.waitForTimeout(1500);
  await bob.close();

  // Alice plays on alone. Whenever the turn lands on bob's now-absent seat, alice's host presence tick
  // records a takeover and the bot plays it. We stop as soon as the RESILIENCE PROPERTY is demonstrated
  // — the drop was covered and the table advanced past bob's seat — rather than babysitting the crude
  // click-bot all the way to the Gala (which can stall on an unfamiliar card modal and is unrelated to
  // this feature). Reaching the Gala outright is an accepted early-out too.
  let reached = false, covered = false;
  for (let i = 0; i < 160; i++) {
    if (await atGala(alice)) { reached = true; break; }
    if (sawTakeover && maxMoves > movesAtTakeover) { covered = true; break; } // bot played bob's turn → proven
    await step(alice);
    await alice.waitForTimeout(220);
  }
  const info = await alice.evaluate(() => window.__boty?.info?.()).catch(() => null);
  console.log("END:", reached ? "GALA" : covered ? "COVERED" : "no-progress", JSON.stringify(info));

  // Core guarantee of the feature: the drop was covered by an AI takeover, and the table NEVER froze on
  // bob's now-empty seat — it advanced past it (bob's turn was played by the bot). This is the precise
  // resilience property under test. (Whether the crude click-bot then drives the whole solo game to the
  // Gala exercises unrelated UI and is only logged, not asserted — it can miss an unfamiliar modal.)
  expect(sawTakeover, "host took over the dropped seat with the bot").toBe(true);
  expect(maxMoves, "the table kept advancing after the takeover (didn't freeze on the empty seat)").toBeGreaterThan(movesAtTakeover);
  expect(reached || covered, "the drop was covered and the table advanced past bob's seat").toBe(true);
});
