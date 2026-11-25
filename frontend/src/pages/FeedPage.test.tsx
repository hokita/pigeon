import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { FeedItemSummary } from '../types'

const { listItems, listTypes } = vi.hoisted(() => ({ listItems: vi.fn(), listTypes: vi.fn() }))
vi.mock('../api', () => ({ api: { listItems, listTypes } }))

import FeedPage from './FeedPage'
import { pullDown } from '../testing/pull'

const item = (id: string, over: Partial<FeedItemSummary> = {}): FeedItemSummary => ({
  id,
  type: 'news',
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  createdAt: '2026-11-15T00:00:00.000Z',
  publishedAt: null,
  unread: false,
  products: [],
  ...over,
})

const navigate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  listTypes.mockResolvedValue([
    { type: 'price-watch', count: 2, lastItemAt: '2026-11-15T00:00:00.000Z' },
    { type: 'news', count: 5, lastItemAt: '2026-11-14T00:00:00.000Z' },
  ])
  listItems.mockResolvedValue({ items: [item('i_a'), item('i_b')], nextCursor: null })
})

describe('FeedPage', () => {
  it('renders items newest first as given', async () => {
    render(<FeedPage navigate={navigate} />)
    const links = await screen.findAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining('Title i_a'),
      expect.stringContaining('Title i_b'),
    ])
    expect(links[0]).toHaveAttribute('href', '/items/i_a')
    expect(screen.getAllByText('2026/11/15 09:00')).toHaveLength(2)
  })

  it('clicking a card navigates', async () => {
    render(<FeedPage navigate={navigate} />)
    fireEvent.click((await screen.findAllByRole('link'))[0])
    expect(navigate).toHaveBeenCalledWith({ page: 'item', id: 'i_a' })
  })

  it('the filter shows one button per type from listTypes', async () => {
    render(<FeedPage navigate={navigate} />)
    await screen.findByRole('button', { name: 'price-watch' })
    const names = screen.getAllByRole('button').map((b) => b.textContent)
    expect(names.slice(0, 3)).toEqual(['All', 'price-watch', 'news'])
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking price-watch calls listItems with that type and sets aria-pressed', async () => {
    const { rerender } = render(<FeedPage navigate={navigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'price-watch' }))
    expect(navigate).toHaveBeenCalledWith({ page: 'feed', type: 'price-watch' })
    rerender(<FeedPage type="price-watch" navigate={navigate} />)
    await waitFor(() => expect(listItems).toHaveBeenLastCalledWith({ type: 'price-watch' }))
    expect(screen.getByRole('button', { name: 'price-watch' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('a URL type missing from listTypes still filters', async () => {
    render(<FeedPage type="reading-list" navigate={navigate} />)
    await waitFor(() => expect(listItems).toHaveBeenCalledWith({ type: 'reading-list' }))
    expect(await screen.findByRole('button', { name: 'reading-list' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })

  it('Load more appends the next page', async () => {
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [item('i_b')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    await screen.findByText('Title i_b')
    expect(listItems).toHaveBeenLastCalledWith({ cursor: 'c2' })
    expect(screen.getByText('Title i_a')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })

  it('shows the price change when an item has products', async () => {
    listItems.mockResolvedValue({
      items: [
        item('i_p', {
          type: 'price-watch',
          products: [{ name: 'WH-2000', price: 32800, change: { amount: -6800, percent: -17.2 } }],
        }),
      ],
      nextCursor: null,
    })
    render(<FeedPage navigate={navigate} />)
    expect(await screen.findByText(/WH-2000 · .*32,800/)).toBeInTheDocument()
    expect(screen.getByText('−17.2%')).toBeInTheDocument()
  })

  it('items without products show no price', async () => {
    render(<FeedPage navigate={navigate} />)
    await screen.findByText('Title i_a')
    expect(screen.queryByText(/￥|¥/)).toBeNull()
  })

  it('empty state', async () => {
    listItems.mockResolvedValue({ items: [], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    expect(
      await screen.findByText('Nothing yet. Items Muse saves show up here.')
    ).toBeInTheDocument()
  })

  it('error state with retry', async () => {
    listItems.mockRejectedValueOnce(new Error('x'))
    render(<FeedPage navigate={navigate} />)
    expect(await screen.findByText("Couldn't load the feed.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Title i_a')).toBeInTheDocument()
  })
})

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (reason: Error) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function settle(promise: Promise<unknown>) {
  await act(async () => {
    await promise.catch(() => undefined)
  })
}

const types = (...names: string[]) =>
  names.map((type) => ({ type, count: 1, lastItemAt: '2026-11-15T00:00:00.000Z' }))

describe('FeedPage pull to refresh', () => {
  it('refetches the first page with the same type and resets Load more', async () => {
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [item('i_b')], nextCursor: 'c3' })
      .mockResolvedValueOnce({ items: [item('i_new'), item('i_a')], nextCursor: 'c9' })
      .mockResolvedValueOnce({ items: [], nextCursor: null })
    render(<FeedPage type="news" navigate={navigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    await screen.findByText('Title i_b')
    pullDown(200)
    await screen.findByText('Title i_new')
    expect(listItems).toHaveBeenNthCalledWith(3, { type: 'news' })
    expect(screen.queryByText('Title i_b')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(listItems).toHaveBeenLastCalledWith({ type: 'news', cursor: 'c9' }))
  })

  it('keeps the current items on screen while refreshing', async () => {
    const d = deferred<{ items: FeedItemSummary[]; nextCursor: string | null }>()
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: null })
      .mockReturnValueOnce(d.promise)
    render(<FeedPage navigate={navigate} />)
    await screen.findByText('Title i_a')
    pullDown(200)
    expect(screen.getByText('Title i_a')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.getByRole('status', { name: 'Refreshing' })).toBeInTheDocument()
    d.resolve({ items: [item('i_new')], nextCursor: null })
    await screen.findByText('Title i_new')
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('a failed refresh keeps the items and offers Retry', async () => {
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: null })
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce({ items: [item('i_new')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    await screen.findByText('Title i_a')
    pullDown(200)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't refresh the feed.")
    expect(screen.getByText('Title i_a')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Title i_new')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a pull also refetches the type list so a new type chip appears', async () => {
    listTypes.mockReset()
    listTypes.mockResolvedValueOnce(types('news')).mockResolvedValueOnce(types('news', 'research'))
    render(<FeedPage navigate={navigate} />)
    await screen.findByRole('button', { name: 'news' })
    expect(screen.queryByRole('button', { name: 'research' })).toBeNull()
    pullDown(200)
    await screen.findByRole('button', { name: 'research' })
    expect(listTypes).toHaveBeenCalledTimes(2)
  })

  it('a failed type list refetch keeps the current chips and shows no error', async () => {
    listTypes.mockReset()
    listTypes.mockResolvedValueOnce(types('news')).mockRejectedValueOnce(new Error('x'))
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: null })
      .mockResolvedValueOnce({ items: [item('i_new')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    await screen.findByRole('button', { name: 'news' })
    pullDown(200)
    await screen.findByText('Title i_new')
    await waitFor(() => expect(listTypes).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(screen.getByRole('button', { name: 'news' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a pull after a failed first load shows the feed', async () => {
    listItems.mockRejectedValueOnce(new Error('x'))
    render(<FeedPage navigate={navigate} />)
    await screen.findByText("Couldn't load the feed.")
    pullDown(200)
    expect(await screen.findByText('Title i_a')).toBeInTheDocument()
  })

  it('Load more is blocked while a refresh is pending', async () => {
    const d = deferred<{ items: FeedItemSummary[]; nextCursor: string | null }>()
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: 'c2' })
      .mockReturnValueOnce(d.promise)
      .mockResolvedValueOnce({ items: [item('i_next')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    const more = await screen.findByRole('button', { name: 'Load more' })
    pullDown(200)
    expect(more).toBeDisabled()
    fireEvent.click(more)
    expect(listItems).toHaveBeenCalledTimes(2)
    d.resolve({ items: [item('i_new')], nextCursor: 'c9' })
    await screen.findByText('Title i_new')
    expect(screen.queryByText('Title i_a')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('Title i_next')
    expect(listItems).toHaveBeenLastCalledWith({ cursor: 'c9' })
  })

  it('a Load more that fails after a refresh keeps the refreshed feed', async () => {
    let reject: (reason: Error) => void = () => undefined
    const pending = new Promise<never>((_, r) => {
      reject = r
    })
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: 'c2' })
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce({ items: [item('i_new')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    pullDown(200)
    await screen.findByText('Title i_new')
    reject(new Error('x'))
    await settle(pending)
    expect(screen.getByText('Title i_new')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load the feed.")).toBeNull()
  })

  it('a Load more that finishes after a refresh is dropped', async () => {
    const d = deferred<{ items: FeedItemSummary[]; nextCursor: string | null }>()
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: 'c2' })
      .mockReturnValueOnce(d.promise)
      .mockResolvedValueOnce({ items: [item('i_new')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    pullDown(200)
    await screen.findByText('Title i_new')
    d.resolve({ items: [item('i_old2')], nextCursor: 'c3' })
    await settle(d.promise)
    expect(screen.queryByText('Title i_old2')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  })
})

describe('FeedPage pull during the first load or a Retry', () => {
  type Page = { items: FeedItemSummary[]; nextCursor: string | null }

  it('a late first-load failure does not replace the refreshed feed', async () => {
    const first = deferred<Page>()
    listItems
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ items: [item('i_new')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    pullDown(200)
    await screen.findByText('Title i_new')
    first.reject(new Error('x'))
    await settle(first.promise)
    expect(screen.getByText('Title i_new')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load the feed.")).toBeNull()
  })

  it('a late first-load success does not restore stale items', async () => {
    const first = deferred<Page>()
    listItems
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ items: [item('i_new')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    pullDown(200)
    await screen.findByText('Title i_new')
    first.resolve({ items: [item('i_old')], nextCursor: null })
    await settle(first.promise)
    expect(screen.getByText('Title i_new')).toBeInTheDocument()
    expect(screen.queryByText('Title i_old')).toBeNull()
  })

  it('a late Retry failure does not replace the refreshed feed', async () => {
    const retried = deferred<Page>()
    listItems
      .mockRejectedValueOnce(new Error('x'))
      .mockReturnValueOnce(retried.promise)
      .mockResolvedValueOnce({ items: [item('i_new')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    pullDown(200)
    await screen.findByText('Title i_new')
    retried.reject(new Error('x'))
    await settle(retried.promise)
    expect(screen.getByText('Title i_new')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load the feed.")).toBeNull()
  })

  it('a failed pull during the first load shows the load error instead of loading forever', async () => {
    const first = deferred<Page>()
    listItems.mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('x'))
    render(<FeedPage navigate={navigate} />)
    pullDown(200)
    expect(await screen.findByText("Couldn't load the feed.")).toBeInTheDocument()
    first.resolve({ items: [item('i_old')], nextCursor: null })
    await settle(first.promise)
    expect(screen.queryByText('Title i_old')).toBeNull()
  })
})

describe('FeedPage pull during the first type list load', () => {
  type Types = ReturnType<typeof types>

  it('a late first type-list success does not replace the refreshed chips', async () => {
    const first = deferred<Types>()
    listTypes.mockReturnValueOnce(first.promise).mockResolvedValueOnce(types('news', 'research'))
    render(<FeedPage navigate={navigate} />)
    await screen.findByText('Title i_a')
    pullDown(200)
    await screen.findByRole('button', { name: 'research' })
    first.resolve(types('stale'))
    await settle(first.promise)
    expect(screen.getByRole('button', { name: 'research' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'stale' })).toBeNull()
  })

  it('a late first type-list failure does not clear the refreshed chips', async () => {
    const first = deferred<Types>()
    listTypes.mockReturnValueOnce(first.promise).mockResolvedValueOnce(types('news', 'research'))
    render(<FeedPage navigate={navigate} />)
    await screen.findByText('Title i_a')
    pullDown(200)
    await screen.findByRole('button', { name: 'research' })
    first.reject(new Error('x'))
    await settle(first.promise)
    expect(screen.getByRole('button', { name: 'research' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'news' })).toBeInTheDocument()
  })
})

describe('FeedPage flags after a newer request succeeds', () => {
  type Page = { items: FeedItemSummary[]; nextCursor: string | null }

  it('a successful Retry clears a refresh error from a pull that failed during the load error', async () => {
    listItems
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    await screen.findByText("Couldn't load the feed.")
    pullDown(200)
    await waitFor(() => expect(listItems).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Title i_a')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a successful Retry after a failed Load more clears an earlier refresh error', async () => {
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: 'c2' })
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce({ items: [item('i_b')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    await screen.findByText('Title i_a')
    pullDown(200)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't refresh the feed.")
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText("Couldn't load the feed.")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('Title i_b')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Load more is usable right after a refresh even while an older Load more is pending', async () => {
    const older = deferred<Page>()
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: 'c2' })
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ items: [item('i_new')], nextCursor: 'c9' })
      .mockResolvedValueOnce({ items: [item('i_next')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    pullDown(200)
    await screen.findByText('Title i_new')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('Title i_next')
    expect(listItems).toHaveBeenLastCalledWith({ cursor: 'c9' })
    older.resolve({ items: [item('i_old')], nextCursor: 'c3' })
    await settle(older.promise)
    expect(screen.queryByText('Title i_old')).toBeNull()
  })

  it('an older Load more settling does not re-enable Load more while a newer one is pending', async () => {
    const older = deferred<Page>()
    const newer = deferred<Page>()
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: 'c2' })
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ items: [item('i_new')], nextCursor: 'c9' })
      .mockReturnValueOnce(newer.promise)
    render(<FeedPage navigate={navigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    pullDown(200)
    await screen.findByText('Title i_new')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    older.resolve({ items: [item('i_old')], nextCursor: 'c3' })
    await settle(older.promise)
    expect(screen.getByRole('button', { name: 'Load more' })).toBeDisabled()
    newer.resolve({ items: [item('i_next')], nextCursor: null })
    await screen.findByText('Title i_next')
  })

  it('a failed refresh does not leave Load more stuck when an older Load more was pending', async () => {
    const older = deferred<Page>()
    listItems
      .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: 'c2' })
      .mockReturnValueOnce(older.promise)
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce({ items: [item('i_b')], nextCursor: null })
    render(<FeedPage navigate={navigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }))
    pullDown(200)
    await screen.findByRole('alert')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await screen.findByText('Title i_b')
    expect(listItems).toHaveBeenLastCalledWith({ cursor: 'c2' })
  })
})
