import { describe, it, expect, vi, beforeEach } from 'vitest'
import express, { type RequestHandler } from 'express'
import request from 'supertest'

const listItems = vi.fn()
const listTypes = vi.fn()
const getItem = vi.fn()
vi.mock('../items/read.js', async (orig) => ({
  ...(await orig<typeof import('../items/read.js')>()),
  listItems: (...a: unknown[]) => listItems(...a),
  listTypes: (...a: unknown[]) => listTypes(...a),
  getItem: (...a: unknown[]) => getItem(...a),
}))

import { createItemsRouter, createTypesRouter } from './items.js'
import { encodeCursor } from '../items/read.js'

const allow: RequestHandler = (_req, _res, next) => next()
const reject: RequestHandler = (_req, res) => {
  res.status(401).json({ error: 'Unauthorized' })
}

function app(userAuth = allow) {
  return express()
    .use('/api/items', createItemsRouter({ userAuth }))
    .use('/api/types', createTypesRouter({ userAuth }))
}

const ID = 'i_0123456789abcdef0123'

describe('items router', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listItems.mockResolvedValue({ items: [], nextCursor: null })
    listTypes.mockResolvedValue([
      { type: 'news', count: 1, lastItemAt: '2026-11-15T00:00:00.000Z' },
    ])
  })

  it('GET / passes type, limit and cursor', async () => {
    const cursor = encodeCursor({ createdAt: '2026-11-15T00:00:00.000Z', id: ID })
    const res = await request(app()).get(`/api/items?type=news&limit=5&cursor=${cursor}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [], nextCursor: null })
    expect(listItems).toHaveBeenCalledWith({ type: 'news', limit: 5, cursor })
  })

  it('limit defaults to 20', async () => {
    await request(app()).get('/api/items')
    expect(listItems).toHaveBeenCalledWith({ limit: 20 })
  })

  it('GET /?type=video passes type video', async () => {
    await request(app()).get('/api/items?type=video')
    expect(listItems).toHaveBeenCalledWith({ type: 'video', limit: 20 })
  })

  it.each([
    'type=Bad%20Type',
    'limit=0',
    'limit=51',
    'limit=abc',
    'cursor=garbage',
    'type=a&type=b',
  ])('GET /?%s is 400', async (query) => {
    const res = await request(app()).get(`/api/items?${query}`)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String) })
    expect(listItems).not.toHaveBeenCalled()
  })

  it('GET /api/types returns listTypes()', async () => {
    const res = await request(app()).get('/api/types')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      types: [{ type: 'news', count: 1, lastItemAt: '2026-11-15T00:00:00.000Z' }],
    })
  })

  it('GET /:id returns the item', async () => {
    getItem.mockResolvedValue({ item: { id: ID }, priceHistories: {} })
    const res = await request(app()).get(`/api/items/${ID}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ item: { id: ID }, priceHistories: {} })
    expect(getItem).toHaveBeenCalledWith(ID)
  })

  it('GET /:id is 404 when missing', async () => {
    getItem.mockResolvedValue(null)
    const res = await request(app()).get(`/api/items/${ID}`)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'Not found' })
  })

  it('GET /:id with an invalid id is 404 without a read', async () => {
    const res = await request(app()).get('/api/items/bad-id')
    expect(res.status).toBe(404)
    expect(getItem).not.toHaveBeenCalled()
  })

  it('requires userAuth', async () => {
    const a = app(reject)
    expect((await request(a).get('/api/items')).status).toBe(401)
    expect((await request(a).get(`/api/items/${ID}`)).status).toBe(401)
    expect((await request(a).get('/api/types')).status).toBe(401)
    expect(listItems).not.toHaveBeenCalled()
    expect(getItem).not.toHaveBeenCalled()
    expect(listTypes).not.toHaveBeenCalled()
  })

  it('read failure is 500 Internal error, logging the error but not request headers', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    listItems.mockRejectedValue(new Error('boom'))
    const res = await request(app())
      .get('/api/items')
      .set('Authorization', 'Bearer secret-id-token')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal error' })
    expect(error).toHaveBeenCalled()
    expect(JSON.stringify(error.mock.calls)).not.toContain('secret-id-token')
    error.mockRestore()
  })
})
