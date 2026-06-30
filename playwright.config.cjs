const { defineConfig } = require("@playwright/test");
// Drives the system Chrome (no download) against the running dev server. Tests live in ./e2e.
module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 90000,
  reporter: "list",
  use: { baseURL: "http://localhost:5179", channel: "chrome", headless: true },
});
