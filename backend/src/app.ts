import express from 'express'
import cors from 'cors'
import { authMiddleware } from './middleware/auth.js'
import { apiTokenAuth, apiTokenMatcher } from './middleware/apiToken.js'
import { requireHttps } from './middleware/https.js'
import { createRateLimiter } from './middleware/rateLimit.js'
import { createItemsRouter, createTypesRouter } from './routes/items.js'
import { createMcpRequestHandler } from './mcp/server.js'

const MCP_CALLS_PER_HOUR = 120

export type AppDeps = { mcpToken?: string; frontendUrl?: string }

export function createApp({ mcpToken, frontendUrl }: AppDeps = {}) {
  const app = express()
  app.use(requireHttps())
  app.use(cors({ origin: frontendUrl || '*' }))
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api', express.json({ limit: '100kb' }))
  app.use('/api/items', createItemsRouter({ userAuth: authMiddleware }))
  app.use('/api/types', createTypesRouter({ userAuth: authMiddleware }))

  const matches = apiTokenMatcher(mcpToken)
  const limiter = createRateLimiter({ limit: MCP_CALLS_PER_HOUR, windowMs: 60 * 60 * 1000 })
  app.all(
    '/mcp',
    apiTokenAuth({ matches }),
    express.json({ limit: '512kb' }),
    createMcpRequestHandler({ limiter, frontendUrl: frontendUrl || 'http://localhost:5180' })
  )
  return app
}
