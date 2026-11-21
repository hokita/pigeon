import { describe, it, expect } from 'vitest'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { itemIdFor, saveFeedItem } from './store.js'
import { parseFeedItemInput } from './input.js'
import { loadFixture } from '../testing/fixtures.js'

const db = () => getFirestore()
const NOW = new Date('2026-11-15T03:00:00Z')

function parse(raw: unknown, now = NOW) {
  const res = parseFeedItemInput(raw, now)
  if (!res.ok) throw new Error(res.error)
  return res
}

async function save(raw: unknown) {
  const { value, ui } = parse(raw)
  return saveFeedItem(value, ui)
}

// A price item for one product, observed on the given day of November 2026.
function priceItem(day: number, price: number, product: Record<string, unknown> = {}) {
  const raw = loadFixture('sample-price-drop')
  raw.dedupeKey = `price-watch:wh:2026-11-${String(day).padStart(2, '0')}`
  raw.products = [
    {
      ...raw.products[0],
      price,
      observedAt: `2026-11-${String(day).padStart(2, '0')}T09:00:00+09:00`,
      ...product,
    },
  ]
  raw.ui.root.children = raw.ui.root.children.filter(
    (c: { _type: string; product?: string }) =>
      c._type !== 'PriceHistory' || c.product === 'sku:wh-2000'
  )
  return raw
}

const pidOf = (raw: unknown) => parse(raw).value.products[0].productId
// The stored doc, with uiJson parsed back into ui.
const item = async (id: string) => {
  const data = (await db().doc(`items/${id}`).get()).data()!
  return { ...data, ui: data.uiJson === null ? null : JSON.parse(data.uiJson) }
}
const product = async (pid: string) => (await db().doc(`products/${pid}`).get()).data()
const observations = async (pid: string) =>
  (await db().collection(`products/${pid}/observations`).get()).docs

describe('saveFeedItem', () => {
  it('creates an item with ui', async () => {
    const res = await save(loadFixture('sample-news'))
    expect(res).toEqual({ id: itemIdFor('news:daily-ai:2026-11-15'), status: 'created' })
    expect(res.id).toMatch(/^i_[0-9a-f]{20}$/)
    const doc = await item(res.id)
    expect(doc).toMatchObject({
      type: 'news',
      uiStatus: 'valid',
      uiSchemaVersion: 1,
      origin: 'mcp',
      products: [],
    })
    expect(doc.ui.root.$type).toBe('Col')
    expect(doc.createdAt.isEqual(doc.updatedAt)).toBe(true)
    expect(doc.publishedAt).toBeInstanceOf(Timestamp)
  })

  it('saveFeedItem twice with the same input is unchanged and writes one observation', async () => {
    const raw = loadFixture('sample-price-drop')
    expect((await save(raw)).status).toBe('created')
    expect((await save(raw)).status).toBe('unchanged')
    expect(await observations(pidOf(raw))).toHaveLength(1)
    expect((await db().collection('items').get()).size).toBe(1)
  })

  it('a changed summary with the same dedupeKey updates and keeps createdAt', async () => {
    const first = await save(loadFixture('sample-news'))
    const before = await item(first.id)
    await new Promise((r) => setTimeout(r, 5))
    const res = await save({ ...loadFixture('sample-news'), summary: 'Updated summary' })
    expect(res.status).toBe('updated')
    const after = await item(first.id)
    expect(after.summary).toBe('Updated summary')
    expect(after.createdAt.isEqual(before.createdAt)).toBe(true)
    expect(after.updatedAt.toMillis()).toBeGreaterThan(before.updatedAt.toMillis())
  })

  it('invalid ui stores the item with ui null and uiStatus invalid', async () => {
    const res = await save(loadFixture('sample-invalid-ui'))
    expect(await item(res.id)).toMatchObject({
      ui: null,
      uiStatus: 'invalid',
      uiSchemaVersion: null,
    })
  })

  it('re-save replaces the item fully', async () => {
    const raw = loadFixture('sample-news')
    raw.content.sources = raw.content.sources.slice(0, 2)
    const { id } = await save(raw)
    const next = loadFixture('sample-news')
    next.title = 'New title'
    next.content.sources = next.content.sources.slice(0, 1)
    await save({ ...next, ui: { schemaVersion: 1, root: { _type: 'Button' } } })
    const doc = await item(id)
    expect(doc).toMatchObject({
      title: 'New title',
      ui: null,
      uiStatus: 'invalid',
      uiSchemaVersion: null,
    })
    expect(doc.content.sources).toHaveLength(1)
    await save({ ...next, ui: undefined, summary: 'again' })
    expect(await item(id)).toMatchObject({ ui: null, uiStatus: 'missing' })
  })

  it('re-save drops observations of removed products', async () => {
    const raw = loadFixture('sample-price-drop')
    const [a, b] = parse(raw).value.products.map((p) => p.productId)
    const { id } = await save(raw)
    raw.products = [{ ...raw.products[0], price: 31000 }]
    raw.ui.root.children = raw.ui.root.children.filter(
      (c: { product?: string }) => c.product !== raw.products[1]?.url
    )
    raw.ui.root.children.splice(3, 1)
    await save(raw)
    expect((await db().doc(`products/${b}/observations/${id}`).get()).exists).toBe(false)
    expect(await product(b)).toBeUndefined()
    const obs = await observations(a)
    expect(obs).toHaveLength(1)
    expect(obs[0].data().price).toBe(31000)
    expect((await product(a))!.lastPrice).toBe(31000)
  })

  it('re-save recomputes product fields', async () => {
    const day1 = priceItem(1, 39600)
    const day2 = priceItem(2, 32800)
    await save(day1)
    const { id } = await save(day2)
    const pid = pidOf(day1)
    expect((await product(pid))!.lastPrice).toBe(32800)
    // Re-save item 2 without the product.
    const without = {
      ...day2,
      products: [],
      ui: { schemaVersion: 1, root: { _type: 'Text', value: 'gone' } },
    }
    await save(without)
    const p = (await product(pid))!
    expect(p.lastPrice).toBe(39600)
    expect(p.lastObservedAt.toDate()).toEqual(new Date('2026-11-01T00:00:00Z'))
    expect(p.firstObservedAt.toDate()).toEqual(new Date('2026-11-01T00:00:00Z'))
    expect((await item(id)).products).toEqual([])
  })

  it('change is stored at save time', async () => {
    const first = await save(priceItem(1, 39600))
    const second = await save(priceItem(2, 32800))
    expect((await item(second.id)).products[0].change).toEqual({ amount: -6800, percent: -17.2 })
    expect((await item(first.id)).products[0]).not.toHaveProperty('change')
  })

  it("a back-dated insert leaves older items' change alone (known limit)", async () => {
    await save(priceItem(1, 40000))
    const day3 = await save(priceItem(3, 30000))
    const day2 = await save(priceItem(2, 35000))
    expect((await item(day2.id)).products[0].change).toEqual({ amount: -5000, percent: -12.5 })
    expect((await item(day3.id)).products[0].change).toEqual({ amount: -10000, percent: -25 })
  })

  it('two saves of the same product with different tracking params share one product', async () => {
    await save(
      priceItem(1, 39600, {
        productKey: undefined,
        url: 'https://www.shop.example.com/p/wh-2000?utm_source=a',
      })
    )
    const later = priceItem(2, 32800, {
      productKey: undefined,
      url: 'https://shop.example.com/p/wh-2000/?utm_medium=b',
    })
    later.ui.root.children = later.ui.root.children.filter(
      (c: { _type: string }) => c._type !== 'PriceHistory'
    )
    const first = priceItem(1, 0, {
      productKey: undefined,
      url: 'https://www.shop.example.com/p/wh-2000?utm_source=a',
    })
    await save(later)
    const products = await db().collection('products').get()
    expect(products.size).toBe(1)
    expect(await observations(pidOf(first))).toHaveLength(2)
    expect(products.docs[0].data()).toMatchObject({ identity: 'url', lastPrice: 32800 })
  })

  it('productKey groups different URLs', async () => {
    await save(priceItem(1, 39600, { url: 'https://a.example.com/x' }))
    await save(priceItem(2, 32800, { url: 'https://b.example.com/y' }))
    const products = await db().collection('products').get()
    expect(products.size).toBe(1)
    expect(products.docs[0].data()).toMatchObject({ identity: 'key', productKey: 'sku:wh-2000' })
    expect(await observations(products.docs[0].id)).toHaveLength(2)
  })

  it('unstable identity splits history without failing', async () => {
    const strip = (raw: ReturnType<typeof loadFixture>) => {
      raw.ui.root.children = raw.ui.root.children.filter(
        (c: { _type: string }) => c._type !== 'PriceHistory'
      )
      return raw
    }
    expect(
      (
        await save(
          strip(
            priceItem(1, 39600, { productKey: undefined, url: 'https://shop.example.com/p?sid=1' })
          )
        )
      ).status
    ).toBe('created')
    expect(
      (
        await save(
          strip(
            priceItem(2, 32800, { productKey: undefined, url: 'https://shop.example.com/p?sid=2' })
          )
        )
      ).status
    ).toBe('created')
    const products = await db().collection('products').get()
    expect(products.size).toBe(2)
    for (const p of products.docs) expect(await observations(p.id)).toHaveLength(1)
  })

  it('types counts', async () => {
    const news = await save(loadFixture('sample-news'))
    await save(loadFixture('sample-research'))
    const type = async (t: string) => (await db().doc(`types/${t}`).get()).data()
    expect(await type('news')).toMatchObject({ type: 'news', count: 1 })
    expect(await type('research')).toMatchObject({ count: 1 })
    expect((await type('news'))!.lastItemAt).toBeInstanceOf(Timestamp)
    await save(loadFixture('sample-news'))
    expect((await type('news'))!.count).toBe(1)
    await save({ ...loadFixture('sample-news'), type: 'research' })
    expect(await type('news')).toBeUndefined()
    expect((await type('research'))!.count).toBe(2)
    expect((await item(news.id)).type).toBe('research')
  })

  it('an older observation does not overwrite lastPrice', async () => {
    await save(priceItem(2, 32800))
    await save(priceItem(1, 39600))
    const p = (await product(pidOf(priceItem(1, 1))))!
    expect(p.lastPrice).toBe(32800)
    expect(p.firstObservedAt.toDate()).toEqual(new Date('2026-11-01T00:00:00Z'))
  })
})
