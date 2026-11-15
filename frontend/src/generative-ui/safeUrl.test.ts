import { describe, it, expect } from 'vitest'
import { safeImageUrl, safeLinkUrl } from './safeUrl'

describe('safeLinkUrl', () => {
  it.each(['https://example.com/a?b=1', 'http://news.example.org/x'])('accepts %s', (url) => {
    expect(safeLinkUrl(url)).toBe(url)
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
    42,
    undefined,
  ])('rejects %s', (url) => {
    expect(safeLinkUrl(url)).toBeUndefined()
  })
})

describe('safeImageUrl', () => {
  it('rejects http', () => {
    expect(safeImageUrl('http://example.com/a.png')).toBeUndefined()
  })
  it('accepts https', () => {
    expect(safeImageUrl('https://images.example.com/a.png')).toBe(
      'https://images.example.com/a.png'
    )
  })
})
