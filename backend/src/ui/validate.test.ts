import { describe, it, expect } from 'vitest'
import { validateUiTree } from './validate.js'
import { ALLOWED_TYPES, uiGuideSchema } from './library.js'

const fullTree = {
  _type: 'Col',
  gap: 4,
  children: [
    { _type: 'Header', text: 'Daily AI' },
    { _type: 'Markdown', value: '## Summary\n\nSomething happened.' },
    { _type: 'Image', src: 'https://images.example.com/a.jpg', alt: 'A chip' },
    {
      _type: 'Table',
      columns: [{ label: 'Model' }, { label: 'Score', align: 'end' }],
      rows: [
        ['A', 1],
        ['B', 2],
      ],
    },
    { _type: 'Chart', variant: 'line', data: [{ label: 'Mon', value: 1 }] },
    { _type: 'Timeline', items: [{ time: '09:00', title: 'Launch' }] },
    { _type: 'Alert', tone: 'info', title: "Muse's take" },
    { _type: 'Citation', title: 'Source', url: 'https://news.example.org/x' },
    {
      _type: 'Row',
      children: [
        { _type: 'Fact', label: 'Price', value: '¥32,800' },
        { _type: 'Fact', label: 'Was', value: '¥39,600', delta: '-17%', trend: 'down' },
      ],
    },
    { _type: 'Card', title: 'Note', children: { _type: 'Text', value: 'hi' } },
    { _type: 'PriceHistory', product: 'sku:1' },
  ],
}

const ui = (root: unknown, schemaVersion: unknown = 1) => ({ schemaVersion, root })

function issuesOf(input: unknown) {
  const res = validateUiTree(input)
  if (res.ok) throw new Error('expected invalid')
  return res.issues
}

describe('validateUiTree', () => {
  it('accepts the news, research and price-drop fixture ui', () => {
    expect(validateUiTree(ui(fullTree)).ok).toBe(true)
  })

  it('normalizes _type to $type', () => {
    const res = validateUiTree(ui({ _type: 'Col', children: [{ _type: 'Text', value: 'x' }] }))
    if (!res.ok) throw new Error(JSON.stringify(res.issues))
    expect(res.ui.root.$type).toBe('Col')
    expect(res.ui.root).not.toHaveProperty('_type')
    expect((res.ui.root.children as { $type: string }[])[0].$type).toBe('Text')
  })

  it('accepts schemaVersion "1.0" as 1', () => {
    const res = validateUiTree(ui({ _type: 'Divider' }, '1.0'))
    if (!res.ok) throw new Error('invalid')
    expect(res.ui.schemaVersion).toBe(1)
  })

  it('rejects schemaVersion 2', () => {
    expect(issuesOf(ui({ _type: 'Divider' }, 2))[0].path).toBe('schemaVersion')
  })

  it('rejects an unknown component', () => {
    expect(issuesOf(ui({ _type: 'Button', label: 'x' }))).toContainEqual({
      path: 'root',
      message: 'Unknown component "Button"',
    })
  })

  it('rejects Card background', () => {
    const issues = issuesOf(ui({ _type: 'Card', background: 'red' }))
    expect(issues.map((i) => i.path)).toContain('root.background')
  })

  it('rejects a non-https image', () => {
    for (const src of [
      'http://a.example/x.png',
      'javascript:alert(1)',
      'https://user:pw@a.example/x.png',
    ]) {
      expect(issuesOf(ui({ _type: 'Image', src, alt: 'x' })).map((i) => i.path)).toContain(
        'root.src'
      )
    }
  })

  it('rejects a javascript: citation url', () => {
    expect(
      issuesOf(ui({ _type: 'Citation', title: 't', url: 'javascript:alert(1)' })).map((i) => i.path)
    ).toContain('root.url')
  })

  it('rejects a table row with the wrong cell count', () => {
    const table = {
      _type: 'Table',
      columns: [{ label: 'a' }, { label: 'b' }],
      rows: [['1', '2'], ['3']],
    }
    expect(issuesOf(ui(table)).map((i) => i.path)).toContain('root.rows[1]')
  })

  it('reports nested paths', () => {
    const tree = { _type: 'Col', children: [{ _type: 'Text', value: 'ok' }, { _type: 'Header' }] }
    expect(issuesOf(ui(tree)).map((i) => i.path)).toContain('root.children[1].text')
  })

  it('rejects more than 400 nodes', () => {
    const tree = {
      _type: 'Col',
      children: Array.from({ length: 400 }, () => ({ _type: 'Text', value: 'x' })),
    }
    expect(issuesOf(ui(tree))).toContainEqual({ path: 'root', message: 'Too many nodes (max 400)' })
  })

  it('rejects depth over 12', () => {
    let tree: Record<string, unknown> = { _type: 'Col' }
    for (let i = 0; i < 12; i++) tree = { _type: 'Col', children: tree }
    expect(issuesOf(ui(tree))).toContainEqual({ path: 'root', message: 'Too deep (max 12)' })
  })

  it('accepts depth 12', () => {
    let tree: Record<string, unknown> = { _type: 'Col' }
    for (let i = 0; i < 11; i++) tree = { _type: 'Col', children: tree }
    expect(validateUiTree(ui(tree)).ok).toBe(true)
  })

  it('rejects more than 200 KB', () => {
    const tree = {
      _type: 'Col',
      children: Array.from({ length: 11 }, () => ({ _type: 'Markdown', value: 'a'.repeat(20000) })),
    }
    expect(issuesOf(ui(tree))).toContainEqual({
      path: 'root',
      message: 'UI definition too large (max 200000 bytes)',
    })
  })

  it('rejects more than 30 images', () => {
    const tree = {
      _type: 'Col',
      children: Array.from({ length: 31 }, () => ({
        _type: 'Image',
        src: 'https://a.example.com/x.png',
        alt: 'x',
      })),
    }
    expect(issuesOf(ui(tree))).toContainEqual({ path: 'root', message: 'Too many images (max 30)' })
  })

  it('caps issues at 20', () => {
    const tree = { _type: 'Col', children: Array.from({ length: 30 }, () => ({ _type: 'Image' })) }
    expect(issuesOf(ui(tree)).length).toBe(20)
  })

  it('rejects reserved keys like _action', () => {
    const issues = issuesOf(ui({ _type: 'Text', value: 'x', _action: { type: 'go' } }))
    expect(issues.map((i) => i.path)).toContain('root._action')
  })

  it('rejects children on a leaf component', () => {
    const issues = issuesOf(ui({ _type: 'Header', text: 'h', children: 'x' }))
    expect(issues).toContainEqual({ path: 'root.children', message: 'Header takes no children' })
  })

  it('requires one Tabs child per tab', () => {
    const tabs = { _type: 'Tabs', tabs: ['a', 'b'], children: [{ _type: 'Text', value: 'x' }] }
    expect(issuesOf(ui(tabs))).toContainEqual({
      path: 'root.children',
      message: 'Tabs needs one child per tab (2)',
    })
  })

  it('applies pigeon length caps', () => {
    expect(issuesOf(ui({ _type: 'Header', text: 'h'.repeat(201) }))[0].path).toBe('root.text')
    expect(issuesOf(ui({ _type: 'Badge', value: 'b'.repeat(41) }))[0].path).toBe('root.value')
    const data = Array.from({ length: 367 }, (_, i) => ({ value: i }))
    expect(issuesOf(ui({ _type: 'Chart', variant: 'line', data }))[0].path).toBe('root.data')
  })

  it('rejects a non-object root', () => {
    expect(issuesOf(ui('hello'))[0].path).toBe('root')
    expect(issuesOf('nope')[0].path).toBe('')
  })

  it('uiGuideSchema lists exactly the allowed types', () => {
    const schema = uiGuideSchema() as { properties: { _type: { enum: string[] } } }
    expect([...schema.properties._type.enum].sort()).toEqual([...ALLOWED_TYPES].sort())
    expect(ALLOWED_TYPES).toHaveLength(19)
  })
})
