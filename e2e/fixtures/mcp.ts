import { readFileSync } from 'node:fs'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

export const MCP_URL = 'http://127.0.0.1:8190/mcp'
export const MCP_TOKEN = 'e2e-mcp-token-' + 'x'.repeat(50)

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

export const RUN = Date.now().toString(36)

export function fixture(name: 'sample-price-drop'): PriceFixture
export function fixture(name: Exclude<FixtureName, 'sample-price-drop'>): Fixture
export function fixture(name: FixtureName): Fixture
export function fixture(name: FixtureName): Fixture {
  return JSON.parse(readFileSync(new URL(`../../fixtures/${name}.json`, import.meta.url), 'utf8'))
}

export type SaveResult = {
  id: string
  status: string
  uiStatus: string
  uiIssues?: unknown[]
  url: string
}

export async function saveItem(input: object, overrides: object = {}): Promise<SaveResult> {
  const client = new Client({ name: 'e2e', version: '0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(MCP_URL), {
      requestInit: { headers: { Authorization: `Bearer ${MCP_TOKEN}` } },
    })
  )
  try {
    const result = await client.callTool({
      name: 'save_feed_item',
      arguments: { ...input, ...overrides },
    })
    const text = (result.content as { type: string; text: string }[])[0].text
    if (result.isError) throw new Error(text)
    return JSON.parse(text)
  } finally {
    await client.close()
  }
}
