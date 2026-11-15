import { defineConfig } from 'vitest/config'

// Runs only the Firestore-emulator tests (npm run test:db), one file at a time
// because they share the emulator's data.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.db.test.ts'],
    fileParallelism: false,
    setupFiles: ['src/testing/dbSetup.ts'],
  },
})
