import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { api } from '../api'
import ItemRenderer from '../components/ItemRenderer'
import { TypeBadge } from '../components/FeedCard'
import { formatDate } from '../format'
import { PullIndicator } from '../pullToRefresh/PullIndicator'
import { usePullToRefresh } from '../pullToRefresh/usePullToRefresh'
import { safeLinkUrl } from '../generative-ui/safeUrl'
import type { Route } from '../router'
import type { FeedSource, ItemResponse } from '../types'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; data: ItemResponse }

const show = (data: ItemResponse | null): State =>
  data ? { status: 'ready', data } : { status: 'missing' }

function Sources({ sources }: { sources: FeedSource[] }) {
  if (sources.length === 0) return null
  return (
    <footer className="mt-10 border-t border-border pt-4">
      <h2 className="text-base font-semibold mt-0 mb-2">Sources</h2>
      <ol className="m-0 pl-5 flex flex-col gap-1 text-sm break-words">
        {sources.map((s, i) => {
          const href = safeLinkUrl(s.url)
          return (
            <li key={i}>
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="underline"
                >
                  {s.title}
                </a>
              ) : (
                <span>{s.title}</span>
              )}
              {s.publisher && <span className="text-muted-foreground"> — {s.publisher}</span>}
            </li>
          )
        })}
      </ol>
    </footer>
  )
}

export default function ItemPage({
  id,
  navigate,
}: {
  id: string
  navigate: (route: Route) => void
}) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const generation = useRef(0)

  useEffect(() => {
    const current = ++generation.current
    api.getItem(id).then(
      (data) => {
        if (current !== generation.current) return
        setState(show(data))
        setRefreshFailed(false)
      },
      () => current === generation.current && setState({ status: 'error' })
    )
  }, [id, attempt])

  async function refresh() {
    const current = ++generation.current
    try {
      const data = await api.getItem(id)
      if (current !== generation.current) return
      setState(show(data))
      setRefreshFailed(false)
    } catch {
      if (current !== generation.current) return
      setRefreshFailed(true)
      setState((s) => (s.status === 'loading' ? { status: 'error' } : s))
    }
  }

  const pull = usePullToRefresh(refresh)

  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.data.item.title} · pigeon`
  }, [state])

  const back = (e: MouseEvent) => {
    e.preventDefault()
    navigate({ page: 'feed' })
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <PullIndicator distance={pull.distance} refreshing={pull.refreshing} />
      <a href="/" onClick={back} className="text-sm text-muted-foreground no-underline">
        ← Feed
      </a>
      {state.status === 'ready' && refreshFailed && (
        <div role="alert" className="mt-4">
          <p>Couldn&apos;t refresh this item.</p>
          <button
            type="button"
            onClick={pull.refresh}
            className="rounded-md border border-border px-4 py-2"
          >
            Retry
          </button>
        </div>
      )}
      {state.status === 'loading' && <p className="text-muted-foreground">Loading…</p>}
      {state.status === 'missing' && <p>This item doesn&apos;t exist.</p>}
      {state.status === 'error' && (
        <div role="alert">
          <p>Couldn&apos;t load this item.</p>
          <button
            type="button"
            onClick={() => {
              setState({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
            className="rounded-md border border-border px-4 py-2"
          >
            Retry
          </button>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <h1 className="text-2xl font-bold mt-4 mb-2 break-words">{state.data.item.title}</h1>
          <p
            data-testid="item-meta"
            className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-0 mb-6"
          >
            <span>Written by Muse</span>
            <span aria-hidden="true">·</span>
            <TypeBadge type={state.data.item.type} />
            <span aria-hidden="true">·</span>
            <time dateTime={state.data.item.publishedAt ?? state.data.item.createdAt}>
              {formatDate(state.data.item.publishedAt ?? state.data.item.createdAt)}
            </time>
          </p>
          <article className="max-w-3xl mx-auto">
            <ItemRenderer response={state.data} />
          </article>
          <Sources sources={state.data.item.content.sources} />
        </>
      )}
    </main>
  )
}
