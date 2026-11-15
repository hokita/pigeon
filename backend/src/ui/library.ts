import { z } from 'zod'
import {
  buildPresentParameters,
  defaultGenerativeUILibrary as official,
  type GenerativeUILibrary,
} from '@assistant-ui/generative-ui/react'
import { checkImageUrl, checkLinkUrl } from '../urls.js'

// Schema v1 allowlist (design §6.2). Everything else, including interactive
// components and Box/Diagram/Map, is rejected.
export const CONTAINER_TYPES = ['Col', 'Row', 'Card', 'Tabs'] as const
export const ALLOWED_TYPES: readonly string[] = [
  ...CONTAINER_TYPES,
  'Header',
  'Text',
  'Caption',
  'Markdown',
  'Image',
  'Divider',
  'Table',
  'Chart',
  'Timeline',
  'Steps',
  'Alert',
  'Citation',
  'Fact',
  'Badge',
  'PriceHistory',
]

export const PRICE_HISTORY_DESCRIPTION =
  "A line chart of one product's price history, drawn by pigeon from its recorded observations. " +
  "Set `product` to that product's productKey or url from this item's products. Never put prices here."

type Check = (props: Record<string, unknown>, ctx: z.RefinementCtx) => void

const maxString =
  (key: string, max: number): Check =>
  (props, ctx) => {
    const v = props[key]
    if (typeof v === 'string' && v.length > max) {
      ctx.addIssue({ code: 'custom', path: [key], message: `Too long (max ${max} characters)` })
    }
  }

const maxItems =
  (key: string, max: number): Check =>
  (props, ctx) => {
    const v = props[key]
    if (Array.isArray(v) && v.length > max) {
      ctx.addIssue({ code: 'custom', path: [key], message: `Too many items (max ${max})` })
    }
  }

const url =
  (key: string, check: (value: string) => string | null): Check =>
  (props, ctx) => {
    const v = props[key]
    const message = typeof v === 'string' ? check(v) : null
    if (message) ctx.addIssue({ code: 'custom', path: [key], message })
  }

const tableShape: Check = (props, ctx) => {
  const columns = props.columns
  const rows = props.rows
  if (!Array.isArray(rows)) return
  if (!Array.isArray(columns)) {
    ctx.addIssue({ code: 'custom', path: ['columns'], message: 'Table needs columns' })
    return
  }
  rows.forEach((row, i) => {
    if (Array.isArray(row) && row.length !== columns.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['rows', i],
        message: `Row has ${row.length} cells; expected ${columns.length}`,
      })
    }
  })
}

const chartSize: Check = (props, ctx) => {
  maxItems('data', 366)(props, ctx)
  maxItems('series', 5)(props, ctx)
  const series = props.series
  if (Array.isArray(series)) {
    series.forEach((s, i) => {
      const data = (s as { data?: unknown })?.data
      if (Array.isArray(data) && data.length > 366) {
        ctx.addIssue({
          code: 'custom',
          path: ['series', i, 'data'],
          message: 'Too many items (max 366)',
        })
      }
    })
  }
}

// pigeon's tighter rules on top of the official schemas (design §6.2).
const tighter: Record<string, Check[]> = {
  Tabs: [maxItems('tabs', 8)],
  Header: [maxString('text', 200)],
  Text: [maxString('value', 2000)],
  Caption: [maxString('value', 2000)],
  Markdown: [maxString('value', 20_000)],
  Image: [maxString('alt', 300), url('src', checkImageUrl)],
  Table: [maxItems('columns', 12), maxItems('rows', 200), tableShape],
  Chart: [chartSize],
  Timeline: [maxItems('items', 50)],
  Steps: [maxItems('steps', 30)],
  Alert: [maxString('description', 2000)],
  Citation: [maxString('snippet', 500), url('url', checkLinkUrl)],
  Badge: [maxString('value', 40)],
}

const officialEntries = official as GenerativeUILibrary
const cardShape = (officialEntries.Card.properties as unknown as z.ZodObject).shape

const baseSchemas: Record<string, z.ZodType> = {
  Card: z.strictObject({ title: cardShape.title, padding: cardShape.padding }),
  PriceHistory: z.strictObject({
    product: z.string().min(1).max(2048),
    title: z.string().max(200).optional(),
  }),
}

// The official schemas strip unknown keys; pigeon rejects them (design §6.1).
function baseSchema(type: string): z.ZodType {
  return baseSchemas[type] ?? (officialEntries[type].properties as unknown as z.ZodObject).strict()
}

export function propSchema(type: string): z.ZodType {
  return baseSchema(type).superRefine((props, ctx) => {
    for (const check of tighter[type] ?? []) check(props as Record<string, unknown>, ctx)
  })
}

// The allowlisted library as data for the model-facing guide. The backend never
// renders, so PriceHistory's render is a stub.
export function schemaLibrary(): GenerativeUILibrary {
  const lib: GenerativeUILibrary = {}
  for (const type of ALLOWED_TYPES) {
    if (type === 'PriceHistory') {
      lib[type] = {
        description: PRICE_HISTORY_DESCRIPTION,
        properties: baseSchema(type),
        render: () => null,
      }
    } else {
      lib[type] = {
        ...officialEntries[type],
        properties: baseSchema(type),
      } as GenerativeUILibrary[string]
    }
  }
  return lib
}

export function uiGuideSchema() {
  return buildPresentParameters(schemaLibrary())
}
