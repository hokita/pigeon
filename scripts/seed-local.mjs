#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const token = process.env.PIGEON_MCP_TOKEN
if (!token) {
  console.error('Set PIGEON_MCP_TOKEN to the token in backend/.env')
  process.exit(1)
}
const urlFlag = process.argv.indexOf('--url')
const url = new URL(urlFlag > -1 ? process.argv[urlFlag + 1] : 'http://127.0.0.1:8180/mcp')

const require = createRequire(join(process.cwd(), 'package.json'))
const { Client, StreamableHTTPClientTransport } = await import(
  pathToFileURL(require.resolve('@modelcontextprotocol/client')).href
)

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'))

const earlier = fixture('sample-price-drop')
earlier.dedupeKey = 'price-watch:headphones:2026-11-14'
earlier.title = '[Sample] WH-2000 headphones at list price'
earlier.summary = '[Sample] An earlier check of the same products, one day before the price drop.'
earlier.products = earlier.products.map((p) => ({
  ...p,
  price: p.listPrice ?? p.price,
  observedAt: '2026-11-14T09:00:00+09:00',
}))

const inputs = [
  ['sample-price-drop (earlier)', earlier],
  ...['sample-news', 'sample-research', 'sample-price-drop', 'sample-invalid-ui'].map((n) => [
    n,
    fixture(n),
  ]),
]

const client = new Client({ name: 'pigeon-seed', version: '1.0.0' })
await client.connect(
  new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
)
try {
  for (const [name, args] of inputs) {
    const result = await client.callTool({ name: 'save_feed_item', arguments: args })
    const text = result.content?.[0]?.text ?? ''
    if (result.isError) {
      console.error(`${name}: ${text}`)
      process.exitCode = 1
      continue
    }
    const { status, uiStatus, url: itemUrl } = JSON.parse(text)
    console.log(`${status} ${uiStatus} ${name} ${itemUrl}`)
  }
} finally {
  await client.close()
}
