import type { Request, RequestHandler, Response } from 'express'
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import type { CallToolResult } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { z } from 'zod'
import { parseFeedItemInput, saveFeedItemShape } from '../items/input.js'
import { saveFeedItem } from '../items/store.js'
import { listTypes } from '../items/read.js'
import type { RateLimiter } from '../middleware/rateLimit.js'
import { uiGuideText } from './guide.js'

export const SERVER_INSTRUCTIONS =
  'pigeon stores feed items for the owner. Always include a ui layout with every save_feed_item; call get_ui_guide once before building one. Use only URLs you actually visited; leave url out when there is none, and never invent one. Never invent prices or past prices; use PriceHistory for price history. Save each item once with save_feed_item; saving again with the same dedupeKey updates it.'

export const MISSING_UI_HINT =
  'No layout sent; this item shows as plain text. Call get_ui_guide and save again with a ui.'

function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] }
}

function toolError(message: string): CallToolResult {
  return { ...text(message), isError: true }
}

function limited<A>(
  limiter: RateLimiter,
  failure: string,
  run: (args: A) => Promise<CallToolResult>
): (args: A) => Promise<CallToolResult> {
  return async (args) => {
    const allowed = limiter.take()
    if (!allowed.ok) {
      return toolError(`Rate limit reached: try again in ${allowed.retryAfterSeconds} seconds`)
    }
    try {
      return await run(args)
    } catch (err) {
      console.error(failure, err instanceof Error ? err.message : err)
      return toolError('Internal error')
    }
  }
}

export function createPigeonMcpServer({
  limiter,
  frontendUrl,
  now = () => new Date(),
}: {
  limiter: RateLimiter
  frontendUrl: string
  now?: () => Date
}): McpServer {
  const server = new McpServer(
    { name: 'pigeon', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  )

  server.registerTool(
    'save_feed_item',
    {
      description:
        'Save one item (news, research, a price drop, anything) to the owner’s pigeon feed. Always include a ui layout for how to show it; without one the item shows as plain text. Saving again with the same dedupeKey replaces the item.',
      inputSchema: z.object(saveFeedItemShape),
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    limited(limiter, 'Failed to save feed item', async (args) => {
      const parsed = parseFeedItemInput(args, now())
      if (!parsed.ok) return toolError(parsed.error)
      const { id, status } = await saveFeedItem(parsed.value, parsed.ui)
      return text(
        JSON.stringify({
          id,
          status,
          uiStatus: parsed.ui.status,
          ...(parsed.ui.status === 'invalid' && { uiIssues: parsed.ui.issues }),
          ...(parsed.ui.status === 'missing' && { hint: MISSING_UI_HINT }),
          url: `${frontendUrl}/items/${id}`,
        })
      )
    })
  )

  server.registerTool(
    'get_ui_guide',
    {
      description:
        'Read the rules for building a ui tree: allowed components, limits, examples and the item types already in use. Call it once before building a tree.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    limited(limiter, 'Failed to build the UI guide', async () => {
      const types = await listTypes()
      return text(uiGuideText(types.map((t) => t.type)))
    })
  )

  return server
}

function logMcpError(err: Error) {
  console.error('MCP request failed:', err.message)
}

export function createMcpRequestHandler({
  limiter,
  frontendUrl,
}: {
  limiter: RateLimiter
  frontendUrl: string
}): RequestHandler {
  const factory = () => {
    const server = createPigeonMcpServer({ limiter, frontendUrl })
    server.server.onerror = logMcpError
    return server
  }
  const handle = toNodeHandler(createMcpHandler(factory, { onerror: logMcpError }), {
    onerror: logMcpError,
  })
  return (req: Request, res: Response) => {
    void handle(req, res, req.body)
  }
}
