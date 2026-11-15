import { describe, it, expect } from 'vitest'
import { guardTree } from './guard'
import { pigeonLibrary } from './library'
import { loadFixture } from '../testing/fixtures'

describe('guardTree', () => {
  it('replaces only the bad node', () => {
    const res = guardTree(
      {
        $type: 'Col',
        children: [
          { $type: 'Header', text: 'ok' },
          { $type: 'Chart', variant: 'line', data: 'oops' },
          { $type: 'Text', value: 'fine' },
        ],
      },
      pigeonLibrary
    )!
    expect(res.replaced).toBe(1)
    const children = (res.tree as { children: { $type: string }[] }).children
    expect(children.map((c) => c.$type)).toEqual(['Header', 'Unsupported', 'Text'])
  })

  it('replaces an unknown type', () => {
    const res = guardTree({ _type: 'Button', label: 'x' }, pigeonLibrary)!
    expect(res).toEqual({ tree: { $type: 'Unsupported' }, replaced: 1 })
  })

  it.each(['toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'replaces a prototype-named type %s instead of throwing',
    (type) => {
      const res = guardTree(
        { $type: 'Col', children: [{ $type: type }, { $type: 'Text', value: 'x' }] },
        pigeonLibrary
      )!
      expect(res.replaced).toBe(1)
    }
  )

  it('replaces a node with an unknown prop', () => {
    expect(guardTree({ $type: 'Card', background: 'red' }, pigeonLibrary)!.replaced).toBe(1)
  })

  it('returns null over 400 nodes', () => {
    const tree = {
      $type: 'Col',
      children: Array.from({ length: 400 }, () => ({ $type: 'Text', value: 'x' })),
    }
    expect(guardTree(tree, pigeonLibrary)).toBeNull()
  })

  it('returns null over depth 12', () => {
    let tree: Record<string, unknown> = { $type: 'Col' }
    for (let i = 0; i < 12; i++) tree = { $type: 'Col', children: tree }
    expect(guardTree(tree, pigeonLibrary)).toBeNull()
  })

  it('returns null over 30 images or 200 KB', () => {
    const images = {
      $type: 'Col',
      children: Array.from({ length: 31 }, () => ({
        $type: 'Image',
        src: 'https://a.example.com/x.png',
        alt: 'x',
      })),
    }
    expect(guardTree(images, pigeonLibrary)).toBeNull()
    const big = {
      $type: 'Col',
      children: Array.from({ length: 11 }, () => ({ $type: 'Markdown', value: 'a'.repeat(20000) })),
    }
    expect(guardTree(big, pigeonLibrary)).toBeNull()
  })

  it.each(['sample-news', 'sample-research', 'sample-price-drop'])(
    'accepts the %s fixture unchanged',
    (name) => {
      // The backend–frontend contract: every tree the backend accepts renders without replacements.
      expect(guardTree(loadFixture(name).ui.root, pigeonLibrary)!.replaced).toBe(0)
    }
  )
})

describe('renderLibrary', () => {
  it('renders Unsupported as a note, and pigeonLibrary does not include it', async () => {
    const { render } = await import('@testing-library/react')
    const { renderGenerativeUI } = await import('@assistant-ui/generative-ui/react')
    const { renderLibrary } = await import('./renderLibrary')
    const { container } = render(<>{renderGenerativeUI({ $type: 'Unsupported' }, renderLibrary)}</>)
    expect(container.querySelector('[data-aui="unsupported"][role="note"]')?.textContent).toBe(
      "Couldn't show this part."
    )
    expect(pigeonLibrary).not.toHaveProperty('Unsupported')
  })
})
