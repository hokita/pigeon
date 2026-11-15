import { test, expect } from '@playwright/test'
import { signIn } from '../fixtures/auth.js'
import { fixture, MCP_URL, RUN, saveItem } from '../fixtures/mcp.js'

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'e2e', version: '0' },
  },
}

async function post(headers: Record<string, string>) {
  return fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(initialize),
  })
}

test('wrong token is 401', async () => {
  expect((await post({ Authorization: `Bearer ${'w'.repeat(64)}` })).status).toBe(401)
})

test('missing token is 401', async () => {
  expect((await post({})).status).toBe(401)
})

test('saving the same item twice is unchanged', async ({ page }) => {
  const input = { ...fixture('sample-news'), dedupeKey: `news:twice-${RUN}`, title: `Twice ${RUN}` }
  expect((await saveItem(input)).status).toBe('created')
  expect((await saveItem(input)).status).toBe('unchanged')
  await signIn(page)
  await expect(page.getByRole('link', { name: new RegExp(`Twice ${RUN}`) })).toHaveCount(1)
})
