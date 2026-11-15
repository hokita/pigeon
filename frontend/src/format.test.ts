import { describe, it, expect } from 'vitest'
import { formatDate, formatPrice, shortDate } from './format'

describe('format', () => {
  it('formatPrice(32800) is ￥32,800', () => {
    expect(formatPrice(32800)).toBe(
      new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(32800)
    )
    expect(formatPrice(32800)).toContain('32,800')
  })

  it('formatDate uses Asia/Tokyo', () => {
    expect(formatDate('2026-11-15T00:00:00.000Z')).toBe('2026/11/15 09:00')
    expect(formatDate('2026-11-14T16:30:00.000Z')).toBe('2026/11/15 01:30')
  })

  it('shortDate is month/day in Tokyo', () => {
    expect(shortDate('2026-11-14T16:30:00.000Z')).toBe('11/15')
  })
})
