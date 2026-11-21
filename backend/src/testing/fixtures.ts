import { readFileSync } from 'node:fs'

export type FixtureName =
  'sample-news' | 'sample-research' | 'sample-price-drop' | 'sample-invalid-ui'

export type FixtureSource = {
  title: string
  url: string
  publisher?: string
  publishedAt?: string
}

export type FixtureProduct = {
  name: string
  url: string
  price: number
  productKey?: string
  listPrice?: number
  imageUrl?: string
  retailer?: string
  currency?: string
  observedAt?: string
}

export type FixtureNode = {
  _type: string
  product?: string
  children?: FixtureNode[]
  [key: string]: unknown
}

export type FixtureRoot = FixtureNode & { children: FixtureNode[] }

export type Fixture = {
  type: string
  title: string
  summary: string
  dedupeKey?: string
  publishedAt?: string
  content: { markdown: string; sources: FixtureSource[] }
  products?: FixtureProduct[]
  ui: { schemaVersion: number; root: FixtureRoot }
}

export type PriceFixture = Fixture & { products: FixtureProduct[] }

// Test-only: the shared save_feed_item inputs in /fixtures. A fresh copy each call.
export function loadFixture(name: 'sample-price-drop'): PriceFixture
export function loadFixture(name: Exclude<FixtureName, 'sample-price-drop'>): Fixture
export function loadFixture(name: FixtureName): Fixture
export function loadFixture(name: FixtureName): Fixture {
  return JSON.parse(
    readFileSync(new URL(`../../../fixtures/${name}.json`, import.meta.url), 'utf8')
  )
}
