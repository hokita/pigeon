import { use } from 'react'
import {
  defaultGenerativeUILibrary as official,
  renderGenerativeUI,
  type GenerativeUILibrary,
} from '@assistant-ui/generative-ui/react'
import { PriceHistoryContext } from './priceHistoryContext'
import { resolveProduct } from './canonicalUrl'
import { formatPrice, shortDate } from '../format'

const lib = official as GenerativeUILibrary
const chartOnly: GenerativeUILibrary = { Chart: lib.Chart, Fact: lib.Fact }

export function PriceHistory({ product, title }: { product: string; title?: string }) {
  const { products, priceHistories } = use(PriceHistoryContext)
  const id = resolveProduct(product, products)
  const points = id ? (priceHistories[id] ?? []) : []
  if (!id || points.length === 0) return null
  const name = title ?? products.find((p) => p.productId === id)?.name ?? ''
  if (points.length === 1) {
    return renderGenerativeUI(
      {
        $type: 'Fact',
        label: 'First observation',
        value: `${formatPrice(points[0].price)} on ${shortDate(points[0].observedAt)}`,
      },
      chartOnly
    )
  }
  return (
    <figure className="m-0">
      {renderGenerativeUI(
        {
          $type: 'Chart',
          variant: 'line',
          showAxis: true,
          data: points.map((p) => ({ label: shortDate(p.observedAt), value: p.price })),
        },
        chartOnly
      )}
      <figcaption className="text-sm text-muted-foreground mt-1">
        {name} · {points.length} observations. Recorded by pigeon from Muse&apos;s observations.
      </figcaption>
    </figure>
  )
}
