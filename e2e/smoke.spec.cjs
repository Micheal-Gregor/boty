const { test, expect } = require("@playwright/test");
test("mock mode boots the app signed-in", async ({ page }) => {
  await page.goto("/?mock=1&user=alice");
  await expect(page.locator("main")).toContainText("Business of the Year");
});
