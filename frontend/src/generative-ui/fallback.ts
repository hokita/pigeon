import type { FeedItemDetail } from '../types'

export function fallbackTree(item: FeedItemDetail): unknown {
  return {
    $type: 'Col',
    gap: 4,
    children: [
      { $type: 'Header', text: item.title },
      { $type: 'Markdown', value: item.content.markdown },
      ...item.products.map((p) => ({ $type: 'PriceHistory', product: p.productKey ?? p.url })),
    ],
  }
}
