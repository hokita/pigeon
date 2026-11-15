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
  'pigeon stores feed items for the owner. Call get_ui_guide once before building a ui tree. Use only URLs you actually visited. Never invent prices or past prices; use PriceHistory for price history. Save each item once with save_feed_item; saving again with the same dedupeKey updates it.'

function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] }
}

function toolError(message: string): CallToolResult {
  return { ...text(message), isError: true }
}

// Each tool call takes from the limiter; protocol requests (initialize,
// tools/list) never reach a tool and aren't counted.
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
        'Save one item (news, research, a price drop, anything) to the owner’s pigeon feed, with an optional UI tree for how to show it. Saving again with the same dedupeKey replaces the item.',
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

// The SDK answers rejected requests (406, 415, bad protocol version, ...) itself
// and reports them through onerror; log only the message so a failing
// connector leaves a reason in the logs.
function logMcpError(err: Error) {
  console.error('MCP request failed:', err.message)
}

// Stateless: the SDK builds a fresh server per request. express.json() has
// already read the body, so it's passed in rather than re-read from the stream.
export function createMcpRequestHandler({
  limiter,
  frontendUrl,
}: {
  limiter: RateLimiter
  frontendUrl: string
}): RequestHandler {
  const factory = () => {
    const server = createPigeonMcpServer({ limiter, frontendUrl })
    // Transport-level rejections reach the server instance, not the handler.
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
