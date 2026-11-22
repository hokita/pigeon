import type { RequestHandler } from 'express'

export function requireHttps(): RequestHandler {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'production' && req.get('x-forwarded-proto') === 'http') {
      res.status(403).json({ error: 'HTTPS required' })
      return
    }
    next()
  }
}
