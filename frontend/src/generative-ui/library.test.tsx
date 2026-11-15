import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { renderGenerativeUI } from '@assistant-ui/generative-ui/react'
import { ALLOWED_TYPES, pigeonLibrary } from './library'

const show = (tree: unknown) => render(<>{renderGenerativeUI(tree, pigeonLibrary)}</>)

describe('pigeonLibrary', () => {
  it('pigeonLibrary has exactly the allowed types', () => {
    expect(Object.keys(pigeonLibrary).sort()).toEqual(
      [
        'Alert',
        'Badge',
        'Caption',
        'Card',
        'Chart',
        'Citation',
        'Col',
        'Divider',
        'Fact',
        'Header',
        'Image',
        'Markdown',
        'PriceHistory',
        'Row',
        'Steps',
        'Table',
        'Tabs',
        'Text',
        'Timeline',
      ].sort()
    )
    expect([...ALLOWED_TYPES].sort()).toEqual(Object.keys(pigeonLibrary).sort())
  })

  it('renders official Header, Table, Chart, Timeline, Alert and Citation', () => {
    const { container } = show({
      $type: 'Col',
      children: [
        { $type: 'Header', text: 'Hello' },
        { $type: 'Table', columns: [{ label: 'a' }], rows: [['1']] },
        {
          $type: 'Chart',
          variant: 'line',
          data: [
            { label: 'a', value: 1 },
            { label: 'b', value: 2 },
          ],
        },
        { $type: 'Timeline', items: [{ time: '1', title: 'one' }] },
        { $type: 'Alert', title: "Muse's take" },
        { $type: 'Citation', title: 'Src', url: 'https://example.com/a' },
      ],
    })
    expect(container.textContent).toContain('Hello')
    expect(container.querySelector('[data-aui="table"]')).not.toBeNull()
    expect(container.querySelector('svg[data-aui="chart"]')).not.toBeNull()
    expect(container.querySelector('[data-aui="timeline"]')).not.toBeNull()
    expect(container.querySelector('[data-aui="alert"]')).not.toBeNull()
    expect(
      container
        .querySelector('[data-aui="citation"] a, a[data-aui="citation"]')
        ?.getAttribute('rel')
    ).toContain('noopener')
  })

  it('wraps official tables in their own horizontal scroll container', () => {
    const { container } = show({ $type: 'Table', columns: [{ label: 'a' }], rows: [['1']] })
    expect(container.querySelector('div.overflow-x-auto > [data-aui="table"]')).not.toBeNull()
  })

  it('Card drops background', () => {
    const { container } = show({ $type: 'Card', title: 'T', background: 'red', children: 'x' })
    expect(container.innerHTML).not.toContain('red')
    expect(container.textContent).toContain('T')
  })

  it('Image with an http src shows alt text, not an img', () => {
    const { container } = show({
      $type: 'Image',
      src: 'http://images.example.com/a.png',
      alt: 'A photo',
    })
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-aui="image-blocked"]')?.textContent).toBe('A photo')
  })

  it('Image with an https src renders without a referrer', () => {
    const { container } = show({
      $type: 'Image',
      src: 'https://images.example.com/a.png',
      alt: 'A photo',
    })
    expect(container.querySelector('img')).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('Markdown uses the safe renderer', () => {
    const { container } = show({ $type: 'Markdown', value: '**bold**' })
    expect(container.querySelector('[data-aui="markdown"] strong')?.textContent).toBe('bold')
  })
})
