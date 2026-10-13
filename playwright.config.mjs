// Playwright config for the WS2 browser smoke suite. Deliberately minimal:
// one Chromium project, one spec dir, a local zero-dependency static server.
// The site stays static/dependency-free at runtime; Playwright is test infra only.
import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 8188);

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,         // tiny deterministic suite
  forbidOnly: !!process.env.CI, // a stray test.only fails CI instead of silently narrowing
  retries: 0,
  workers: 1,
  reporter: [['list']],         // explicit terminal summary + interpretable exit status
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'node test/browser/static-server.mjs',
    url: `http://localhost:${PORT}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
