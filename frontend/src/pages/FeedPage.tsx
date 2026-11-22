import { useEffect, useState } from 'react'
import { api } from '../api'
import { FeedCard } from '../components/FeedCard'
import type { Route } from '../router'
import type { FeedItemSummary, ItemType } from '../types'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; items: FeedItemSummary[]; nextCursor: string | null }

const filterArgs = (type?: string, cursor?: string) => ({
  ...(type && { type }),
  ...(cursor && { cursor }),
})

export default function FeedPage({
  type,
  navigate,
}: {
  type?: string
  navigate: (route: Route) => void
}) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [types, setTypes] = useState<ItemType[]>([])
  const [loadingMore, setLoadingMore] = useState(false)

  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    api.listItems(filterArgs(type)).then(
      (page) => active && setState({ status: 'ready', ...page }),
      () => active && setState({ status: 'error' })
    )
    return () => {
      active = false
    }
  }, [type, attempt])

  function retry() {
    setState({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  useEffect(() => {
    api.listTypes().then(setTypes, () => setTypes([]))
  }, [])

  async function loadMore() {
    if (state.status !== 'ready' || !state.nextCursor) return
    setLoadingMore(true)
    try {
      const page = await api.listItems(filterArgs(type, state.nextCursor))
      setState({
        status: 'ready',
        items: [...state.items, ...page.items],
        nextCursor: page.nextCursor,
      })
    } catch {
      setState({ status: 'error' })
    } finally {
      setLoadingMore(false)
    }
  }

  const filters = types.map((t) => t.type)
  if (type && !filters.includes(type)) filters.push(type)

  const chip = (label: string, value: string | undefined) => (
    <button
      key={label}
      type="button"
      aria-pressed={type === value}
      onClick={() => navigate(value ? { page: 'feed', type: value } : { page: 'feed' })}
      className="shrink-0 rounded-full border border-border px-3 py-1 text-sm aria-pressed:bg-primary aria-pressed:text-background"
    >
      {label}
    </button>
  )

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold mt-0 mb-4">pigeon</h1>
      <nav aria-label="Filter by type" className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {chip('All', undefined)}
        {filters.map((t) => chip(t, t))}
      </nav>
      {state.status === 'loading' && <p className="text-muted-foreground">Loading…</p>}
      {state.status === 'error' && (
        <div role="alert">
          <p>Couldn&apos;t load the feed.</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-md border border-border px-4 py-2"
          >
            Retry
          </button>
        </div>
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <p className="text-muted-foreground">Nothing yet. Items Muse saves show up here.</p>
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <ul className="list-none p-0 m-0 flex flex-col gap-3">
          {state.items.map((item) => (
            <FeedCard key={item.id} item={item} navigate={navigate} />
          ))}
        </ul>
      )}
      {state.status === 'ready' && state.nextCursor && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-4 w-full rounded-md border border-border px-4 py-2"
        >
          Load more
        </button>
      )}
    </main>
  )
}
