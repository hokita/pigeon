import { getApps, initializeApp } from 'firebase-admin/app'
import { beforeEach } from 'vitest'

// Test-only: the Firestore emulator started by `npm run test:db`.
export const TEST_PROJECT = 'demo-pigeon-test'

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Run these tests with npm run test:db (needs the Firestore emulator)')
}
if (getApps().length === 0) initializeApp({ projectId: TEST_PROJECT })

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${TEST_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error(`Could not clear the emulator: ${res.status}`)
})
