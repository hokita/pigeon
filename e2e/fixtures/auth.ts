import { expect, type Page } from '@playwright/test'

export const AUTH_EMULATOR_URL = 'http://127.0.0.1:9199'
export const FIRESTORE_EMULATOR_URL = 'http://127.0.0.1:8181'
export const PROJECT_ID = 'demo-pigeon-e2e'
export const TEST_EMAIL = 'e2e@example.com'
export const TEST_PASSWORD = 'e2e-test-password-123'

export async function signIn(page: Page, path = '/') {
  await page.goto(path)
  await page.getByRole('button', { name: 'Sign in with Google' }).click()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
}

export async function routeImages(page: Page) {
  await page.route(/^https:\/\/[^/]*example\.(com|org|net)\//, (route) =>
    route.fulfill({ path: new URL('../assets/sample.png', import.meta.url).pathname })
  )
}
