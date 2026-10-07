import { defineConfig } from "@playwright/test";

const PORT = 3110;

/**
 * End-to-end tests against a production build (`npm run build` first). They use the Chrome installed on
 * the machine, so no browser download is needed.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] },
  },
  webServer: {
    command: `npx next start --hostname 127.0.0.1 --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/lab`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
