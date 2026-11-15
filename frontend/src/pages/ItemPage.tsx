import { useEffect, useState, type MouseEvent } from 'react'
import { api } from '../api'
import ItemRenderer from '../components/ItemRenderer'
import { TypeBadge } from '../components/FeedCard'
import { formatDate } from '../format'
import { safeLinkUrl } from '../generative-ui/safeUrl'
import type { Route } from '../router'
import type { FeedSource, ItemResponse } from '../types'

type State =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'missing' }
  | { status: 'ready'; data: ItemResponse }

function Sources({ sources }: { sources: FeedSource[] }) {
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

// The page frame (title, Written by Muse, type, date, Sources) is always drawn here,
// outside the tree, so it shows whatever state the stored tree is in (design §8).
export default function ItemPage({
  id,
  navigate,
}: {
  id: string
  navigate: (route: Route) => void
}) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    api.getItem(id).then(
      (data) => active && setState(data ? { status: 'ready', data } : { status: 'missing' }),
      () => active && setState({ status: 'error' })
    )
    return () => {
      active = false
    }
  }, [id, attempt])

  useEffect(() => {
    if (state.status === 'ready') document.title = `${state.data.item.title} · pigeon`
  }, [state])

  const back = (e: MouseEvent) => {
    e.preventDefault()
    navigate({ page: 'feed' })
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <a href="/" onClick={back} className="text-sm text-muted-foreground no-underline">
        ← Feed
      </a>
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
