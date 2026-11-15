import express from 'express'
import cors from 'cors'

export function createApp() {
  const app = express()
  // The cors package does NOT default to "allow all" when origin is undefined — it emits
  // no CORS headers at all. Default to '*' explicitly so dev (FRONTEND_URL unset) works.
  app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })
  return app
}
