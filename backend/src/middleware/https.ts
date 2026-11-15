import type { RequestHandler } from 'express'

// Cloud Run serves HTTPS only; this also refuses a request that reached the
// app over plain HTTP through a proxy (design §9).
export function requireHttps(): RequestHandler {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.get('x-forwarded-proto') === 'http') {
      res.status(403).json({ error: 'HTTPS required' })
      return
    }
    next()
  }
}
