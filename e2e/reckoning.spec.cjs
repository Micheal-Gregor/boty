const { test, expect } = require("@playwright/test");
test.setTimeout(300000);

const SETTINGS = JSON.stringify({ sound: false, music: false, volume: 0, rivalPopups: "none", autoClose: true, animateCards: false, cardSound: false, confirmEndTurn: false, currency: "usd" });
const ADVANCE = /next|continue|got it|^ok\b|close|^✓|play ▶|begin|^roll\b|reveal/i;
const END = /end turn|done — pass|done.*pass/i;

async function setup(page, user) {
  await page.addInitScript((s) => localStorage.setItem("boty.settings", s), SETTINGS);
  await page.goto(`/?mock=1&user=${user}&maxturns=2`);
  await page.getByRole("button", { name: /enter maple/i }).click();
  await page.getByRole("button", { name: /play online/i }).click();
}
// One pass over this tab's visible buttons: dismiss a pop-up, else end the turn. Returns what it did.
async function step(page) {
  const btns = await page.locator("button:visible").all().catch(() => []);
  const texts = await Promise.all(btns.map((b) => b.textContent().catch(() => "")));
  for (let i = 0; i < btns.length; i++) if (ADVANCE.test((texts[i] || "").trim())) { await btns[i].click().catch(() => {}); return "advance"; }
  for (let i = 0; i < btns.length; i++) if (END.test((texts[i] || "").trim())) { if (await btns[i].isEnabled().catch(() => false)) { await btns[i].click().catch(() => {}); return "end"; } }
  return null;
}
const hdr = async (page) => ((await page.locator("main").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 90);
const atGala = (page) => page.locator("h1", { hasText: /Gala/i }).isVisible().catch(() => false);

test("two humans play to the Final Reckoning and both reach the Gala (no freeze)", async ({ browser }) => {
  const ctx = await browser.newContext();
  const alice = await ctx.newPage();
  const bob = await ctx.newPage();
  await setup(alice, "alice");
  await setup(bob, "bob");
  await alice.getByRole("button", { name: /host a game/i }).click();
  const code = (await alice.locator("text=/MAPLE-[A-Z0-9]{4}/").first().textContent()).match(/MAPLE-[A-Z0-9]{4}/)[0];
  await bob.getByPlaceholder(/MAPLE/i).fill(code);
  await bob.getByRole("button", { name: /^join/i }).click();
  await expect(alice.locator(".seats")).toContainText("bob", { timeout: 10000 });
  await alice.getByRole("button", { name: /start game/i }).click();

  let reached = false;
  for (let i = 0; i < 90; i++) {
    if ((await atGala(alice)) && (await atGala(bob))) { reached = true; break; }
    await step(alice); await step(bob);
    if (i % 20 === 0) console.log(`[${i}] A: ${await hdr(alice)} || B: ${await hdr(bob)}`);
    await alice.waitForTimeout(120);
  }
  if (!reached) {
    const ia = await alice.evaluate(() => window.__boty?.info?.()).catch(() => null);
    const ib = await bob.evaluate(() => window.__boty?.info?.()).catch(() => null);
    console.log("\nINFO A:", JSON.stringify(ia), "\nINFO B:", JSON.stringify(ib));
  }
  expect(reached, "both tabs reached the Gala without freezing").toBe(true);
});
