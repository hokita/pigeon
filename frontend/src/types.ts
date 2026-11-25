export type PriceChange = { amount: number; percent: number }

export type PricePoint = { observedAt: string; price: number }

export type FeedProductSummary = { name: string; price: number; change?: PriceChange }

export type FeedItemSummary = {
  id: string
  type: string
  title: string
  summary: string
  createdAt: string
  publishedAt: string | null
  unread: boolean
  products: FeedProductSummary[]
}

export type FeedProduct = {
  productId: string
  productKey?: string
  name: string
  url: string
  canonicalUrl: string
  price: number
  listPrice?: number
  imageUrl?: string
  retailer?: string
  observedAt: string
  change?: PriceChange
}

export type FeedSource = { title: string; url?: string; publisher?: string; publishedAt?: string }

export type StoredUi = { schemaVersion: number; root: unknown }

export type FeedItemDetail = Omit<FeedItemSummary, 'products'> & {
  updatedAt: string
  content: { markdown: string; sources: FeedSource[] }
  ui: StoredUi | null
  uiStatus: 'valid' | 'invalid' | 'missing'
  products: FeedProduct[]
}

export type ItemResponse = { item: FeedItemDetail; priceHistories: Record<string, PricePoint[]> }

export type ItemType = { type: string; count: number; lastItemAt: string }
