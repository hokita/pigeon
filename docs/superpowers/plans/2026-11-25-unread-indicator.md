# Unread Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed cards for items the owner hasn't opened since Muse last saved them show a dot and a bold title; opening the item page clears it.

**Architecture:** A boolean `unread` on each Firestore `items/{id}` doc, set by `saveFeedItem` whenever it writes the item and cleared by a new authenticated `POST /api/items/:id/read`. List and detail responses carry `unread`. `ItemPage` posts the mark once the item has loaded unread; `FeedPage` is unmounted while an item is open, so going back remounts it and refetches, and `api.listItems` first waits for any mark-read request still in flight so the refetch can't beat it.

**Tech Stack:** Express 5 + firebase-admin Firestore, Vitest (+ Firestore emulator for `*.db.test.ts`), supertest; React 19 + Vite + Tailwind v4, Testing Library; Playwright against the emulators.

**Spec:** `docs/superpowers/specs/2026-11-25-unread-indicator-design.md`

## Global Constraints

- Starts only after PR #15 (pull-to-refresh) merges: rebase this branch onto `main` first. Code below is written against #15's `FeedPage.tsx` / `ItemPage.tsx` / their tests.
- Red/green TDD for every task: failing test, run it red, minimal code, run it green, commit.
- No code comments. No `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, or rule changes; fix the code.
- No new dependencies.
- An item becomes read only when its item page opens; scrolling past doesn't count.
- Items without the `unread` field count as read. No migration.
- The mark-read call is a POST of its own, never a side effect of `GET`. It sits behind the existing `userAuth` on the items router.
- Not included: unread count, "unread only" filter, "mark all read", any change to MCP tools or Muse's instructions.
- Read cards keep today's card exactly; unread cards add the dot and a bold title, nothing else.
- Never commit secrets, project IDs, emails, or real item data; tests use fixtures and `RUN`-suffixed titles.

## Decisions taken in this plan

- **Back to the feed = refetch, no local patch.** `App` renders either `ItemPage` or `FeedPage`, so returning (the "← Feed" link or browser/iOS back via `popstate`) always remounts `FeedPage`, which loads page 1 again. Unread state therefore always comes from the server, the same as after a pull-to-refresh. The only race is a quick back before the POST commits; `api` closes it by making `listItems` await in-flight `markRead` calls (settled, success or failure).
- **Mark only when needed.** `ItemPage` calls `markRead` when it holds `ready` data with `unread: true`, so already-read items cost no write and a missing item sends nothing. A pull-to-refresh on the item page that returns `unread: true` (Muse re-saved while it was open) marks it read again, because the owner is looking at the new version.
- **A failed mark is silent.** The page renders normally; the dot stays and the next open tries again.
- **An identical re-save stays read** (status `unchanged`: same `dedupeKey` and same `contentHash`, nothing is written). Only a save that replaces the doc (`created`/`updated`) sets `unread: true`. _Owner to confirm; see the hand-off._ Flipping it is a one-line change in `saveFeedItem` plus the test `an unchanged re-save keeps the item read`.
- **Known gap, accepted:** if Muse re-saves between the item page's GET and its POST, the newer version is marked read unseen. Rare; fixing it needs a version token on the POST, which the spec doesn't ask for.

## Review Focus

- Quick back before the POST lands: the feed must not show the dot (Task 4 ordering test, Task 7 e2e).
- Mark-read failing (offline, 500): item page still renders with no error UI (Task 6).
- Opening an unknown item or an already-read item: no POST (Task 6).
- Muse re-saves while the item page is open and the owner pulls to refresh: it is marked read again (Task 6).
- Muse re-saves while the feed is open and the owner pulls to refresh: the dot appears (Task 5).

---

### Task 0: Rebase onto main after #15

- [ ] **Step 1:** `gh pr view 15 -R hokita/pigeon --json state --jq .state` → `MERGED`. If not merged, stop.
- [ ] **Step 2:** `git fetch origin && git rebase origin/main` (only these docs are on the branch, so no conflicts expected).
- [ ] **Step 3:** In `backend/`, `frontend/`: `npm ci && npm test && npm run lint`. Expected: all green before any change.

### Task 1: Saving marks an item unread; `markItemRead` clears it

**Files:**

- Modify: `backend/src/items/store.ts` (`saveFeedItem`'s `tx.set(itemRef, …)`; new export)
- Test: `backend/src/items/store.db.test.ts`

**Interfaces:**

- Produces: `markItemRead(id: string): Promise<boolean>` in `store.ts`; `true` when the item exists (whether or not it was unread), `false` when it doesn't. Item docs written by `saveFeedItem` carry `unread: true`.

- [ ] **Step 1: Write the failing tests** in a new `describe('unread', …)` in `store.db.test.ts`, using the file's `save`, `item`, `db` helpers:

```ts
it('a new item is unread', async () => {
  const { id } = await save(loadFixture('sample-news'))
  expect((await item(id)).unread).toBe(true)
})

it('markItemRead clears it without touching updatedAt', async () => {
  const { id } = await save(loadFixture('sample-news'))
  const before = await item(id)
  expect(await markItemRead(id)).toBe(true)
  const after = await item(id)
  expect(after.unread).toBe(false)
  expect(after.updatedAt.isEqual(before.updatedAt)).toBe(true)
})

it('a re-save that replaces the item makes it unread again', async () => {
  const { id } = await save(loadFixture('sample-news'))
  await markItemRead(id)
  const res = await save({ ...loadFixture('sample-news'), summary: 'Updated summary' })
  expect(res.status).toBe('updated')
  expect((await item(id)).unread).toBe(true)
})

it('an unchanged re-save keeps the item read', async () => {
  const { id } = await save(loadFixture('sample-news'))
  await markItemRead(id)
  expect((await save(loadFixture('sample-news'))).status).toBe('unchanged')
  expect((await item(id)).unread).toBe(false)
})

it('markItemRead on an unknown id is false and creates nothing', async () => {
  expect(await markItemRead('i_0123456789abcdef0123')).toBe(false)
  expect((await db().collection('items').get()).size).toBe(0)
})

it('markItemRead on an old item without the field leaves it read', async () => {
  const { id } = await save(loadFixture('sample-news'))
  await db().doc(`items/${id}`).update({ unread: FieldValue.delete() })
  expect(await markItemRead(id)).toBe(true)
  expect((await item(id)).unread).not.toBe(true)
})
```

- [ ] **Step 2:** `cd backend && npm run test:db -- src/items/store.db.test.ts` → FAIL (`markItemRead` not exported; `unread` undefined).
- [ ] **Step 3:** In `saveFeedItem` add `unread: true` to the item doc. Add `markItemRead`: a transaction that reads `items/{id}`, returns `false` if missing, writes `{ unread: false }` only when `unread === true`, returns `true`. Never `set` (it must not create a doc).
- [ ] **Step 4:** Same command → PASS; then `npm test && npm run lint && npm run build` → green.
- [ ] **Step 5:** `git commit -m "feat(backend): mark items unread on save and add markItemRead"`

### Task 2: List and detail responses carry `unread`

**Files:**

- Modify: `backend/src/items/read.ts` (`FeedItemSummary`, `summaryOf`)
- Test: `backend/src/items/read.db.test.ts`

**Interfaces:**

- Consumes: `markItemRead` (Task 1).
- Produces: `FeedItemSummary.unread: boolean` (so `FeedItemDetail.unread` too), `true` only when the doc's `unread === true`.

- [ ] **Step 1: Write the failing tests** in `read.db.test.ts`:

```ts
describe('unread', () => {
  it('listItems and getItem report a new item as unread', async () => {
    const { id } = await save(loadFixture('sample-news'))
    expect((await listItems({ limit: 20 })).items[0]).toMatchObject({ id, unread: true })
    expect((await getItem(id))!.item.unread).toBe(true)
  })

  it('a read item reports unread false', async () => {
    const { id } = await save(loadFixture('sample-news'))
    await markItemRead(id)
    expect((await listItems({ limit: 20 })).items[0].unread).toBe(false)
    expect((await getItem(id))!.item.unread).toBe(false)
  })

  it('an item saved before the field existed reports unread false', async () => {
    const { id } = await save(loadFixture('sample-news'))
    await getFirestore().doc(`items/${id}`).update({ unread: FieldValue.delete() })
    expect((await listItems({ limit: 20 })).items[0].unread).toBe(false)
    expect((await getItem(id))!.item.unread).toBe(false)
  })
})
```

- [ ] **Step 2:** `npm run test:db -- src/items/read.db.test.ts` → FAIL (`unread` undefined).
- [ ] **Step 3:** Add `unread: boolean` to `FeedItemSummary`; in `summaryOf`, `unread: d.unread === true`.
- [ ] **Step 4:** Same command → PASS; `npm test && npm run lint && npm run build` → green.
- [ ] **Step 5:** `git commit -m "feat(backend): include unread in item list and detail"`

### Task 3: `POST /api/items/:id/read`

**Files:**

- Modify: `backend/src/routes/items.ts`
- Test: `backend/src/routes/items.test.ts`, `backend/src/app.test.ts`

**Interfaces:**

- Consumes: `markItemRead(id): Promise<boolean>` from `../items/store.js`.
- Produces: `POST /api/items/:id/read` → `204` empty body; `404 {"error":"Not found"}` for a malformed id (no write) or `markItemRead` → `false`; `401` without auth (from `userAuth`); `500 {"error":"Internal error"}` on a thrown error (via `guarded`).

- [ ] **Step 1: Write the failing tests.** In `items.test.ts`, mock `../items/store.js` the same way `read.js` is mocked (`markItemRead: (...a) => markItemRead(...a)`), default `markItemRead.mockResolvedValue(true)`, and add:

```ts
it('POST /:id/read marks the item read', async () => {
  const res = await request(app()).post(`/api/items/${ID}/read`)
  expect(res.status).toBe(204)
  expect(markItemRead).toHaveBeenCalledWith(ID)
})

it('POST /:id/read is 404 for an unknown item', async () => {
  markItemRead.mockResolvedValue(false)
  const res = await request(app()).post(`/api/items/${ID}/read`)
  expect(res.status).toBe(404)
  expect(res.body).toEqual({ error: 'Not found' })
})

it('POST /:id/read with an invalid id is 404 without a write', async () => {
  expect((await request(app()).post('/api/items/bad-id/read')).status).toBe(404)
  expect(markItemRead).not.toHaveBeenCalled()
})

it('GET /:id/read is not a way to mark an item read', async () => {
  await request(app()).get(`/api/items/${ID}/read`)
  expect(markItemRead).not.toHaveBeenCalled()
})
```

Extend the existing `requires userAuth` test with `expect((await request(a).post(\`/api/items/${ID}/read\`)).status).toBe(401)`and`expect(markItemRead).not.toHaveBeenCalled()`.

In `app.test.ts`, next to `CORS allows only FRONTEND_URL`, add `'CORS preflight allows POST to mark an item read'`: `request(app()).options('/api/items/i_0123456789abcdef0123/read').set('Origin', 'http://localhost:5190').set('Access-Control-Request-Method', 'POST')` → status 204 and `access-control-allow-methods` contains `POST`. This one is expected to pass already (the `cors` defaults allow POST); it pins the behaviour. If it fails, fix the `cors` options in `app.ts`, not the test.

- [ ] **Step 2:** `npm test -- src/routes/items.test.ts src/app.test.ts` → FAIL (404 for POST).
- [ ] **Step 3:** Add `router.post('/:id/read', guarded(…))` in `createItemsRouter`: `ID_PATTERN` check, then `markItemRead`, then `res.status(204).end()` or the 404 body.
- [ ] **Step 4:** Same command → PASS; `npm test && npm run lint && npm run build` → green.
- [ ] **Step 5:** `git commit -m "feat(backend): add POST /api/items/:id/read"`

### Task 4: Frontend API: `markRead`, and list fetches wait for it

**Files:**

- Modify: `frontend/src/api.ts`, `frontend/src/types.ts`
- Test: `frontend/src/api.test.ts`

**Interfaces:**

- Produces: `FeedItemSummary.unread: boolean` in `types.ts`; `api.markRead(id: string): Promise<void>` (POSTs `/api/items/${encodeURIComponent(id)}/read` with the bearer token; rejects on a non-2xx); `api.listItems` unchanged in signature but resolves only after every `markRead` started before it has settled.

- [ ] **Step 1: Write the failing tests** in `api.test.ts`:

```ts
it('markRead POSTs with the bearer token', async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 204,
    json: async () => {
      throw new Error('no body')
    },
  })
  await api.markRead('i_x')
  expect(mockFetch).toHaveBeenCalledWith(
    'http://api.test/api/items/i_x/read',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer fake-token' }),
    })
  )
})

it('markRead rejects on an error status', async () => {
  mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
  await expect(api.markRead('i_x')).rejects.toThrow()
})

it('listItems waits for a markRead still in flight', async () => {
  let finish: (v: unknown) => void = () => undefined
  mockFetch.mockImplementationOnce(
    () =>
      new Promise((r) => {
        finish = r
      })
  )
  mockFetch.mockResolvedValue(ok({ items: [], nextCursor: null }))
  const marking = api.markRead('i_x')
  const listing = api.listItems({})
  await new Promise((r) => setTimeout(r, 0))
  expect(mockFetch).toHaveBeenCalledTimes(1)
  finish({ ok: true, status: 204, json: async () => ({}) })
  await marking
  await listing
  expect(mockFetch.mock.calls[1][0]).toBe('http://api.test/api/items')
})

it('a failed markRead does not block or fail listItems', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
  mockFetch.mockResolvedValue(ok({ items: [], nextCursor: null }))
  const marking = api.markRead('i_x').catch(() => undefined)
  await expect(api.listItems({})).resolves.toEqual({ items: [], nextCursor: null })
  await marking
})
```

- [ ] **Step 2:** `cd frontend && npm test -- src/api.test.ts` → FAIL (`markRead` is not a function).
- [ ] **Step 3:** Split `request` into an authed `send(path, init?)` returning the `Response` (throws `ApiError` on `!ok`) and `request<T>` = `send` + `.json()`. Keep a module-level `Set<Promise<unknown>>` of in-flight marks; `markRead` adds its promise and removes it on settle; `listItems` does `await Promise.allSettled([...inFlight])` before its request. Add `unread: boolean` to `FeedItemSummary` and fix every test helper that builds one (`FeedPage.test.tsx` `item()` defaults `unread: false`; `ItemPage.test.tsx` `response()` defaults `unread: false`) so `npm run build` type-checks.
- [ ] **Step 4:** `npm test && npm run lint && npm run build` → green.
- [ ] **Step 5:** `git commit -m "feat(frontend): add api.markRead and order list fetches after it"`

### Task 5: Feed card shows the dot and bold title

**Files:**

- Modify: `frontend/src/components/FeedCard.tsx`
- Test: `frontend/src/pages/FeedPage.test.tsx`

**Interfaces:**

- Consumes: `FeedItemSummary.unread` (Task 4).
- Produces: in an unread card's `<h2>`, a dot `<span data-testid="unread-dot" aria-hidden="true">` (Tailwind: `inline-block size-2 rounded-full bg-primary mr-2 align-middle`, match the badge/chip colours) and `<span className="sr-only">Unread: </span>` before the title; the `<h2>` uses `font-bold` instead of `font-semibold`. Read cards render exactly as today.

- [ ] **Step 1: Write the failing tests** in `FeedPage.test.tsx`:

```ts
it('an unread item shows a dot and a bold title; a read one does not', async () => {
  listItems.mockResolvedValue({
    items: [item('i_a', { unread: true }), item('i_b')],
    nextCursor: null,
  })
  render(<FeedPage navigate={navigate} />)
  const [unread, read] = await screen.findAllByRole('link')
  expect(within(unread).getByTestId('unread-dot')).toBeInTheDocument()
  expect(unread).toHaveAccessibleName(expect.stringContaining('Unread: Title i_a'))
  expect(within(unread).getByRole('heading')).toHaveClass('font-bold')
  expect(within(read).queryByTestId('unread-dot')).toBeNull()
  expect(read).not.toHaveAccessibleName(expect.stringContaining('Unread'))
  expect(within(read).getByRole('heading')).toHaveClass('font-semibold')
})

it('after returning from an item the refetched feed shows it read', async () => {
  listItems
    .mockResolvedValueOnce({ items: [item('i_a', { unread: true })], nextCursor: null })
    .mockResolvedValueOnce({ items: [item('i_a')], nextCursor: null })
  const { unmount } = render(<FeedPage navigate={navigate} />)
  await screen.findByTestId('unread-dot')
  unmount()
  render(<FeedPage navigate={navigate} />)
  await screen.findByText('Title i_a')
  expect(screen.queryByTestId('unread-dot')).toBeNull()
})
```

In the `FeedPage pull to refresh` describe, add `'a pull shows an item Muse re-saved as unread'`: first load `[item('i_a')]`, wait for `Title i_a`, `pullDown(200)` (from `../testing/pull`), second load `[item('i_a', { unread: true })]`, then `await screen.findByTestId('unread-dot')`.

- [ ] **Step 2:** `npm test -- src/pages/FeedPage.test.tsx` → FAIL (no `unread-dot`).
- [ ] **Step 3:** Implement the card change described under Interfaces.
- [ ] **Step 4:** `npm test && npm run lint && npm run build` → green.
- [ ] **Step 5:** `git commit -m "feat(frontend): show unread items with a dot and bold title"`

### Task 6: Opening an item page marks it read

**Files:**

- Modify: `frontend/src/pages/ItemPage.tsx`
- Test: `frontend/src/pages/ItemPage.test.tsx`

**Interfaces:**

- Consumes: `api.markRead` (Task 4), `ItemResponse.item.unread`.
- Produces: an effect on `[state, id]`: when `state.status === 'ready' && state.data.item.unread`, call `api.markRead(id)` and swallow its rejection.

- [ ] **Step 1: Write the failing tests.** Change the mock to `vi.mock('../api', () => ({ api: { getItem, markRead } }))` with `markRead` hoisted and `markRead.mockResolvedValue(undefined)` in `beforeEach`. Add:

```ts
describe('ItemPage marks the item read', () => {
  it('posts the mark once an unread item has loaded', async () => {
    getItem.mockResolvedValue(response({ unread: true }))
    render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps' })
    await waitFor(() => expect(markRead).toHaveBeenCalledWith(ID))
  })

  it('does not post for an item that is already read', async () => {
    getItem.mockResolvedValue(response())
    render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps' })
    expect(markRead).not.toHaveBeenCalled()
  })

  it('does not post for a missing item or a failed load', async () => {
    getItem.mockResolvedValueOnce(null)
    const { unmount } = render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByText("This item doesn't exist.")
    unmount()
    getItem.mockRejectedValueOnce(new Error('x'))
    render(<ItemPage id={ID} navigate={navigate} />)
    await screen.findByText("Couldn't load this item.")
    expect(markRead).not.toHaveBeenCalled()
  })

  it('a failed mark leaves the page as it is', async () => {
    markRead.mockRejectedValue(new Error('offline'))
    getItem.mockResolvedValue(response({ unread: true }))
    render(<ItemPage id={ID} navigate={navigate} />)
    await waitFor(() => expect(markRead).toHaveBeenCalled())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Heat pumps')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('a pull that brings back an unread version marks it read again', async () => {
    getItem
      .mockResolvedValueOnce(response({ unread: true }))
      .mockResolvedValueOnce(response({ unread: true, title: 'Heat pumps v2' }))
    render(<ItemPage id={ID} navigate={navigate} />)
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1))
    pullDown(200)
    await screen.findByRole('heading', { level: 1, name: 'Heat pumps v2' })
    await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2))
  })
})
```

- [ ] **Step 2:** `npm test -- src/pages/ItemPage.test.tsx` → FAIL (`markRead` not called).
- [ ] **Step 3:** Add the effect described under Interfaces.
- [ ] **Step 4:** `npm test && npm run lint && npm run build` → green.
- [ ] **Step 5:** `git commit -m "feat(frontend): mark an item read when its page opens"`

### Task 7: End-to-end: seed → dot → open → back → no dot

**Files:**

- Create: `e2e/tests/unread.spec.ts`

**Interfaces:**

- Consumes: `signIn`, `routeImages` (`../fixtures/auth.js`); `fixture`, `RUN`, `saveItem` (`../fixtures/mcp.js`); the card's `data-testid="unread-dot"` and `Unread: ` accessible prefix (Task 5); the item page's `← Feed` link.

- [ ] **Step 1: Write the test:**

```ts
test('an item Muse saved is unread until its page is opened', async ({ page }) => {
  const viaLink = `Unread link ${RUN}`
  const viaBack = `Unread back ${RUN}`
  await saveItem(fixture('sample-news'), { dedupeKey: `news:unread-link-${RUN}`, title: viaLink })
  await saveItem(fixture('sample-news'), { dedupeKey: `news:unread-back-${RUN}`, title: viaBack })
  await signIn(page)
  const card = (title: string) => page.getByRole('link', { name: new RegExp(title) })

  await expect(card(viaLink).getByTestId('unread-dot')).toBeVisible()
  await card(viaLink).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(viaLink)
  await page.getByRole('link', { name: '← Feed' }).click()
  await expect(card(viaLink)).toBeVisible()
  await expect(card(viaLink).getByTestId('unread-dot')).toHaveCount(0)

  await card(viaBack).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(viaBack)
  await page.goBack()
  await expect(card(viaBack).getByTestId('unread-dot')).toHaveCount(0)

  await page.reload()
  await expect(card(viaLink)).toBeVisible()
  await expect(card(viaLink).getByTestId('unread-dot')).toHaveCount(0)
  await expect(card(viaBack).getByTestId('unread-dot')).toHaveCount(0)
})

test('Muse saving the item again makes it unread again', async ({ page }) => {
  const dedupeKey = `news:unread-resave-${RUN}`
  const title = `Unread resave ${RUN}`
  const saved = await saveItem(fixture('sample-news'), { dedupeKey, title })
  await signIn(page)
  await page.goto(new URL(saved.url).pathname)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  await page.getByRole('link', { name: '← Feed' }).click()
  await expect(
    page.getByRole('link', { name: new RegExp(title) }).getByTestId('unread-dot')
  ).toHaveCount(0)
  await saveItem(fixture('sample-news'), { dedupeKey, title: `${title} v2` })
  await page.reload()
  await expect(
    page.getByRole('link', { name: new RegExp(`${title} v2`) }).getByTestId('unread-dot')
  ).toBeVisible()
})
```

Plus `test.beforeEach(async ({ page }) => { await routeImages(page) })` as in `flow.spec.ts`. Playwright runs one worker, and these items are the newest when the feed loads, so they are on the first page.

- [ ] **Step 2: See it red.** Temporarily delete the `markRead` effect from `ItemPage.tsx`, run `cd e2e && CI=1 npm test -- tests/unread.spec.ts`. Expected: FAIL at the first `toHaveCount(0)` after going back. Restore the effect (`git checkout frontend/src/pages/ItemPage.tsx`).
- [ ] **Step 3: See it green.** Same command → PASS; then the full `CI=1 npm test` and `npm run test:servers-stopped` → all pass, nothing left listening.
- [ ] **Step 4:** `git commit -m "test(e2e): unread dot clears after opening an item"`

### Task 8: Whole-branch check

- [ ] `backend`: `npm test && npm run test:db && npm run lint && npm run format:check && npm run build`
- [ ] `frontend`: `npm test && npm run lint && npm run format:check && npm run build`
- [ ] `e2e`: `CI=1 npm test && npm run test:servers-stopped`
- [ ] `git grep -n -E "eslint-disable|@ts-ignore|@ts-expect-error|biome-ignore"` on the diff → nothing new.
- [ ] Ask the owner before pushing or opening a PR.
