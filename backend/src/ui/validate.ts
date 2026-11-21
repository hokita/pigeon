import type { z } from 'zod'
import { ALLOWED_TYPES, CONTAINER_TYPES, propSchema } from './library.js'
import { MAX_ISSUES, UI_LIMITS } from './limits.js'

export type UiChild = UiNode | string | number
export type UiNode = { $type: string; children?: UiChild | UiChild[]; [prop: string]: unknown }
export type StoredUi = { schemaVersion: 1; root: UiNode }
export type UiIssue = { path: string; message: string }
export type UiValidation = { ok: true; ui: StoredUi } | { ok: false; issues: UiIssue[] }

const containers = new Set<string>(CONTAINER_TYPES)
const allowed = new Set(ALLOWED_TYPES)

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function childList(node: Record<string, unknown>): unknown[] {
  const c = node.children
  if (c === undefined) return []
  return Array.isArray(c) ? c : [c]
}

function joinPath(base: string, parts: readonly PropertyKey[]): string {
  let out = base
  for (const p of parts) out += typeof p === 'number' ? `[${p}]` : `.${String(p)}`
  return out
}

function checkLimits(root: unknown, envelope: unknown): UiIssue | null {
  if (Buffer.byteLength(JSON.stringify(envelope)) > UI_LIMITS.maxBytes) {
    return { path: 'root', message: `UI definition too large (max ${UI_LIMITS.maxBytes} bytes)` }
  }
  let nodes = 0
  let images = 0
  const stack: [unknown, number][] = [[root, 1]]
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!
    if (!isObject(node)) continue
    nodes++
    if (depth > UI_LIMITS.maxDepth)
      return { path: 'root', message: `Too deep (max ${UI_LIMITS.maxDepth})` }
    if (nodes > UI_LIMITS.maxNodes)
      return { path: 'root', message: `Too many nodes (max ${UI_LIMITS.maxNodes})` }
    if ((node.$type ?? node._type) === 'Image' && ++images > UI_LIMITS.maxImages) {
      return { path: 'root', message: `Too many images (max ${UI_LIMITS.maxImages})` }
    }
    for (const child of childList(node)) stack.push([child, depth + 1])
  }
  return null
}

function zodIssues(path: string, error: z.ZodError): UiIssue[] {
  return error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: joinPath(path, [...issue.path, key]),
        message: 'Unknown prop',
      }))
    }
    return [{ path: joinPath(path, issue.path), message: issue.message }]
  })
}

function normalizeNode(node: unknown, path: string, issues: UiIssue[]): UiChild | null {
  if (typeof node === 'string' || typeof node === 'number') return node
  if (!isObject(node)) {
    issues.push({ path, message: 'Expected a component node, text or a number' })
    return null
  }
  const type = node.$type ?? node._type
  if (typeof type !== 'string' || !allowed.has(type)) {
    issues.push({
      path,
      message: typeof type === 'string' ? `Unknown component "${type}"` : 'Missing _type',
    })
    return null
  }
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key !== '$type' && key !== '_type' && key !== 'children') props[key] = value
  }
  const parsed = propSchema(type).safeParse(props)
  if (!parsed.success) issues.push(...zodIssues(path, parsed.error))

  const out: UiNode = { $type: type, ...(parsed.success ? (parsed.data as object) : props) }
  if (node.children === undefined) {
    if (type === 'Tabs' && Array.isArray(props.tabs) && props.tabs.length > 0) {
      issues.push({
        path: `${path}.children`,
        message: `Tabs needs one child per tab (${props.tabs.length})`,
      })
    }
    return out
  }
  if (!containers.has(type)) {
    issues.push({ path: `${path}.children`, message: `${type} takes no children` })
    return out
  }
  const list = childList(node)
  if (type === 'Tabs' && Array.isArray(props.tabs) && list.length !== props.tabs.length) {
    issues.push({
      path: `${path}.children`,
      message: `Tabs needs one child per tab (${props.tabs.length})`,
    })
  }
  const children = list.map((child, i) =>
    normalizeNode(
      child,
      Array.isArray(node.children) ? `${path}.children[${i}]` : `${path}.children`,
      issues
    )
  )
  out.children = Array.isArray(node.children) ? (children as UiChild[]) : (children[0] as UiChild)
  return out
}

export function validateUiTree(input: unknown): UiValidation {
  if (!isObject(input))
    return { ok: false, issues: [{ path: '', message: 'Expected { schemaVersion, root }' }] }
  const issues: UiIssue[] = []
  const extra = Object.keys(input).filter((k) => k !== 'schemaVersion' && k !== 'root')
  for (const key of extra) issues.push({ path: key, message: 'Unknown key' })
  if (input.schemaVersion !== 1 && input.schemaVersion !== '1.0') {
    issues.push({ path: 'schemaVersion', message: 'Unsupported schemaVersion (expected 1)' })
  }
  if (!isObject(input.root)) {
    issues.push({ path: 'root', message: 'Root must be a component node' })
    return { ok: false, issues: issues.slice(0, MAX_ISSUES) }
  }
  const limit = checkLimits(input.root, input)
  if (limit) return { ok: false, issues: [...issues, limit].slice(0, MAX_ISSUES) }
  const root = normalizeNode(input.root, 'root', issues)
  if (issues.length > 0 || !isObject(root))
    return { ok: false, issues: issues.slice(0, MAX_ISSUES) }
  return { ok: true, ui: { schemaVersion: 1, root: root as UiNode } }
}
