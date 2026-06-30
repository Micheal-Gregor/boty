const { test, expect } = require("@playwright/test");

const enter = async (page, user) => {
  await page.goto(`/?mock=1&user=${user}&maxturns=2`);
  await page.getByRole("button", { name: /enter maple/i }).click();
  await page.getByRole("button", { name: /play online/i }).click();
};

// The keystone: two tabs in one context share the mock backend, and a join shows up LIVE on the
// host's page via the storage-event "realtime". If this works, the whole online flow is testable.
test("two tabs share a lobby live", async ({ browser }) => {
  const ctx = await browser.newContext();
  const alice = await ctx.newPage();
  const bob = await ctx.newPage();

  await enter(alice, "alice");
  await alice.getByRole("button", { name: /host a game/i }).click();
  const codeText = await alice.locator("text=/MAPLE-[A-Z0-9]{4}/").first().textContent();
  const code = codeText.match(/MAPLE-[A-Z0-9]{4}/)[0];

  await enter(bob, "bob");
  await bob.getByPlaceholder(/MAPLE/i).fill(code);
  await bob.getByRole("button", { name: /^join/i }).click();

  // bob's seat must appear LIVE on alice's lobby (the mock realtime).
  await expect(alice.locator(".seats")).toContainText("bob", { timeout: 10000 });
  await expect(bob.locator(".seats")).toContainText("alice", { timeout: 10000 });
});
