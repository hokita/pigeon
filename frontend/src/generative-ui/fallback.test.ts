import { describe, it, expect } from 'vitest'
import { fallbackTree, stripLeadingTitle } from './fallback'
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

type Node = { $type: string; product?: string; value?: string; children?: Node[] }

const withMarkdown = (markdown: string) => ({ ...item, content: { ...item.content, markdown } })

describe('fallbackTree', () => {
  it('fallbackTree has one PriceHistory per product and no Citation', () => {
    const tree = fallbackTree(item) as Node
    const types = tree.children!.map((c) => c.$type)
    expect(types).toEqual(['Markdown', 'PriceHistory', 'PriceHistory'])
    expect(tree.children!.slice(1).map((c) => c.product)).toEqual([
      'sku:1',
      'https://b.example.com/y',
    ])
  })

  it('fallbackTree passes guardTree with replaced 0', () => {
    expect(guardTree(fallbackTree(item), pigeonLibrary)!.replaced).toBe(0)
  })

  it('fallbackTree strips the title line from its Markdown', () => {
    const tree = fallbackTree(withMarkdown('# Headphones\n\n## Hi')) as Node
    expect(tree.children![0]).toMatchObject({ $type: 'Markdown', value: '## Hi' })
  })

  it('fallbackTree omits Markdown when only the title line was there', () => {
    const tree = fallbackTree(withMarkdown('# Headphones\n'))
    expect((tree as Node).children!.map((c) => c.$type)).toEqual(['PriceHistory', 'PriceHistory'])
    expect(guardTree(tree, pigeonLibrary)!.replaced).toBe(0)
  })
})

describe('stripLeadingTitle', () => {
  it.each([
    ['# Headphones\n\nBody', 'Body'],
    ['# Headphones\r\n\r\nBody', 'Body'],
    ['# Headphones  \nBody', 'Body'],
    ['## Headphones\nBody', '## Headphones\nBody'],
    ['# Headphones (updated)\nBody', '# Headphones (updated)\nBody'],
    ['\n# Headphones\nBody', '\n# Headphones\nBody'],
    ['Intro\n\n# Headphones', 'Intro\n\n# Headphones'],
    ['# headphones\nBody', '# headphones\nBody'],
  ])('stripLeadingTitle(%j) -> %j', (markdown, expected) => {
    expect(stripLeadingTitle(markdown, 'Headphones')).toBe(expected)
  })
})
