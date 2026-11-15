import { createHash } from 'node:crypto'
import { getFirestore, Timestamp, type DocumentData } from 'firebase-admin/firestore'
import type { FeedItemInput, FeedProductInput, UiResult } from './input.js'

export type SaveStatus = 'created' | 'updated' | 'unchanged'
export type PriceChange = { amount: number; percent: number }

export function itemIdFor(dedupeKey: string): string {
  return 'i_' + createHash('sha256').update(dedupeKey).digest('hex').slice(0, 20)
}

type Observation = {
  itemId: string
  price: number
  observedAt: Timestamp
  createdAt: Timestamp
  sourceUrl: string
}

const round1 = (n: number) => Math.round(n * 10) / 10

// This item's observation against the one immediately before it (design §7.2).
function changeFor(obs: Observation[], mine: Observation): PriceChange | undefined {
  let previous: Observation | undefined
  for (const o of obs) {
    if (o.itemId === mine.itemId || o.observedAt.toMillis() >= mine.observedAt.toMillis()) continue
    if (!previous || o.observedAt.toMillis() > previous.observedAt.toMillis()) previous = o
  }
  if (!previous) return undefined
  const amount = mine.price - previous.price
  return { amount, percent: previous.price === 0 ? 0 : round1((amount / previous.price) * 100) }
}

function productFields(p: FeedProductInput): DocumentData {
  return {
    identity: p.productKey ? 'key' : 'url',
    ...(p.productKey && { productKey: p.productKey }),
    canonicalUrl: p.canonicalUrl,
    name: p.name,
    ...(p.retailer && { retailer: p.retailer }),
    ...(p.imageUrl && { imageUrl: p.imageUrl }),
  }
}

export async function saveFeedItem(
  input: FeedItemInput,
  ui: UiResult
): Promise<{ id: string; status: SaveStatus }> {
  const db = getFirestore()
  const id = itemIdFor(input.dedupeKey)
  const itemRef = db.doc(`items/${id}`)
  const now = Timestamp.now()

  const status = await db.runTransaction(async (tx): Promise<SaveStatus> => {
    // Firestore transactions need every read before the first write.
    const existingSnap = await tx.get(itemRef)
    const existing = existingSnap.data()
    if (existing && existing.contentHash === input.contentHash) return 'unchanged'

    const newProducts = new Map(input.products.map((p) => [p.productId, p]))
    const oldIds: string[] = (existing?.products ?? []).map(
      (p: { productId: string }) => p.productId
    )
    const touched = [...new Set([...oldIds, ...newProducts.keys()])]
    const productSnaps = await Promise.all(touched.map((pid) => tx.get(db.doc(`products/${pid}`))))
    const obsSnaps = await Promise.all(
      touched.map((pid) => tx.get(db.collection(`products/${pid}/observations`)))
    )
    const typeIds = [...new Set([input.type, ...(existing ? [existing.type as string] : [])])]
    const typeSnaps = new Map(
      await Promise.all(typeIds.map(async (t) => [t, await tx.get(db.doc(`types/${t}`))] as const))
    )

    const itemProducts: DocumentData[] = []
    touched.forEach((pid, i) => {
      const productRef = db.doc(`products/${pid}`)
      const obsRef = db.doc(`products/${pid}/observations/${id}`)
      const others = obsSnaps[i].docs
        .map((d) => d.data() as Observation)
        .filter((o) => o.itemId !== id)
      const p = newProducts.get(pid)
      if (!p) {
        tx.delete(obsRef)
      }
      const mine: Observation | undefined = p && {
        itemId: id,
        price: p.price,
        observedAt: Timestamp.fromDate(p.observedAt),
        sourceUrl: p.url,
        createdAt:
          (obsSnaps[i].docs.find((d) => d.id === id)?.get('createdAt') as Timestamp | undefined) ??
          now,
      }
      const all = mine ? [...others, mine] : others
      if (all.length === 0) {
        tx.delete(productRef)
        return
      }
      const byTime = [...all].sort((a, b) => a.observedAt.toMillis() - b.observedAt.toMillis())
      const last = byTime[byTime.length - 1]
      tx.set(productRef, {
        ...(p ? productFields(p) : productSnaps[i].data()),
        lastPrice: last.price,
        lastObservedAt: last.observedAt,
        firstObservedAt: byTime[0].observedAt,
      })
      if (mine) tx.set(obsRef, mine)
    })

    for (const p of input.products) {
      const i = touched.indexOf(p.productId)
      const others = obsSnaps[i].docs.map((d) => d.data() as Observation)
      const change = changeFor(others, {
        itemId: id,
        price: p.price,
        observedAt: Timestamp.fromDate(p.observedAt),
      } as Observation)
      itemProducts.push({
        productId: p.productId,
        ...(p.productKey && { productKey: p.productKey }),
        name: p.name,
        url: p.url,
        canonicalUrl: p.canonicalUrl,
        price: p.price,
        ...(p.listPrice !== undefined && { listPrice: p.listPrice }),
        ...(p.imageUrl && { imageUrl: p.imageUrl }),
        ...(p.retailer && { retailer: p.retailer }),
        observedAt: Timestamp.fromDate(p.observedAt),
        ...(change && { change }),
      })
    }

    // Type counts: +1 on create; on a type change, −1 old (deleted at 0) and +1 new.
    const count = (t: string) => (typeSnaps.get(t)?.get('count') as number | undefined) ?? 0
    if (existing && existing.type !== input.type) {
      const left = count(existing.type) - 1
      if (left <= 0) tx.delete(db.doc(`types/${existing.type}`))
      else tx.update(db.doc(`types/${existing.type}`), { count: left })
    }
    const added = !existing || existing.type !== input.type ? 1 : 0
    tx.set(db.doc(`types/${input.type}`), {
      type: input.type,
      count: count(input.type) + added,
      lastItemAt: now,
    })

    const storedUi = ui.status === 'valid' ? ui.ui : null
    tx.set(itemRef, {
      // Stored as JSON text: Firestore can't hold nested arrays (e.g. Table rows).
      uiJson: storedUi ? JSON.stringify(storedUi) : null,
      type: input.type,
      title: input.title,
      summary: input.summary,
      content: input.content,
      products: itemProducts,
      uiStatus: ui.status,
      uiSchemaVersion: storedUi ? storedUi.schemaVersion : null,
      dedupeKey: input.dedupeKey,
      contentHash: input.contentHash,
      publishedAt: input.publishedAt ? Timestamp.fromDate(input.publishedAt) : null,
      createdAt: (existing?.createdAt as Timestamp | undefined) ?? now,
      updatedAt: now,
      origin: 'mcp',
    })
    return existing ? 'updated' : 'created'
  })
  return { id, status }
}
