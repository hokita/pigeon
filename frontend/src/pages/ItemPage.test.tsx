import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import type { ItemResponse } from '../types'

const { getItem, markRead } = vi.hoisted(() => ({ getItem: vi.fn(), markRead: vi.fn() }))
vi.mock('../api', () => ({ api: { getItem, markRead } }))

import ItemPage from './ItemPage'
import { pullDown } from '../testing/pull'

const ID = 'i_0123456789abcdef0123'
const navigate = vi.fn()

function response(over: Partial<ItemResponse['item']> = {}): ItemResponse {
  return {
    item: {
      id: ID,
      type: 'research',
      title: 'Heat pumps',
      summary: 's',
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
      publishedAt: '2026-11-14T03:00:00.000Z',
      content: {
        markdown: 'Saved write-up',
        sources: [
          { title: 'Energy guide', url: 'https://energy.example.org/a', publisher: 'Energy Guide' },
          { title: 'Field test', url: 'https://homelab.example.com/b' },
        ],
      },
      ui: {
        schemaVersion: 1,
        root: { $type: 'Col', children: [{ $type: 'Header', text: 'Tree header' }] },
      },
      uiStatus: 'valid',
      unread: false,
      products: [],
      ...over,
    },
    priceHistories: {},
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  markRead.mockResolvedValue(undefined)
})

describe('ItemPage', () => {
  it('renders the item via ItemRenderer', async () => {
    getItem.mockResolvedValue(response())
    render(<ItemPage id={ID} navigate={navigate} />)
    expect(await screen.findByText('Tree header')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Heat pumps' })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Heat pumps · pigeon'))
    expect(getItem).toHaveBeenCalledWith(ID)
  })

  it('frame shows Written by Muse, the type and the date', async () => {
    getItem.mockResolvedValue(response())
    render(<ItemPage id={ID} navigate={navigate} />)
    const meta = await screen.findByTestId('item-meta')
    expect(meta).toHaveTextContent('Written by Muse')
    expect(meta).toHaveTextContent('research')
    expect(meta).toHaveTextContent('2026/11/14 12:00')
  })

  it('date falls back to createdAt without publishedAt', async () => {
    getItem.mockResolvedValue(response({ publishedAt: null }))
    render(<ItemPage id={ID} navigate={navigate} />)
    expect(await screen.findByTestId('item-meta')).toHaveTextContent('2026/11/15 09:00')
  })

  it('Sources footer lists every source with title, publisher and rel noopener', async () => {
    getItem.mockResolvedValue(response())
    render(<ItemPage id={ID} navigate={navigate} />)
    const footer = await screen.findByRole('contentinfo')
    expect(within(footer).getByRole('heading', { name: 'Sources' })).toBeInTheDocument()
    const links = within(footer).getAllByRole('link')
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', 'https://energy.example.org/a')
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer nofollow')
    expect(footer).toHaveTextContent('Energy Guide')
  })

  it('an unsafe source url is shown as text, not a link', async () => {
    const r = response()
    r.item.content.sources = [{ title: 'Bad', url: 'javascript:alert(1)' }]
    getItem.mockResolvedValue(r)
    render(<ItemPage id={ID} navigate={navigate} />)
    const footer = await screen.findByRole('contentinfo')
    expect(within(footer).queryByRole('link')).toBeNull()
    expect(footer).toHaveTextContent('Bad')
  })

  it('shows no Sources footer when there are no sources', async () => {
    const r = response()
    r.item.content.sources = []
    getItem.mockResolvedValue(r)
    render(<ItemPage id={ID} navigate={navigate} />)
    expect(await screen.findByTestId('item-meta')).toHaveTextContent('Written by Muse')
    expect(screen.getByText('Tree header')).toBeInTheDocument()
    expect(screen.queryByRole('contentinfo')).toBeNull()
    expect(screen.queryByText('Sources')).toBeNull()
  })

  it('a source without a url is plain text', async () => {
    const r = response()
    r.item.content.sources = [{ title: 'Owner conversation', publisher: 'Chat' }]
    getItem.mockResolvedValue(r)
    render(<ItemPage id={ID} navigate={navigate} />)
    const footer = await screen.findByRole('contentinfo')
    expect(within(footer).queryByRole('link')).toBeNull()
    expect(footer).toHaveTextContent('Owner conversation')
    expect(footer).toHaveTextContent('Chat')
  })

  it('frame and Sources show when ui is null', async () => {
    getItem.mockResolvedValue(response({ ui: null, uiStatus: 'invalid' }))
    render(<ItemPage id={ID} navigate={navigate} />)
    expect(await screen.findByTestId('item-meta')).toHaveTextContent('Written by Muse')
    expect(within(screen.getByRole('contentinfo')).getAllByRole('link')).toHaveLength(2)
    expect(screen.getByText('Saved write-up')).toBeInTheDocument()
  })

  it('a tree without Citations still shows sources', async () => {
    getItem.mockResolvedValue(response())
    const { container } = render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByText('Tree header')
    expect(container.querySelector('[data-aui="citation"]')).toBeNull()
    expect(within(screen.getByRole('contentinfo')).getAllByRole('link')).toHaveLength(2)
  })

  it('404 message', async () => {
    getItem.mockResolvedValue(null)
    render(<ItemPage id={ID} navigate={navigate} />)
    expect(await screen.findByText("This item doesn't exist.")).toBeInTheDocument()
  })

  it('error with retry', async () => {
    getItem.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce(response())
    render(<ItemPage id={ID} navigate={navigate} />)
    expect(await screen.findByText("Couldn't load this item.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Tree header')).toBeInTheDocument()
  })

  it('back link navigates to the feed', async () => {
    getItem.mockResolvedValue(response())
    render(<ItemPage id={ID} navigate={navigate} />)
    fireEvent.click(await screen.findByRole('link', { name: '← Feed' }))
    expect(navigate).toHaveBeenCalledWith({ page: 'feed' })
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

describe('ItemPage pull to refresh', () => {
  it('a pull refetches the item and shows the new version', async () => {
    getItem
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response({ title: 'Heat pumps v2' }))
    render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByText('Tree header')
    pullDown(200)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Heat pumps v2' })
    ).toBeInTheDocument()
    expect(getItem).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(document.title).toBe('Heat pumps v2 · pigeon'))
  })

  it('keeps the item on screen while refreshing', async () => {
    const d = deferred<ItemResponse | null>()
    getItem.mockResolvedValueOnce(response()).mockReturnValueOnce(d.promise)
    render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByText('Tree header')
    pullDown(200)
    expect(screen.getByRole('heading', { level: 1, name: 'Heat pumps' })).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.getByRole('status', { name: 'Refreshing' })).toBeInTheDocument()
    d.resolve(response())
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('a failed refresh keeps the item and offers Retry', async () => {
    getItem
      .mockResolvedValueOnce(response())
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce(response({ title: 'Heat pumps v2' }))
    render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByText('Tree header')
    pullDown(200)
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't refresh this item.")
    expect(screen.getByRole('heading', { level: 1, name: 'Heat pumps' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps v2' })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a refresh that finds the item deleted shows the missing message', async () => {
    getItem.mockResolvedValueOnce(response()).mockResolvedValueOnce(null)
    render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByText('Tree header')
    pullDown(200)
    expect(await screen.findByText("This item doesn't exist.")).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})

describe('ItemPage pull during the first load or a Retry', () => {
  it('a late first-load failure does not replace the refreshed item', async () => {
    const first = deferred<ItemResponse | null>()
    getItem
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(response({ title: 'Heat pumps v2' }))
    render(<ItemPage id={ID} navigate={navigate} />)
    pullDown(200)
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps v2' })
    first.reject(new Error('x'))
    await settle(first.promise)
    expect(screen.getByRole('heading', { level: 1, name: 'Heat pumps v2' })).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load this item.")).toBeNull()
  })

  it('a late first-load success does not restore the stale item', async () => {
    const first = deferred<ItemResponse | null>()
    getItem
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(response({ title: 'Heat pumps v2' }))
    render(<ItemPage id={ID} navigate={navigate} />)
    pullDown(200)
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps v2' })
    first.resolve(response())
    await settle(first.promise)
    expect(screen.getByRole('heading', { level: 1, name: 'Heat pumps v2' })).toBeInTheDocument()
  })

  it('a late Retry failure does not replace the refreshed item', async () => {
    const retried = deferred<ItemResponse | null>()
    getItem
      .mockRejectedValueOnce(new Error('x'))
      .mockReturnValueOnce(retried.promise)
      .mockResolvedValueOnce(response({ title: 'Heat pumps v2' }))
    render(<ItemPage id={ID} navigate={navigate} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))
    pullDown(200)
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps v2' })
    retried.reject(new Error('x'))
    await settle(retried.promise)
    expect(screen.getByRole('heading', { level: 1, name: 'Heat pumps v2' })).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load this item.")).toBeNull()
  })

  it('a failed pull during the first load shows the load error instead of loading forever', async () => {
    const first = deferred<ItemResponse | null>()
    getItem.mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('x'))
    render(<ItemPage id={ID} navigate={navigate} />)
    pullDown(200)
    expect(await screen.findByText("Couldn't load this item.")).toBeInTheDocument()
    first.resolve(response())
    await settle(first.promise)
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })
})

describe('ItemPage flags after a newer request succeeds', () => {
  it('a successful Retry clears a refresh error from a pull that failed during the load error', async () => {
    getItem
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce(response())
    render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByText("Couldn't load this item.")
    pullDown(200)
    await waitFor(() => expect(getItem).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps' })
    expect(screen.queryByText("Couldn't refresh this item.")).toBeNull()
  })

  it('a successful Retry clears a refresh error from a pull that failed during the first load', async () => {
    const first = deferred<ItemResponse | null>()
    getItem
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce(response())
    render(<ItemPage id={ID} navigate={navigate} />)
    pullDown(200)
    await screen.findByText("Couldn't load this item.")
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps' })
    expect(screen.queryByText("Couldn't refresh this item.")).toBeNull()
  })
})

describe('ItemPage marks the item read', () => {
  it('posts the mark once an unread item has loaded', async () => {
    getItem.mockResolvedValue(response({ unread: true }))
    render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps' })
    await waitFor(() => expect(markRead).toHaveBeenCalledWith(ID))
  })

  it('does not post for an item that is already read', async () => {
    getItem.mockResolvedValue(response())
    render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps' })
    expect(markRead).not.toHaveBeenCalled()
  })

  it('does not post for a missing item or a failed load', async () => {
    getItem.mockResolvedValueOnce(null)
    const { unmount } = render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByText("This item doesn't exist.")
    unmount()
    getItem.mockRejectedValueOnce(new Error('x'))
    render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByText("Couldn't load this item.")
    expect(markRead).not.toHaveBeenCalled()
  })

  it('a failed mark leaves the page as it is', async () => {
    markRead.mockRejectedValue(new Error('offline'))
    getItem.mockResolvedValue(response({ unread: true }))
    render(<ItemPage id={ID} navigate={navigate} />)
    await waitFor(() => expect(markRead).toHaveBeenCalled())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Heat pumps')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a pull that brings back an unread version marks it read again', async () => {
    getItem
      .mockResolvedValueOnce(response({ unread: true }))
      .mockResolvedValueOnce(response({ unread: true, title: 'Heat pumps v2' }))
    render(<ItemPage id={ID} navigate={navigate} />)
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1))
    pullDown(200)
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps v2' })
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2))
  })
})
