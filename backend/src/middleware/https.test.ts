import { describe, it, expect, afterEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import { requireHttps } from './https.js'

const app = express()
  .use(requireHttps())
  .get('/', (_req, res) => res.json({ ok: true }))

describe('requireHttps', () => {
  const env = process.env.NODE_ENV
  afterEach(() => {
    process.env.NODE_ENV = env
  })

  it('requireHttps rejects http in production', async () => {
    process.env.NODE_ENV = 'production'
    const res = await request(app).get('/').set('X-Forwarded-Proto', 'http')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'HTTPS required' })
  })

  it('allows https in production', async () => {
    process.env.NODE_ENV = 'production'
    expect((await request(app).get('/').set('X-Forwarded-Proto', 'https')).status).toBe(200)
  })

  it('allows http outside production', async () => {
    process.env.NODE_ENV = 'test'
    expect((await request(app).get('/').set('X-Forwarded-Proto', 'http')).status).toBe(200)
  })
})
