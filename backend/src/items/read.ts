import { FieldPath, getFirestore, Timestamp, type DocumentData } from 'firebase-admin/firestore'
import type { StoredUi } from '../ui/validate.js'
import type { PriceChange } from './store.js'

const MAX_HISTORY = 365

export type PricePoint = { observedAt: string; price: number }

export type FeedProductSummary = { name: string; price: number; change?: PriceChange }

export type FeedItemSummary = {
  id: string
  type: string
  title: string
  summary: string
  createdAt: string
  publishedAt: string | null
  products: FeedProductSummary[]
}

export type FeedProduct = {
  productId: string
  productKey?: string
  name: string
  url: string
  canonicalUrl: string
  price: number
  listPrice?: number
  imageUrl?: string
  retailer?: string
  observedAt: string
  change?: PriceChange
}

export type FeedSource = { title: string; url?: string; publisher?: string; publishedAt?: string }

export type FeedItemDetail = Omit<FeedItemSummary, 'products'> & {
  updatedAt: string
  content: { markdown: string; sources: FeedSource[] }
  ui: StoredUi | null
  uiStatus: 'valid' | 'invalid' | 'missing'
  products: FeedProduct[]
}

export type Cursor = { createdAt: string; id: string }

const iso = (t: Timestamp) => t.toDate().toISOString()

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function decodeCursor(value: string): Cursor | null {
  try {
    const c = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (typeof c?.id !== 'string' || !/^i_[0-9a-f]{20}$/.test(c.id)) return null
    if (typeof c.createdAt !== 'string' || Number.isNaN(Date.parse(c.createdAt))) return null
    return { createdAt: c.createdAt, id: c.id }
  } catch {
    return null
  }
}

function summaryOf(id: string, d: DocumentData): FeedItemSummary {
  return {
    id,
    type: d.type,
    title: d.title,
    summary: d.summary,
    createdAt: iso(d.createdAt),
    publishedAt: d.publishedAt ? iso(d.publishedAt) : null,
    products: (d.products ?? []).map((p: DocumentData) => ({
      name: p.name,
      price: p.price,
      ...(p.change && { change: p.change }),
    })),
  }
}

export async function listItems(opts: {
  type?: string
  limit: number
  cursor?: string
}): Promise<{ items: FeedItemSummary[]; nextCursor: string | null }> {
  let query = getFirestore()
    .collection('items')
    .orderBy('createdAt', 'desc')
    .orderBy(FieldPath.documentId(), 'desc')
  if (opts.type) query = query.where('type', '==', opts.type)
  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null
  if (cursor) query = query.startAfter(Timestamp.fromDate(new Date(cursor.createdAt)), cursor.id)
  const snap = await query.limit(opts.limit + 1).get()
  const docs = snap.docs.slice(0, opts.limit)
  const items = docs.map((d) => summaryOf(d.id, d.data()))
  const last = items[items.length - 1]
  const nextCursor =
    snap.docs.length > opts.limit && last
      ? encodeCursor({ createdAt: last.createdAt, id: last.id })
      : null
  return { items, nextCursor }
}

export async function listTypes(): Promise<{ type: string; count: number; lastItemAt: string }[]> {
  const snap = await getFirestore().collection('types').orderBy('lastItemAt', 'desc').get()
  return snap.docs.map((d) => ({
    type: d.get('type'),
    count: d.get('count'),
    lastItemAt: iso(d.get('lastItemAt')),
  }))
}

export async function getItem(
  id: string
): Promise<{ item: FeedItemDetail; priceHistories: Record<string, PricePoint[]> } | null> {
  const db = getFirestore()
  const snap = await db.doc(`items/${id}`).get()
  const d = snap.data()
  if (!d) return null
  const products: FeedProduct[] = (d.products ?? []).map((p: DocumentData) => ({
    ...p,
    observedAt: iso(p.observedAt),
  }))
  const item: FeedItemDetail = {
    ...summaryOf(id, d),
    updatedAt: iso(d.updatedAt),
    content: d.content,
    ui: d.uiJson ? (JSON.parse(d.uiJson) as StoredUi) : null,
    uiStatus: d.uiStatus,
    products,
  }
  const histories = await Promise.all(
    (d.products ?? []).map(async (p: DocumentData) => {
      const obs = await db
        .collection(`products/${p.productId}/observations`)
        .where('observedAt', '<=', p.observedAt)
        .orderBy('observedAt', 'desc')
        .limit(MAX_HISTORY)
        .get()
      const points = obs.docs
        .map((o) => ({ observedAt: iso(o.get('observedAt')), price: o.get('price') as number }))
        .reverse()
      return [p.productId as string, points] as const
    })
  )
  return { item, priceHistories: Object.fromEntries(histories) }
}
