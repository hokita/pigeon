import { Router, type Request, type RequestHandler, type Response } from 'express'
import { decodeCursor, getItem, listItems, listTypes } from '../items/read.js'

const TYPE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const ID_PATTERN = /^i_[0-9a-f]{20}$/
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

type Handler = (req: Request, res: Response) => Promise<void>

// Logs the error itself, never the request (its headers carry the ID token).
function guarded(handler: Handler): RequestHandler {
  return async (req, res) => {
    try {
      await handler(req, res)
    } catch (err) {
      console.error('Read failed:', err instanceof Error ? err.message : err)
      res.status(500).json({ error: 'Internal error' })
    }
  }
}

function parseListQuery(query: Request['query']) {
  const { type, limit, cursor } = query
  if (type !== undefined && (typeof type !== 'string' || !TYPE_PATTERN.test(type))) {
    return { error: 'Invalid type' }
  }
  let n = DEFAULT_LIMIT
  if (limit !== undefined) {
    n = typeof limit === 'string' && /^\d+$/.test(limit) ? Number(limit) : NaN
    if (!(n >= 1 && n <= MAX_LIMIT)) return { error: `limit must be 1–${MAX_LIMIT}` }
  }
  if (cursor !== undefined && (typeof cursor !== 'string' || !decodeCursor(cursor))) {
    return { error: 'Invalid cursor' }
  }
  return {
    opts: {
      ...(type !== undefined && { type: type as string }),
      limit: n,
      ...(cursor !== undefined && { cursor: cursor as string }),
    },
  }
}

export function createItemsRouter({ userAuth }: { userAuth: RequestHandler }): Router {
  const router = Router()
  router.use(userAuth)
  router.get(
    '/',
    guarded(async (req, res) => {
      const parsed = parseListQuery(req.query)
      if (!parsed.opts) {
        res.status(400).json({ error: parsed.error })
        return
      }
      res.json(await listItems(parsed.opts))
    })
  )
  router.get(
    '/:id',
    guarded(async (req, res) => {
      const id = String(req.params.id)
      const found = ID_PATTERN.test(id) ? await getItem(id) : null
      if (!found) {
        res.status(404).json({ error: 'Not found' })
        return
      }
      res.json(found)
    })
  )
  return router
}

export function createTypesRouter({ userAuth }: { userAuth: RequestHandler }): Router {
  const router = Router()
  router.use(userAuth)
  router.get(
    '/',
    guarded(async (_req, res) => {
      res.json({ types: await listTypes() })
    })
  )
  return router
}
