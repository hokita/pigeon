import { createContext } from 'react'
import type { FeedProduct, PricePoint } from '../types'

export type PriceHistoryData = {
  products: FeedProduct[]
  priceHistories: Record<string, PricePoint[]>
}

export const PriceHistoryContext = createContext<PriceHistoryData>({
  products: [],
  priceHistories: {},
})
