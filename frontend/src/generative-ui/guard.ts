import type { z } from 'zod'
import type { GenerativeUILibrary } from '@assistant-ui/generative-ui/react'
import { UI_LIMITS } from './limits'

type Node = Record<string, unknown>

const isNode = (v: unknown): v is Node => typeof v === 'object' && v !== null && !Array.isArray(v)
const typeOf = (n: Node) => n.$type ?? n._type
const childList = (n: Node): unknown[] =>
  n.children === undefined ? [] : Array.isArray(n.children) ? n.children : [n.children]

function withinLimits(root: unknown): boolean {
  if (new TextEncoder().encode(JSON.stringify(root)).length > UI_LIMITS.maxBytes) return false
  let nodes = 0
  let images = 0
  const stack: [unknown, number][] = [[root, 1]]
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!
    if (!isNode(node)) continue
    if (++nodes > UI_LIMITS.maxNodes || depth > UI_LIMITS.maxDepth) return false
    if (typeOf(node) === 'Image' && ++images > UI_LIMITS.maxImages) return false
    for (const child of childList(node)) stack.push([child, depth + 1])
  }
  return true
}

function strict(schema: z.ZodType): z.ZodType {
  const s = schema as z.ZodType & { strict?: () => z.ZodType }
  return typeof s.strict === 'function' ? s.strict() : schema
}

export function guardTree(
  root: unknown,
  library: GenerativeUILibrary
): { tree: unknown; replaced: number } | null {
  if (!isNode(root) || !withinLimits(root)) return null
  let replaced = 0
  const visit = (node: unknown): unknown => {
    if (typeof node === 'string' || typeof node === 'number') return node
    if (!isNode(node)) {
      replaced++
      return { $type: 'Unsupported' }
    }
    const type = typeOf(node)
    const entry =
      typeof type === 'string' && Object.prototype.hasOwnProperty.call(library, type)
        ? library[type]
        : undefined
    const children = node.children
    const props = Object.fromEntries(
      Object.entries(node).filter(([k]) => k !== '$type' && k !== '_type' && k !== 'children')
    )
    if (!entry || !strict(entry.properties).safeParse(props).success) {
      replaced++
      return { $type: 'Unsupported' }
    }
    const out: Node = { $type: type, ...props }
    if (children !== undefined)
      out.children = Array.isArray(children) ? children.map(visit) : visit(children)
    return out
  }
  const tree = visit(root)
  return { tree, replaced }
}
