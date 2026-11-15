import type { MouseEvent } from 'react'
import { formatDate, formatPrice } from '../format'
import type { Route } from '../router'
import type { FeedItemSummary } from '../types'

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-block rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      {type}
    </span>
  )
}

export function FeedCard({
  item,
  navigate,
}: {
  item: FeedItemSummary
  navigate: (route: Route) => void
}) {
  const product = item.products[0]
  const onClick = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate({ page: 'item', id: item.id })
  }
  return (
    <li>
      <a
        href={`/items/${item.id}`}
        onClick={onClick}
        className="block rounded-lg border border-border bg-card p-4 no-underline text-inherit hover:bg-muted"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <TypeBadge type={item.type} />
          <time dateTime={item.publishedAt ?? item.createdAt}>
            {formatDate(item.publishedAt ?? item.createdAt)}
          </time>
        </div>
        <h2 className="mt-2 mb-1 text-base font-semibold break-words">{item.title}</h2>
        <p className="m-0 text-sm text-muted-foreground line-clamp-3 break-words">{item.summary}</p>
        {product && (
          <p className="mt-2 mb-0 text-sm">
            {product.name} · {formatPrice(product.price)}
            {product.change && product.change.percent !== 0 && (
              <span
                className={`ml-2 font-medium ${product.change.percent < 0 ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}
              >
                {product.change.percent < 0 ? '−' : '+'}
                {Math.abs(product.change.percent)}%
              </span>
            )}
          </p>
        )}
      </a>
    </li>
  )
}
