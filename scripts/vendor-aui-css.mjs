#!/usr/bin/env node
// Turns assistant-ui's official generative-ui style registry item (a shadcn
// `registry:style` JSON) into plain CSS. It never fetches: download the JSON first.
//
//   curl -sL -o /tmp/generative-ui-style.json https://r.assistant-ui.com/generative-ui-style.json
//   node scripts/vendor-aui-css.mjs /tmp/generative-ui-style.json frontend/src/generative-ui/aui.css
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'

const SOURCE = 'https://r.assistant-ui.com/generative-ui-style.json'
const [input, output] = process.argv.slice(2)
if (!input || !output) {
  console.error('Usage: vendor-aui-css.mjs <registry-json-path> <out-css-path>')
  process.exit(1)
}

const raw = readFileSync(input)
const item = JSON.parse(raw.toString('utf8'))
const sha256 = createHash('sha256').update(raw).digest('hex')
const today = new Date().toISOString().slice(0, 10)

// A block's value is either declarations (string values) or nested rules (object values).
function block(selector, body, indent) {
  const pad = '  '.repeat(indent)
  const lines = [`${pad}${selector} {`]
  for (const [key, value] of Object.entries(body)) {
    if (typeof value === 'string') lines.push(`${pad}  ${key}: ${value};`)
    else lines.push(block(key, value, indent + 1))
  }
  lines.push(`${pad}}`)
  return lines.join('\n')
}

const parts = [
  `/*\n * Vendored from ${SOURCE}\n * sha256 ${sha256}, generated ${today} by scripts/vendor-aui-css.mjs.\n * assistant-ui, MIT License (see NOTICE.md). Do not edit by hand; regenerate instead.\n */`,
  block(':root', item.cssVars?.light ?? {}, 0),
  `@media (prefers-color-scheme: dark) {\n${block(':root', item.cssVars?.dark ?? {}, 1)}\n}`,
  ...Object.entries(item.css).map(([selector, body]) => block(selector, body, 0)),
]
const css = parts.join('\n\n') + '\n'
if (css.includes('@import') || css.includes('url(')) {
  console.error('Refusing to write CSS that loads remote resources')
  process.exit(1)
}
writeFileSync(output, css)
console.log(`Wrote ${output} (${Object.keys(item.css).length} rules, sha256 ${sha256})`)
