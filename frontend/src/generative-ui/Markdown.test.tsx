import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('Markdown renders GFM tables and lists', () => {
    const { container } = render(
      <Markdown value={'| a | b |\n| - | - |\n| 1 | 2 |\n\n- one\n- two'} />
    )
    expect(container.querySelector('[data-aui="markdown"]')).toHaveClass('prose')
    expect(container.querySelector('.overflow-x-auto > table')).not.toBeNull()
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  it('Markdown renders raw HTML as text and drops javascript: links', () => {
    const { container } = render(
      <Markdown
        value={
          '<script>alert(1)</script> <img src=x onerror=alert(1)>\n\nSee [x](javascript:alert(1)) here'
        }
      />
    )
    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('x').closest('a')?.getAttribute('href') ?? null).toBeNull()
    expect(container.textContent).toContain('<script>')
  })

  it('safe links open in a new tab with noopener', () => {
    render(<Markdown value="[site](https://example.com/a)" />)
    const link = screen.getByRole('link', { name: 'site' })
    expect(link).toHaveAttribute('href', 'https://example.com/a')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
  })

  it('Markdown http image is not loaded', () => {
    const { container } = render(<Markdown value="![a cat](http://images.example.com/cat.png)" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('a cat')
  })

  it('https images load lazily without a referrer', () => {
    const { container } = render(<Markdown value="![a cat](https://images.example.com/cat.png)" />)
    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(img).toHaveAttribute('loading', 'lazy')
  })
})
