import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './evals/tests',
  timeout: 30000,  // 30s per test — load-path tests use the tiny fixture (~100ms load); plenty of headroom for slower machines
  retries: 0,
  // Parallelize across CPU cores. The IFC-loading suite previously ran serially
  // because parallel loads of the real Condos model (3+ minutes each) starved
  // each other and tripped flaky timeouts. With the synthetic test fixture
  // (~100ms loads, see evals/fixtures/test-fixture.ifc), parallel execution is
  // safe and gives a ~4× speedup on the regression suite.
  workers: process.env.CI ? 2 : 4,
  fullyParallel: true,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3001',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 3001',
    url: 'http://localhost:3001',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
  reporter: [
    ['html', { outputFolder: 'evals/report' }],
    ['json', { outputFile: 'evals/results.json' }],
    ['list']
  ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
