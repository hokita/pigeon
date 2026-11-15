export type Route = { page: 'feed'; type?: string } | { page: 'item'; id: string }

const TYPE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/
const ITEM_PATH = /^\/items\/(i_[0-9a-f]{20})$/

// `/` is the feed (optionally `?type=<slug>`); `/items/:id` is an item. Anything else is the feed.
export function parseRoute(pathname: string, search: string): Route {
  const item = ITEM_PATH.exec(pathname)
  if (item) return { page: 'item', id: item[1] }
  const type = new URLSearchParams(search).get('type')
  return type && TYPE_PATTERN.test(type) ? { page: 'feed', type } : { page: 'feed' }
}

export function routePath(route: Route): string {
  if (route.page === 'item') return `/items/${route.id}`
  return route.type ? `/?type=${encodeURIComponent(route.type)}` : '/'
}
