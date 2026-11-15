import { readFileSync } from 'node:fs'

export type FixtureName =
  'sample-news' | 'sample-research' | 'sample-price-drop' | 'sample-invalid-ui'

// Test-only: the shared save_feed_item inputs in /fixtures. A fresh copy each call.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures are edited freely in tests
export function loadFixture(name: FixtureName): Record<string, any> {
  return JSON.parse(
    readFileSync(new URL(`../../../fixtures/${name}.json`, import.meta.url), 'utf8')
  )
}
