import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

vi.mock('../items/store.js', async (orig) => ({
  ...(await orig<typeof import('../items/store.js')>()),
  saveFeedItem: vi.fn(),
}))
vi.mock('../items/read.js', async (orig) => ({
  ...(await orig<typeof import('../items/read.js')>()),
  listTypes: vi.fn(),
}))

import { itemIdFor, saveFeedItem } from '../items/store.js'
import { listTypes } from '../items/read.js'
import { createRateLimiter, type RateLimiter } from '../middleware/rateLimit.js'
import { createMcpRequestHandler, MISSING_UI_HINT, SERVER_INSTRUCTIONS } from './server.js'
import { ALLOWED_TYPES } from '../ui/library.js'
import { loadFixture } from '../testing/fixtures.js'

let limiter: RateLimiter
let server: Server
let url: URL
const clients: Client[] = []
const FRONTEND = 'http://localhost:5190'

beforeAll(async () => {
  const delegating: RateLimiter = { take: () => limiter.take() }
  const app = express()
    .use(express.json({ limit: '512kb' }))
    .all('/mcp', createMcpRequestHandler({ limiter: delegating, frontendUrl: FRONTEND }))
  server = app.listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  url = new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`)
})

afterAll(() => new Promise((resolve) => server.close(resolve)))

beforeEach(() => {
  vi.clearAllMocks()
  limiter = createRateLimiter({ limit: 1000, windowMs: 3_600_000 })
  vi.mocked(saveFeedItem).mockImplementation(async (input) => ({
    id: itemIdFor(input.dedupeKey),
    status: 'created',
  }))
  vi.mocked(listTypes).mockResolvedValue([
    { type: 'news', count: 3, lastItemAt: '2026-11-15T00:00:00.000Z' },
    { type: 'research', count: 1, lastItemAt: '2026-11-14T00:00:00.000Z' },
  ])
})

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()))
})

async function connect() {
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(new StreamableHTTPClientTransport(url))
  clients.push(client)
  return client
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
  const [first] = result.content as { type: string; text: string }[]
  return first.text
}

const save = async (args: Record<string, unknown>) =>
  (await connect()).callTool({ name: 'save_feed_item', arguments: args })

describe('pigeon MCP server', () => {
  it('lists save_feed_item and get_ui_guide with annotations', async () => {
    const { tools } = await (await connect()).listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['get_ui_guide', 'save_feed_item'])
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]))
    expect(byName.save_feed_item.annotations).toMatchObject({
      destructiveHint: false,
      idempotentHint: true,
    })
    expect(byName.get_ui_guide.annotations?.readOnlyHint).toBe(true)
    const type = (
      byName.save_feed_item.inputSchema.properties as Record<
        string,
        { pattern?: string; enum?: unknown }
      >
    ).type
    expect(type.pattern).toBeTruthy()
    expect(type.enum).toBeUndefined()
  })

  it('initialize returns the server instructions', async () => {
    expect((await connect()).getInstructions()).toBe(SERVER_INSTRUCTIONS)
  })

  it('instructions ask for a ui on every save', () => {
    expect(SERVER_INSTRUCTIONS).toMatch(/always include a ui/i)
    expect(SERVER_INSTRUCTIONS).toMatch(/get_ui_guide/)
  })

  it('save_feed_item description asks for a ui layout', async () => {
    const { tools } = await (await connect()).listTools()
    expect(tools.find((t) => t.name === 'save_feed_item')!.description).toMatch(
      /always include a ui/i
    )
  })

  it('ui field description asks for a layout', async () => {
    const { tools } = await (await connect()).listTools()
    const ui = (
      tools.find((t) => t.name === 'save_feed_item')!.inputSchema.properties as Record<
        string,
        { description?: string }
      >
    ).ui
    expect(ui.description).toMatch(/always include/i)
    expect(ui.description).not.toMatch(/Optional/)
  })

  it('save_feed_item without ui saves and returns the hint', async () => {
    const result = await save({ ...loadFixture('sample-news'), ui: undefined })
    expect(result.isError).toBeFalsy()
    const id = itemIdFor('news:daily-ai:2026-11-15')
    expect(JSON.parse(textOf(result))).toEqual({
      id,
      status: 'created',
      uiStatus: 'missing',
      hint: MISSING_UI_HINT,
      url: `${FRONTEND}/items/${id}`,
    })
    expect(MISSING_UI_HINT).toBe(
      'No layout sent; this item shows as plain text. Call get_ui_guide and save again with a ui.'
    )
    expect(saveFeedItem).toHaveBeenCalledTimes(1)
  })

  it('save_feed_item saves the news fixture', async () => {
    const result = await save(loadFixture('sample-news'))
    expect(result.isError).toBeFalsy()
    const id = itemIdFor('news:daily-ai:2026-11-15')
    expect(JSON.parse(textOf(result))).toEqual({
      id,
      status: 'created',
      uiStatus: 'valid',
      url: `${FRONTEND}/items/${id}`,
    })
    expect(saveFeedItem).toHaveBeenCalledTimes(1)
  })

  it('save_feed_item with an invalid ui saves and reports issues', async () => {
    const result = await save(loadFixture('sample-invalid-ui'))
    expect(result.isError).toBeFalsy()
    const body = JSON.parse(textOf(result))
    expect(body.uiStatus).toBe('invalid')
    expect(body.uiIssues[0].path).toMatch(/^root/)
    expect(body.hint).toBeUndefined()
    expect(vi.mocked(saveFeedItem).mock.calls[0][1].status).toBe('invalid')
  })

  it('save_feed_item with a malformed ui envelope saves the item with uiStatus invalid', async () => {
    const result = await save({
      ...loadFixture('sample-news'),
      ui: { schemaVersion: 2, root: 'x' },
    })
    expect(result.isError).toBeFalsy()
    const body = JSON.parse(textOf(result))
    expect(body.status).toBe('created')
    expect(body.uiStatus).toBe('invalid')
    expect(body.uiIssues.length).toBeGreaterThan(0)
    expect(vi.mocked(saveFeedItem).mock.calls[0][1].status).toBe('invalid')
  })

  it('save_feed_item publishes ui without a schema the SDK would enforce, but still describes it', async () => {
    const { tools } = await (await connect()).listTools()
    const ui = (
      tools.find((t) => t.name === 'save_feed_item')!.inputSchema.properties as Record<
        string,
        { type?: unknown; properties?: unknown; description?: string }
      >
    ).ui
    expect(ui.type).toBeUndefined()
    expect(ui.properties).toBeUndefined()
    expect(ui.description).toMatch(/schemaVersion/)
    expect(ui.description).toMatch(/get_ui_guide/)
  })

  it('save_feed_item with invalid fields is a tool error', async () => {
    const result = await save({ ...loadFixture('sample-news'), type: 'Not A Slug' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/^Input validation error: .*type/s)
    expect(saveFeedItem).not.toHaveBeenCalled()
  })

  it('save_feed_item handler checks are tool errors with Invalid input', async () => {
    const raw = loadFixture('sample-price-drop')
    raw.products[0].observedAt = '2099-01-01T00:00:00Z'
    const result = await save(raw)
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('Invalid input: products.0.observedAt: Must not be in the future')
    expect(saveFeedItem).not.toHaveBeenCalled()
  })

  it('get_ui_guide contains every allowed component, the PriceHistory rule, the facts-vs-analysis rule and the existing types', async () => {
    const result = await (await connect()).callTool({ name: 'get_ui_guide', arguments: {} })
    const guide = textOf(result)
    for (const type of ALLOWED_TYPES) expect(guide).toContain(type)
    expect(guide).toContain(
      "Never put past prices in a Chart; use PriceHistory with the product's productKey or url — pigeon draws it from recorded observations."
    )
    expect(guide).toContain(
      'Prices are whole yen (JPY). Send productKey when the page shows a stable product code (SKU, JAN, model number).'
    )
    expect(guide).toContain(
      'Keep what the sources say and your own analysis in separate blocks. Put your analysis in an Alert titled "Muse\'s take".'
    )
    expect(guide).toContain("You don't need Citation nodes: the page always lists content.sources.")
    expect(guide).toContain('Item types already in use: news, research.')
  })

  it('store failure is Internal error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(saveFeedItem).mockRejectedValue(new Error('firestore down'))
    const result = await save(loadFixture('sample-news'))
    expect(result.isError).toBe(true)
    expect(textOf(result)).toBe('Internal error')
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  it('counts only tool calls against the limit', async () => {
    limiter = createRateLimiter({ limit: 3, windowMs: 3_600_000 })
    for (let i = 0; i < 3; i++) {
      const client = await connect()
      for (let j = 0; j < 5; j++) await client.listTools()
    }
    const client = await connect()
    const call = () => client.callTool({ name: 'get_ui_guide', arguments: {} })
    for (let i = 0; i < 3; i++) expect((await call()).isError).toBeFalsy()
    const limited = await call()
    expect(limited.isError).toBe(true)
    expect(textOf(limited)).toMatch(/^Rate limit reached: try again in \d+ seconds$/)
  })

  it('logs requests the SDK rejects, without the request headers', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: 'Bearer secret-value',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    expect(res.status).toBe(406)
    expect(errSpy).toHaveBeenCalledWith('MCP request failed:', expect.any(String))
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('secret-value')
    errSpy.mockRestore()
  })
})
