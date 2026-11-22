import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'http://localhost:5190',
    trace: 'on-first-retry',
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  webServer: [
    {
      command: `${path.resolve(here, 'node_modules/.bin/firebase')} emulators:start --project demo-pigeon-e2e --only auth,firestore`,
      cwd: path.resolve(here, '..'),
      url: 'http://127.0.0.1:9199',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    },
    {
      command: 'npm run start:e2e',
      cwd: path.resolve(here, '../backend'),
      port: 8190,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev:e2e',
      cwd: path.resolve(here, '../frontend'),
      port: 5190,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
