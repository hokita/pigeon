import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { z } from 'zod'
import ItemRenderer from './ItemRenderer'
import { renderLibrary } from '../generative-ui/renderLibrary'
import { loadFixture, type FixtureName } from '../testing/fixtures'
import type { FeedItemDetail, ItemResponse } from '../types'

const NOTE = "Showing the saved content; the layout Muse sent couldn't be used."

function response(fixture: FixtureName, overrides: Partial<FeedItemDetail> = {}): ItemResponse {
  const raw = loadFixture(fixture)
  return {
    item: {
      id: 'i_0123456789abcdef0123',
      type: raw.type,
      title: raw.title,
      summary: raw.summary,
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
      publishedAt: null,
      content: raw.content,
      ui: raw.ui,
      uiStatus: 'valid',
      products: [],
      ...overrides,
    },
    priceHistories: {},
  }
}

describe('ItemRenderer', () => {
  it('ItemRenderer renders the news fixture', () => {
    const { container } = render(<ItemRenderer response={response('sample-news')} />)
    for (const sel of [
      '[data-aui="markdown"]',
      '[data-aui="table"]',
      '[data-aui="timeline"]',
      'svg[data-aui="chart"]',
    ]) {
      expect(container.querySelector(sel)).not.toBeNull()
    }
    expect(screen.queryByText(NOTE)).toBeNull()
  })

  it('ItemRenderer uses the fallback when ui is null', () => {
    const { container } = render(
      <ItemRenderer response={response('sample-invalid-ui', { ui: null, uiStatus: 'invalid' })} />
    )
    expect(screen.getByText(NOTE)).toBeInTheDocument()
    expect(container.querySelector('[data-aui="markdown"]')?.textContent).toContain('Saved content')
    expect(container.querySelector('[data-aui="citation"]')).toBeNull()
  })

  it('the fallback shows no heading of its own', () => {
    const raw = loadFixture('sample-invalid-ui')
    const r = response('sample-invalid-ui', { ui: null, uiStatus: 'invalid' })
    r.item.content = { ...r.item.content, markdown: `# ${raw.title}\n\nSaved content` }
    const { container } = render(<ItemRenderer response={r} />)
    expect(screen.queryByRole('heading')).toBeNull()
    const markdown = container.querySelector('[data-aui="markdown"]')?.textContent
    expect(markdown).toContain('Saved content')
    expect(markdown).not.toContain(raw.title)
  })

  it('uses the fallback for an unknown schema version', () => {
    render(
      <ItemRenderer response={response('sample-news', { ui: { schemaVersion: 9, root: {} } })} />
    )
    expect(screen.getByText(NOTE)).toBeInTheDocument()
  })

  it('replaces a bad stored node with a notice', () => {
    const r = response('sample-news')
    r.item.ui = {
      schemaVersion: 1,
      root: { $type: 'Col', children: [{ $type: 'Header', text: 'Kept' }, { $type: 'Button' }] },
    }
    render(<ItemRenderer response={r} />)
    expect(screen.getByText('Kept')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent("Couldn't show this part.")
  })

  it('ItemRenderer survives a component that throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const library = {
      ...renderLibrary,
      Boom: {
        description: 'throws',
        properties: z.object({}),
        render: () => {
          throw new Error('boom')
        },
      },
    }
    const r = response('sample-news')
    r.item.ui = {
      schemaVersion: 1,
      root: {
        $type: 'Col',
        children: [{ $type: 'Header', text: 'Still here' }, { $type: 'Boom' }],
      },
    }
    render(<ItemRenderer response={r} library={library} />)
    expect(screen.getByText('Still here')).toBeInTheDocument()
  })

  it('the crash fallback also drops the leading title line', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fail = () => {
      throw new Error('broken library')
    }
    const library = new Proxy({} as typeof renderLibrary, {
      get: fail,
      getOwnPropertyDescriptor: fail,
      has: fail,
    })
    const r = response('sample-news')
    r.item.content = { ...r.item.content, markdown: `# ${r.item.title}\n\nBody text` }
    const { container } = render(<ItemRenderer response={r} library={library} />)
    expect(screen.getByText('Body text')).toBeInTheDocument()
    expect(container.textContent).not.toContain(r.item.title)
  })

  it('a stored node named toString does not blank the page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = response('sample-news')
    r.item.ui = {
      schemaVersion: 1,
      root: { $type: 'Col', children: [{ $type: 'Header', text: 'Kept' }, { $type: 'toString' }] },
    }
    render(<ItemRenderer response={r} />)
    expect(screen.getByText('Kept')).toBeInTheDocument()
  })

  it('an error while preparing the tree falls back to the saved Markdown', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const fail = () => {
      throw new Error('broken library')
    }
    const library = new Proxy({} as typeof renderLibrary, {
      get: fail,
      getOwnPropertyDescriptor: fail,
      has: fail,
    })
    render(<ItemRenderer response={response('sample-news')} library={library} />)
    expect(document.querySelector('[data-aui="markdown"]')?.textContent).toContain('Lumen-7')
  })
})
