import { describe, it, expect } from 'vitest'
import { fallbackTree } from './fallback'
import { guardTree } from './guard'
import { pigeonLibrary } from './library'
import type { FeedItemDetail } from '../types'

const item = {
  id: 'i_0123456789abcdef0123',
  type: 'price-watch',
  title: 'Headphones',
  summary: 's',
  createdAt: '2026-11-15T00:00:00.000Z',
  updatedAt: '2026-11-15T00:00:00.000Z',
  publishedAt: null,
  content: { markdown: '## Hi', sources: [{ title: 'S', url: 'https://example.com/s' }] },
  ui: null,
  uiStatus: 'invalid',
  products: [
    {
      productId: 'p_1',
      productKey: 'sku:1',
      name: 'A',
      url: 'https://a.example.com/x',
      canonicalUrl: 'https://a.example.com/x',
      price: 1,
      observedAt: '2026-11-15T00:00:00.000Z',
    },
    {
      productId: 'p_2',
      name: 'B',
      url: 'https://b.example.com/y',
      canonicalUrl: 'https://b.example.com/y',
      price: 2,
      observedAt: '2026-11-15T00:00:00.000Z',
    },
  ],
} satisfies FeedItemDetail

type Node = { $type: string; product?: string; children?: Node[] }

describe('fallbackTree', () => {
  it('fallbackTree has one PriceHistory per product and no Citation', () => {
    const tree = fallbackTree(item) as Node
    const types = tree.children!.map((c) => c.$type)
    expect(types).toEqual(['Header', 'Markdown', 'PriceHistory', 'PriceHistory'])
    expect(tree.children!.slice(2).map((c) => c.product)).toEqual([
      'sku:1',
      'https://b.example.com/y',
    ])
  })

  it('fallbackTree passes guardTree with replaced 0', () => {
    expect(guardTree(fallbackTree(item), pigeonLibrary)!.replaced).toBe(0)
  })
})
