import { describe, it, expect } from 'vitest'
import { canonicalUrl, checkImageUrl, checkLinkUrl, isTrackingParam, productIdFor } from './urls.js'

describe('checkLinkUrl', () => {
  it.each(['https://example.com/a?b=1', 'http://news.example.org/x'])('accepts %s', (url) => {
    expect(checkLinkUrl(url)).toBeNull()
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://example.com',
    'https://user:pw@example.com',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://[::1]/x',
    'https://intranet/x',
    'not a url',
    'https://example.com/' + 'a'.repeat(2048),
  ])('rejects %s', (url) => {
    expect(checkLinkUrl(url)).toEqual(expect.any(String))
  })
})

describe('checkImageUrl', () => {
  it('rejects http', () => {
    expect(checkImageUrl('http://example.com/a.png')).toEqual(expect.any(String))
  })
  it('accepts https', () => {
    expect(checkImageUrl('https://images.example.com/a.png')).toBeNull()
  })
})

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

  it('throws on a bad URL', () => {
    expect(() => canonicalUrl('not a url')).toThrow('Invalid product URL')
    expect(() => canonicalUrl('ftp://example.com/x')).toThrow('Invalid product URL')
  })
})

describe('isTrackingParam', () => {
  it('matches utm_* and listed names case-insensitively', () => {
    expect(isTrackingParam('utm_anything')).toBe(true)
    expect(isTrackingParam('FBCLID')).toBe(true)
    expect(isTrackingParam('id')).toBe(false)
  })
})

describe('productIdFor', () => {
  it('is the same for tracking and slash variants', () => {
    const a = productIdFor({ url: 'https://www.example.com/p/1?utm_medium=a' })
    expect(a).toBe(productIdFor({ url: 'https://example.com/p/1/' }))
    expect(a).toMatch(/^p_[0-9a-f]{20}$/)
  })

  it('uses productKey over url', () => {
    const a = productIdFor({ url: 'https://a.example.com/x', productKey: 'sku:1' })
    const b = productIdFor({ url: 'https://b.example.com/y', productKey: 'sku:1' })
    expect(a).toBe(b)
    expect(a).not.toBe(productIdFor({ url: 'https://a.example.com/x' }))
  })
})
