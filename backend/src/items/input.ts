import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalUrl, checkImageUrl, checkLinkUrl, productIdFor } from '../urls.js'
import { validateUiTree, type StoredUi, type UiIssue, type UiNode } from '../ui/validate.js'

const TYPE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const KEY_PATTERN = /^[A-Za-z0-9:._/-]{1,200}$/
const CLOCK_SKEW_MS = 5 * 60_000
const MAX_ERRORS = 10

const urlString = (check: (v: string) => string | null) =>
  z.string().superRefine((v, ctx) => {
    const message = check(v)
    if (message) ctx.addIssue({ code: 'custom', message })
  })

const isoDateTime = z.iso.datetime({ offset: true })
const yen = z.number().int().min(0).max(1_000_000_000)

export const saveFeedItemShape = {
  type: z
    .string()
    .regex(TYPE_PATTERN, 'Must be a short lowercase slug like news, research or price-watch')
    .describe(
      'What kind of item this is: a short lowercase slug such as news, research or price-watch. Reuse a type get_ui_guide lists when one fits.'
    ),
  title: z.string().trim().min(1).max(200).describe('Headline shown in the feed and on the page.'),
  summary: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe('One or two plain-text sentences shown under the title in the feed.'),
  publishedAt: isoDateTime
    .optional()
    .describe('When the news or finding was published, ISO 8601 with a time zone. Optional.'),
  dedupeKey: z
    .string()
    .regex(KEY_PATTERN, 'Use letters, digits and : . _ / - only (max 200)')
    .optional()
    .describe(
      'Stable key for this item, e.g. news:daily-ai:2026-11-15. Saving again with the same key replaces the item. Defaults to type, title and the Tokyo date.'
    ),
  content: z
    .strictObject({
      markdown: z
        .string()
        .trim()
        .min(1)
        .max(20_000)
        .describe(
          'Your write-up in Markdown. This is the record; it is shown if the ui cannot be.'
        ),
      sources: z
        .array(
          z.strictObject({
            title: z.string().trim().min(1).max(300).describe('Title of the page you used.'),
            url: urlString(checkLinkUrl).describe(
              'URL of the page you actually visited (http or https).'
            ),
            publisher: z.string().trim().max(100).optional().describe('Site or publisher name.'),
            publishedAt: z
              .string()
              .max(40)
              .optional()
              .describe('When the source was published, if known.'),
          })
        )
        .min(1)
        .max(30)
        .describe('Every page you used, 1 to 30. The page always lists them under Sources.'),
    })
    .describe('The item itself: your write-up and its sources.'),
  products: z
    .array(
      z.strictObject({
        name: z.string().trim().min(1).max(200).describe('Product name.'),
        url: urlString(checkLinkUrl).describe('Product page URL.'),
        productKey: z
          .string()
          .regex(KEY_PATTERN, 'Use letters, digits and : . _ / - only (max 200)')
          .optional()
          .describe(
            'Stable product code if the page shows one (SKU, JAN, model number), e.g. sku:wh-2000.'
          ),
        price: yen.describe('Price seen on the page right now, in whole yen.'),
        listPrice: yen
          .optional()
          .describe('The "was" or list price shown on the page, in whole yen.'),
        imageUrl: urlString(checkImageUrl).optional().describe('Product image URL (https).'),
        retailer: z.string().trim().max(100).optional().describe('Shop name.'),
        observedAt: isoDateTime
          .optional()
          .describe('When you read the price, ISO 8601 with a time zone. Defaults to now.'),
      })
    )
    .max(20)
    .optional()
    .describe('Optional products with the price seen now. pigeon builds price history from these.'),
  ui: z
    .object({
      schemaVersion: z.union([z.literal(1), z.literal('1.0')]).describe('Always 1.'),
      root: z.record(z.string(), z.unknown()).describe('One component node; see get_ui_guide.'),
    })
    .optional()
    .describe('How to show the item: a component tree (call get_ui_guide first). Optional.'),
}

// The ui is validated by validateUiTree, so a bad tree never rejects the item (design §6.4).
const inputSchema = z.strictObject({ ...saveFeedItemShape, ui: z.unknown().optional() })

type RawInput = z.infer<typeof inputSchema>

export type FeedProductInput = {
  name: string
  url: string
  canonicalUrl: string
  productId: string
  productKey?: string
  price: number
  listPrice?: number
  imageUrl?: string
  retailer?: string
  observedAt: Date
}

export type FeedItemInput = {
  type: string
  title: string
  summary: string
  publishedAt: Date | null
  dedupeKey: string
  contentHash: string
  content: RawInput['content']
  products: FeedProductInput[]
}

export type UiResult =
  | { status: 'valid'; ui: StoredUi }
  | { status: 'invalid'; issues: UiIssue[] }
  | { status: 'missing' }

export type ParseResult =
  { ok: true; value: FeedItemInput; ui: UiResult } | { ok: false; error: string }

const tokyoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function defaultDedupeKey(
  type: string,
  title: string,
  publishedAt: Date | null,
  now: Date
): string {
  const normalized = title.trim().toLowerCase().replace(/\s+/g, ' ')
  return `${type}:${normalized}:${tokyoDate.format(publishedAt ?? now)}`
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

// Hash of the input as given, so a retry without observedAt (defaulted to now) is unchanged.
export function contentHash(input: unknown): string {
  return createHash('sha256').update(stableJson(input)).digest('hex')
}

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return (
    'Invalid input: ' +
    issues
      .slice(0, MAX_ERRORS)
      .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
      .join('; ')
  )
}

function zodIssues(error: z.ZodError) {
  return error.issues.flatMap((issue) =>
    issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => ({ path: [...issue.path, key], message: 'Unknown field' }))
      : [{ path: issue.path, message: issue.message }]
  )
}

function priceHistoryIssues(root: UiNode, products: FeedProductInput[]): UiIssue[] {
  const matches = (ref: string) =>
    products.some((p) => {
      if (ref === p.productKey || ref === p.url) return true
      try {
        return canonicalUrl(ref) === p.canonicalUrl
      } catch {
        return false
      }
    })
  const issues: UiIssue[] = []
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== 'object') return
    const n = node as UiNode
    if (n.$type === 'PriceHistory' && !matches(String(n.product))) {
      issues.push({ path, message: 'PriceHistory product not found in products' })
    }
    if (Array.isArray(n.children)) n.children.forEach((c, i) => walk(c, `${path}.children[${i}]`))
    else if (n.children !== undefined) walk(n.children, `${path}.children`)
  }
  walk(root, 'root')
  return issues
}

function checkUi(ui: unknown, products: FeedProductInput[]): UiResult {
  if (ui === undefined) return { status: 'missing' }
  const res = validateUiTree(ui)
  if (!res.ok) return { status: 'invalid', issues: res.issues }
  const issues = priceHistoryIssues(res.ui.root, products)
  return issues.length > 0
    ? { status: 'invalid', issues: issues.slice(0, 20) }
    : { status: 'valid', ui: res.ui }
}

export function parseFeedItemInput(raw: unknown, now: Date): ParseResult {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: formatIssues(zodIssues(parsed.error)) }
  const input = parsed.data

  const extraIssues: { path: PropertyKey[]; message: string }[] = []
  const products = (input.products ?? []).map((p, i): FeedProductInput => {
    const observedAt = p.observedAt ? new Date(p.observedAt) : now
    if (observedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) {
      extraIssues.push({
        path: ['products', i, 'observedAt'],
        message: 'Must not be in the future',
      })
    }
    return {
      name: p.name,
      url: p.url,
      canonicalUrl: canonicalUrl(p.url),
      productId: productIdFor(p),
      ...(p.productKey !== undefined && { productKey: p.productKey }),
      price: p.price,
      ...(p.listPrice !== undefined && { listPrice: p.listPrice }),
      ...(p.imageUrl !== undefined && { imageUrl: p.imageUrl }),
      ...(p.retailer !== undefined && { retailer: p.retailer }),
      observedAt,
    }
  })
  products.forEach((p, i) => {
    const first = products.findIndex((q) => q.productId === p.productId)
    if (first < i)
      extraIssues.push({ path: ['products', i], message: `Same product as products.${first}` })
  })
  if (extraIssues.length > 0) return { ok: false, error: formatIssues(extraIssues) }

  const publishedAt = input.publishedAt ? new Date(input.publishedAt) : null
  const value: FeedItemInput = {
    type: input.type,
    title: input.title,
    summary: input.summary,
    publishedAt,
    dedupeKey: input.dedupeKey ?? defaultDedupeKey(input.type, input.title, publishedAt, now),
    contentHash: contentHash(input),
    content: input.content,
    products,
  }
  return { ok: true, value, ui: checkUi(input.ui, products) }
}
