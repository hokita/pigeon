import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { renderGenerativeUI } from '@assistant-ui/generative-ui/react'
import { renderLibrary } from './renderLibrary'
import { PriceHistoryContext } from './priceHistoryContext'
import type { FeedProduct, PricePoint } from '../types'

const product: FeedProduct = {
  productId: 'p_a',
  productKey: 'sku:wh',
  name: 'WH-2000',
  url: 'https://shop.example.com/p/wh?utm_source=x',
  canonicalUrl: 'https://shop.example.com/p/wh',
  price: 32800,
  observedAt: '2026-11-03T00:00:00.000Z',
}
const points: PricePoint[] = [
  { observedAt: '2026-11-01T00:00:00.000Z', price: 39600 },
  { observedAt: '2026-11-02T00:00:00.000Z', price: 35000 },
  { observedAt: '2026-11-03T00:00:00.000Z', price: 32800 },
]

function show(node: unknown, history: PricePoint[] = points) {
  return render(
    <PriceHistoryContext value={{ products: [product], priceHistories: { p_a: history } }}>
      {renderGenerativeUI(node, renderLibrary)}
    </PriceHistoryContext>
  )
}

describe('PriceHistory', () => {
  it('PriceHistory draws a line chart from recorded points, ignoring tree data', () => {
    const { container } = show({ $type: 'PriceHistory', product: 'sku:wh' })
    expect(container.querySelector('svg[data-aui="chart"]')).not.toBeNull()
    const caption = container.querySelector('figcaption')!.textContent!
    expect(caption).toContain('WH-2000 · 3 observations')
    expect(caption).toContain("Recorded by pigeon from Muse's observations.")
  })

  it('uses the title prop in the caption', () => {
    const { container } = show({ $type: 'PriceHistory', product: 'sku:wh', title: 'Headphones' })
    expect(container.querySelector('figcaption')!.textContent).toContain(
      'Headphones · 3 observations'
    )
  })

  it('PriceHistory matches by productKey, and matches a url with tracking params', () => {
    expect(
      show({ $type: 'PriceHistory', product: 'sku:wh' }).container.querySelector('figure')
    ).not.toBeNull()
    const byUrl = show({
      $type: 'PriceHistory',
      product: 'https://www.shop.example.com/p/wh?fbclid=1',
    })
    expect(byUrl.container.querySelector('figure')).not.toBeNull()
  })

  it('PriceHistory with one point shows First observation', () => {
    const { container } = show({ $type: 'PriceHistory', product: 'sku:wh' }, points.slice(0, 1))
    expect(container.querySelector('svg[data-aui="chart"]')).toBeNull()
    expect(container.textContent).toContain('First observation')
    expect(container.textContent).toContain('39,600')
  })

  it('PriceHistory with an unknown url renders nothing', () => {
    const { container } = show({ $type: 'PriceHistory', product: 'https://other.example.com/x' })
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing with no recorded points', () => {
    expect(show({ $type: 'PriceHistory', product: 'sku:wh' }, []).container.innerHTML).toBe('')
  })
})
