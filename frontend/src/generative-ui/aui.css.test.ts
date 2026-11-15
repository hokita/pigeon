import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync('src/generative-ui/aui.css', 'utf8') // vitest runs from frontend/

describe('vendored generative-ui stylesheet', () => {
  it('has the official component rules', () => {
    for (const sel of ['[data-aui="chart"]', '[data-aui="timeline"]', '[data-aui="citation"]']) {
      expect(css).toContain(sel)
    }
  })

  it('names its source and hash in the header', () => {
    const header = css.slice(0, css.indexOf('*/'))
    expect(header).toContain('r.assistant-ui.com/generative-ui-style.json')
    expect(header).toMatch(/sha256 [0-9a-f]{64}/)
  })

  it('loads nothing remote', () => {
    expect(css).not.toContain('@import')
    expect(css).not.toContain('url(')
  })

  it('defines the light and dark aui variables', () => {
    expect(css).toMatch(/:root \{[^}]*--aui-success/)
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{\s*:root \{[^}]*--aui-success/)
  })
})
