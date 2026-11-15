import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { FeedItemSummary } from '../types'

const { listItems, listTypes } = vi.hoisted(() => ({ listItems: vi.fn(), listTypes: vi.fn() }))
vi.mock('../api', () => ({ api: { listItems, listTypes } }))

import FeedPage from './FeedPage'

const item = (id: string, over: Partial<FeedItemSummary> = {}): FeedItemSummary => ({
  id,
  type: 'news',
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  createdAt: '2026-11-15T00:00:00.000Z',
  publishedAt: null,
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
