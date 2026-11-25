import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'

vi.mock('./items/store.js', async (orig) => ({
  ...(await orig<typeof import('./items/store.js')>()),
  saveFeedItem: vi.fn(),
}))
vi.mock('./items/read.js', async (orig) => ({
  ...(await orig<typeof import('./items/read.js')>()),
  listItems: vi.fn(),
  listTypes: vi.fn(),
  getItem: vi.fn(),
}))
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: vi.fn().mockRejectedValue(new Error('no')) }),
}))

import { createApp } from './app.js'
import { listItems, listTypes } from './items/read.js'

const TOKEN = 't'.repeat(64)
const app = () => createApp({ mcpToken: TOKEN, frontendUrl: 'http://localhost:5190' })
const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 't', version: '0' },
  },
}

describe('app', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('GET /health returns ok', async () => {
    const res = await request(app()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it('/mcp without a token is 401', async () => {
    const res = await request(app()).post('/mcp').send(initialize)
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'Invalid token' })
  })

  it('/mcp with a wrong token is 401', async () => {
    const res = await request(app())
      .post('/mcp')
      .set('Authorization', `Bearer ${'x'.repeat(64)}`)
      .send(initialize)
    expect(res.status).toBe(401)
  })

  it('/mcp with MCP token unset is 401 even with a token-shaped header', async () => {
    const res = await request(createApp({ frontendUrl: 'http://localhost:5190' }))
      .post('/mcp')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(initialize)
    expect(res.status).toBe(401)
  })

  it('/mcp rejects a big unauthenticated body without parsing it', async () => {
    const res = await request(app())
      .post('/mcp')
      .set('Content-Type', 'application/json')
      .send('{' + 'x'.repeat(600_000))
    expect(res.status).toBe(401)
  })

  it('/mcp body over 512 KB is 413', async () => {
    const res = await request(app())
      .post('/mcp')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ ...initialize, pad: 'x'.repeat(530_000) }))
    expect(res.status).toBe(413)
  })

  it('/mcp with the token reaches the SDK', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await request(app())
      .post('/mcp')
      .set('Authorization', `Bearer ${TOKEN}`)
      .set('Accept', 'application/json')
      .send(initialize)
    expect(res.status).toBe(406)
    errSpy.mockRestore()
  })

  it('/api/items without sign-in is 401', async () => {
    expect((await request(app()).get('/api/items')).status).toBe(401)
    expect((await request(app()).get('/api/types')).status).toBe(401)
    expect(listItems).not.toHaveBeenCalled()
    expect(listTypes).not.toHaveBeenCalled()
  })

  it('/api/items rejects the MCP token', async () => {
    const res = await request(app()).get('/api/items').set('Authorization', `Bearer ${TOKEN}`)
    expect(res.status).toBe(401)
  })

  it('CORS allows only FRONTEND_URL', async () => {
    const evil = await request(app()).get('/health').set('Origin', 'http://evil.example')
    expect(evil.headers['access-control-allow-origin']).not.toBe('http://evil.example')
    const good = await request(app()).get('/health').set('Origin', 'http://localhost:5190')
    expect(good.headers['access-control-allow-origin']).toBe('http://localhost:5190')
  })

  it('CORS preflight allows POST to mark an item read', async () => {
    const res = await request(app())
      .options('/api/items/i_0123456789abcdef0123/read')
      .set('Origin', 'http://localhost:5190')
      .set('Access-Control-Request-Method', 'POST')
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-methods']).toContain('POST')
  })
})
