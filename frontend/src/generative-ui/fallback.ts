import type { FeedItemDetail } from '../types'

// Built in code from the item's content when its tree is missing or unusable.
// Sources aren't repeated: the page frame always lists them (design §8).
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
