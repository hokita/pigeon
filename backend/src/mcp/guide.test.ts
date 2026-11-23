import { describe, it, expect } from 'vitest'
import { GUIDE_EXAMPLES, uiGuideText } from './guide.js'
import { validateUiTree } from '../ui/validate.js'

type Node = { _type: string; children?: unknown; [key: string]: unknown }

const examples = Object.entries(GUIDE_EXAMPLES)

function childrenOf(node: Node): Node[] {
  const c = node.children
  if (Array.isArray(c)) return c as Node[]
  if (c && typeof c === 'object') return [c as Node]
  return []
}

function nodes(node: Node): Node[] {
  return [node, ...childrenOf(node).flatMap(nodes)]
}

const rootOf = (tree: { root: unknown }) => tree.root as Node

describe('get_ui_guide examples', () => {
  it.each(examples)('the %s example is a valid tree', (_name, tree) => {
    expect(validateUiTree(tree)).toMatchObject({ ok: true })
  })

  it.each(examples)('the %s example does not open with a Header', (_name, tree) => {
    expect(childrenOf(rootOf(tree))[0]._type).not.toBe('Header')
    expect(nodes(rootOf(tree)).filter((n) => n._type === 'Header')).toEqual([])
  })

  it.each(examples)('the %s example has no inline source lines', (_name, tree) => {
    expect(JSON.stringify(tree)).not.toMatch(/出典/)
  })

  it.each(examples)('the %s example does not repeat a tab name inside the tab', (_name, tree) => {
    for (const tabs of nodes(rootOf(tree)).filter((n) => n._type === 'Tabs')) {
      const names = tabs.tabs as string[]
      childrenOf(tabs).forEach((child, i) => {
        for (const n of nodes(child)) {
          expect(n._type === 'Header' && n.text === names[i]).toBe(false)
          expect(n._type === 'Card' && n.title === names[i]).toBe(false)
        }
      })
    }
  })

  it.each(examples)('the %s example makes no price-history claim in text', (_name, tree) => {
    expect(JSON.stringify(tree)).not.toMatch(/lowest|highest|recorded price|all-time/i)
  })

  it('the digest example has the digest shape', () => {
    const root = rootOf(GUIDE_EXAMPLES.digest)
    const top = childrenOf(root)
    const table = top.find((n) => n._type === 'Table')!
    const tabs = top.find((n) => n._type === 'Tabs')!
    const labels = (table.columns as { label: string }[]).map((c) => c.label)
    expect(labels).toEqual(expect.arrayContaining(['Category', 'Subject', 'Date', 'Point']))
    expect((table.rows as unknown[]).length).toBe((tabs.tabs as string[]).length)
    expect(childrenOf(tabs).every((c) => c._type === 'Card')).toBe(true)
    expect(top.some((n) => n._type === 'Timeline')).toBe(true)
    expect(top.some((n) => n._type === 'Alert' && n.tone === 'warning')).toBe(true)
    const take = top.find((n) => n._type === 'Alert' && n.title === "Muse's take")!
    expect((take.description as string).length).toBeGreaterThanOrEqual(80)
    expect(nodes(root).some((n) => n._type === 'Fact')).toBe(true)
  })

  it('the guide lists the layout rules', () => {
    const guide = uiGuideText([])
    expect(guide).toContain("Don't start the layout with a Header that repeats the title")
    expect(guide).toContain('（出典：…）')
    expect(guide).toContain("Don't repeat a tab's name as a heading inside it")
    expect(guide).toContain('Always send ui.')
    expect(guide).toContain('### digest')
  })
})
