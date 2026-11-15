import { describe, it, expect } from 'vitest'
import { canonicalUrl, resolveProduct } from './canonicalUrl'

describe('canonicalUrl', () => {
  it.each([
    [
      'https://www.Example.com/item/42/?utm_source=x&b=2&a=1#reviews',
      'https://example.com/item/42?a=1&b=2',
    ],
    ['http://example.com/item/42', 'https://example.com/item/42'],
    [
      'https://shop.example.org/item?id=77&UTM_Campaign=x&_gl=1*abc&ref=top',
      'https://shop.example.org/item?id=77',
    ],
    [
      'https://store.example.net/p/9?ttclid=a&igshid=b&msclkid=c&color=red',
      'https://store.example.net/p/9?color=red',
    ],
    ['https://shop.example.com/', 'https://shop.example.com/'],
    ['https://shop.example.com:443/p?gclid=1&fbclid=2', 'https://shop.example.com/p'],
  ])('%s becomes %s', (input, expected) => {
    expect(canonicalUrl(input)).toBe(expected)
  })

  it('is null for a bad URL', () => {
    expect(canonicalUrl('not a url')).toBeNull()
    expect(canonicalUrl('sku:1')).toBeNull()
  })
})

describe('resolveProduct', () => {
  const products = [
    {
      productId: 'p_a',
      productKey: 'sku:1',
      url: 'https://a.example.com/x?ref=1',
      canonicalUrl: 'https://a.example.com/x',
    },
    { productId: 'p_b', url: 'https://b.example.com/y', canonicalUrl: 'https://b.example.com/y' },
  ]
  it('matches productKey, then url, then canonical url', () => {
    expect(resolveProduct('sku:1', products)).toBe('p_a')
    expect(resolveProduct('https://b.example.com/y', products)).toBe('p_b')
    expect(resolveProduct('https://www.a.example.com/x?utm_source=z', products)).toBe('p_a')
    expect(resolveProduct('sku:other', products)).toBeUndefined()
  })
})
