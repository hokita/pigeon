import { describe, it, expect } from 'vitest'
import { getFirestore } from 'firebase-admin/firestore'
import { decodeCursor, encodeCursor, getItem, listItems, listTypes } from './read.js'
import { saveFeedItem } from './store.js'
import { parseFeedItemInput } from './input.js'
import { loadFixture } from '../testing/fixtures.js'

async function save(raw: unknown) {
  const res = parseFeedItemInput(raw, new Date('2026-11-20T00:00:00Z'))
  if (!res.ok) throw new Error(res.error)
  const saved = await saveFeedItem(res.value, res.ui)
  await new Promise((r) => setTimeout(r, 3))
  return saved
}

function priceItem(day: number, price: number) {
  const raw = loadFixture('sample-price-drop')
  const d = String(day).padStart(2, '0')
  raw.dedupeKey = `price-watch:wh:2026-11-${d}`
  raw.products = [{ ...raw.products[0], price, observedAt: `2026-11-${d}T09:00:00+09:00` }]
  raw.ui.root.children.splice(3, 1)
  return raw
}

describe('listItems', () => {
  it('lists newest first', async () => {
    const a = await save(loadFixture('sample-news'))
    const b = await save(loadFixture('sample-research'))
    const c = await save(loadFixture('sample-price-drop'))
    const { items, nextCursor } = await listItems({ limit: 20 })
    expect(items.map((i) => i.id)).toEqual([c.id, b.id, a.id])
    expect(nextCursor).toBeNull()
    expect(items[2]).toEqual({
      id: a.id,
      type: 'news',
      title: loadFixture('sample-news').title,
      summary: loadFixture('sample-news').summary,
      createdAt: expect.stringMatching(/^2\d{3}-/),
      publishedAt: '2026-11-14T15:00:00.000Z',
      products: [],
    })
  })

  it('filters by type', async () => {
    await save(loadFixture('sample-news'))
    const r = await save(loadFixture('sample-research'))
    const { items } = await listItems({ type: 'research', limit: 20 })
    expect(items.map((i) => i.id)).toEqual([r.id])
  })

  it('paginates with a cursor', async () => {
    await save(loadFixture('sample-news'))
    await save(loadFixture('sample-research'))
    await save(loadFixture('sample-price-drop'))
    const first = await listItems({ limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).not.toBeNull()
    const second = await listItems({ limit: 2, cursor: first.nextCursor! })
    expect(second.items).toHaveLength(1)
    expect(second.nextCursor).toBeNull()
    expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(3)
  })

  it('listItems returns the stored change without reading observations', async () => {
    await save(priceItem(1, 39600))
    const second = await save(priceItem(2, 32800))
    const db = getFirestore()
    for (const p of (await db.collection('products').get()).docs) {
      for (const o of (await p.ref.collection('observations').get()).docs) await o.ref.delete()
    }
    const { items } = await listItems({ limit: 20 })
    const item = items.find((i) => i.id === second.id)!
    expect(item.products).toEqual([
      {
        name: 'WH-2000 Wireless Headphones',
        price: 32800,
        change: { amount: -6800, percent: -17.2 },
      },
    ])
  })
})

describe('cursor', () => {
  it('round-trips', () => {
    const c = { createdAt: '2026-11-15T00:00:00.000Z', id: 'i_0123456789abcdef0123' }
    expect(decodeCursor(encodeCursor(c))).toEqual(c)
  })

  it('decodeCursor rejects garbage', () => {
    expect(decodeCursor('garbage')).toBeNull()
    expect(decodeCursor(Buffer.from('{"createdAt":"x","id":"y"}').toString('base64url'))).toBeNull()
  })
})

describe('listTypes', () => {
  it('listTypes is most recent first', async () => {
    await save(loadFixture('sample-news'))
    await save(loadFixture('sample-research'))
    expect(await listTypes()).toEqual([
      { type: 'research', count: 1, lastItemAt: expect.any(String) },
      { type: 'news', count: 1, lastItemAt: expect.any(String) },
    ])
  })
})

describe('getItem', () => {
  it('getItem returns null for an unknown id', async () => {
    expect(await getItem('i_00000000000000000000')).toBeNull()
  })

  it('returns the detail with the parsed ui', async () => {
    const { id } = await save(loadFixture('sample-news'))
    const res = (await getItem(id))!
    expect(res.item).toMatchObject({
      id,
      type: 'news',
      uiStatus: 'valid',
      content: { sources: expect.any(Array) },
    })
    expect(res.item.ui!.root.$type).toBe('Col')
    expect(res.priceHistories).toEqual({})
  })

  it("getItem returns price history oldest first, only this item's products", async () => {
    const other = loadFixture('sample-research')
    other.products = [
      {
        name: 'Other',
        url: 'https://other.example.com/x',
        price: 1,
        observedAt: '2026-11-01T00:00:00Z',
      },
    ]
    await save(other)
    await save(priceItem(1, 39600))
    const { id } = await save(priceItem(2, 32800))
    const res = (await getItem(id))!
    const pid = res.item.products[0].productId
    expect(Object.keys(res.priceHistories)).toEqual([pid])
    expect(res.priceHistories[pid]).toEqual([
      { observedAt: '2026-11-01T00:00:00.000Z', price: 39600 },
      { observedAt: '2026-11-02T00:00:00.000Z', price: 32800 },
    ])
    expect(res.item.products[0]).toMatchObject({
      price: 32800,
      observedAt: '2026-11-02T00:00:00.000Z',
    })
  })

  it('an old item shows history as of its own observation', async () => {
    await save(priceItem(1, 40000))
    const day2 = await save(priceItem(2, 35000))
    const day3 = await save(priceItem(3, 30000))
    const h = async (id: string) => Object.values((await getItem(id))!.priceHistories)[0]
    expect(await h(day2.id)).toHaveLength(2)
    expect(await h(day3.id)).toHaveLength(3)
  })
})
