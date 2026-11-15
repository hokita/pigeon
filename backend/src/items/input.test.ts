import { describe, it, expect } from 'vitest'
import { contentHash, defaultDedupeKey, parseFeedItemInput } from './input.js'
import { loadFixture } from '../testing/fixtures.js'

const now = new Date('2026-11-15T03:00:00Z')

function parsed(raw: unknown) {
  const res = parseFeedItemInput(raw, now)
  if (!res.ok) throw new Error(res.error)
  return res
}

function error(raw: unknown) {
  const res = parseFeedItemInput(raw, now)
  if (res.ok) throw new Error('expected an error')
  return res.error
}

describe('parseFeedItemInput', () => {
  it.each(['sample-news', 'sample-research', 'sample-price-drop'] as const)(
    'accepts %s',
    (name) => {
      const res = parsed(loadFixture(name))
      expect(res.ui.status).toBe('valid')
    }
  )

  it('normalizes products', () => {
    const { value } = parsed(loadFixture('sample-price-drop'))
    expect(value.products).toHaveLength(2)
    expect(value.products[0].canonicalUrl).toBe('https://shop.example.com/p/wh-2000')
    expect(value.products[0].productKey).toBe('sku:wh-2000')
    expect(value.products[0].productId).toMatch(/^p_[0-9a-f]{20}$/)
    expect(value.products[0].observedAt).toEqual(new Date('2026-11-15T00:00:00Z'))
    expect(value.products[1].observedAt).toEqual(new Date('2026-11-15T00:00:00Z'))
  })

  it('defaults observedAt to now', () => {
    const raw = loadFixture('sample-price-drop')
    delete raw.products[0].observedAt
    expect(parsed(raw).value.products[0].observedAt).toEqual(now)
  })

  it('accepts any slug type', () => {
    expect(parsed({ ...loadFixture('sample-news'), type: 'reading-list' }).value.type).toBe(
      'reading-list'
    )
  })

  it.each(['News', 'a b', '', 'a'.repeat(33)])('rejects a bad type %j', (type) => {
    expect(error({ ...loadFixture('sample-news'), type })).toContain('type')
  })

  it('products are optional on any type', () => {
    const research = {
      ...loadFixture('sample-research'),
      products: loadFixture('sample-price-drop').products,
    }
    expect(parsed(research).value.products).toHaveLength(2)
    const price = loadFixture('sample-price-drop')
    delete price.products
    price.ui.root.children = price.ui.root.children.filter(
      (c: { _type: string }) => c._type !== 'PriceHistory'
    )
    expect(parsed(price).value.products).toEqual([])
  })

  it('PriceHistory must name a product of this item', () => {
    const raw = loadFixture('sample-price-drop')
    raw.ui.root.children[2].product = 'sku:other'
    const res = parsed(raw)
    expect(res.ui).toEqual({
      status: 'invalid',
      issues: [{ path: 'root.children[2]', message: 'PriceHistory product not found in products' }],
    })
  })

  it('PriceHistory may name a tracking-param variant of a product url', () => {
    const raw = loadFixture('sample-price-drop')
    raw.ui.root.children[3].product = 'https://shop.example.net/item/ear-7?utm_campaign=x'
    expect(parsed(raw).ui.status).toBe('valid')
  })

  it('keeps an invalid ui as issues, not an error', () => {
    const res = parsed(loadFixture('sample-invalid-ui'))
    if (res.ui.status !== 'invalid') throw new Error('expected invalid ui')
    expect(res.ui.issues.length).toBeGreaterThanOrEqual(2)
  })

  it('missing ui is status missing', () => {
    const raw = loadFixture('sample-news')
    delete raw.ui
    expect(parsed(raw).ui).toEqual({ status: 'missing' })
  })

  it('a malformed ui envelope is an invalid ui, not an error', () => {
    expect(
      parsed({ ...loadFixture('sample-news'), ui: { schemaVersion: 2, root: 'x' } }).ui.status
    ).toBe('invalid')
  })

  it.each([-1, 1.5])('rejects price %s', (price) => {
    const raw = loadFixture('sample-price-drop')
    raw.products[0].price = price
    expect(error(raw)).toContain('products.0.price')
  })

  it('rejects an unknown currency field', () => {
    const raw = loadFixture('sample-price-drop')
    raw.products[0].currency = 'USD'
    expect(error(raw)).toContain('products.0')
  })

  it('rejects a javascript: source url', () => {
    const raw = loadFixture('sample-news')
    raw.content.sources[0].url = 'javascript:alert(1)'
    expect(error(raw)).toContain('content.sources.0.url')
  })

  it('rejects a bad product url and image url', () => {
    const raw = loadFixture('sample-price-drop')
    raw.products[0].url = 'https://localhost/x'
    raw.products[1].imageUrl = 'http://images.example.com/a.jpg'
    const message = error(raw)
    expect(message).toContain('products.0.url')
    expect(message).toContain('products.1.imageUrl')
  })

  it('rejects two entries for the same product', () => {
    const raw = loadFixture('sample-price-drop')
    raw.products[1] = { ...raw.products[0], url: 'https://shop.example.com/p/wh-2000?utm_medium=x' }
    expect(error(raw)).toContain('products.1: Same product as products.0')
  })

  it('rejects observedAt more than 5 minutes in the future', () => {
    const raw = loadFixture('sample-price-drop')
    raw.products[0].observedAt = new Date(now.getTime() + 6 * 60_000).toISOString()
    expect(error(raw)).toContain('products.0.observedAt')
    raw.products[0].observedAt = new Date(now.getTime() + 4 * 60_000).toISOString()
    expect(parseFeedItemInput(raw, now).ok).toBe(true)
  })

  it('rejects missing sources and an unknown top-level field', () => {
    const raw = loadFixture('sample-news')
    raw.content.sources = []
    expect(error(raw)).toContain('content.sources')
    expect(error({ ...loadFixture('sample-news'), extra: 1 })).toContain('extra')
  })

  it('trims title and summary and rejects blank ones', () => {
    expect(parsed({ ...loadFixture('sample-news'), title: '  Hi  ' }).value.title).toBe('Hi')
    expect(error({ ...loadFixture('sample-news'), title: '   ' })).toContain('title')
  })

  it('formats errors as Invalid input: path: message', () => {
    expect(error({ ...loadFixture('sample-news'), title: 5 })).toMatch(/^Invalid input: title: /)
  })

  it('defaults dedupeKey from type, title and the Tokyo date', () => {
    const raw = { ...loadFixture('sample-news'), title: '  Daily  AI ' }
    delete raw.dedupeKey
    delete raw.publishedAt
    const res = parseFeedItemInput(raw, new Date('2026-11-14T16:30:00Z'))
    if (!res.ok) throw new Error(res.error)
    expect(res.value.dedupeKey).toBe('news:daily ai:2026-11-15')
  })

  it('keeps a given dedupeKey and rejects a bad one', () => {
    expect(parsed(loadFixture('sample-news')).value.dedupeKey).toBe('news:daily-ai:2026-11-15')
    expect(error({ ...loadFixture('sample-news'), dedupeKey: 'has space' })).toContain('dedupeKey')
  })
})

describe('defaultDedupeKey', () => {
  it('uses publishedAt when given', () => {
    expect(defaultDedupeKey('news', 'X', new Date('2026-01-01T15:30:00Z'), now)).toBe(
      'news:x:2026-01-02'
    )
  })
})

describe('contentHash', () => {
  it('is stable across key order', () => {
    const a = loadFixture('sample-news')
    const b = Object.fromEntries(Object.entries(loadFixture('sample-news')).reverse())
    expect(parsed(a).value.contentHash).toBe(parsed(b).value.contentHash)
    expect(contentHash(a)).toBe(contentHash(b))
  })

  it('changes when the summary changes', () => {
    const a = parsed(loadFixture('sample-news')).value.contentHash
    const b = parsed({ ...loadFixture('sample-news'), summary: 'Different' }).value.contentHash
    expect(a).not.toBe(b)
  })

  it('ignores the defaulted observedAt', () => {
    const raw = loadFixture('sample-price-drop')
    delete raw.products[0].observedAt
    const a = parseFeedItemInput(raw, now)
    const b = parseFeedItemInput(raw, new Date(now.getTime() + 60_000))
    if (!a.ok || !b.ok) throw new Error('invalid')
    expect(a.value.contentHash).toBe(b.value.contentHash)
  })
})
