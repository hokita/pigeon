import { readFileSync } from 'node:fs'

// Test-only: the shared save_feed_item inputs in /fixtures (vitest runs from frontend/).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- fixtures are edited freely in tests
export function loadFixture(name: string): Record<string, any> {
  return JSON.parse(readFileSync(`../fixtures/${name}.json`, 'utf8'))
}
