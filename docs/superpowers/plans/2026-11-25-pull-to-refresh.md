# Pull-to-refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pulling down at the top of the feed or an item page fetches its data again without a reload, so items Muse saves show up in the iPhone home-screen app.

**Architecture:** The gesture rules are pure functions (`gesture.ts`). A hook (`usePullToRefresh`) applies them to `touch*` events on `window`. The hook exposes the pull distance, a `refreshing` flag and a `refresh()` trigger. `PullIndicator` draws the spinner. Each page passes its own `refresh` function: it fetches again, keeps the old content while loading, and on failure shows a Retry alert next to the old content.

**Tech Stack:** React 19.3, Tailwind v4, Vitest 5 + Testing Library (jsdom), Playwright 1.65 (Chromium, CDP touch events). Node 26.13.1 via the Volta pin.

**Spec:** `docs/superpowers/specs/2026-11-25-pull-to-refresh-design.md`

## Global Constraints

- No new dependency: `package.json` and lockfiles don't change.
- No code comments. No `eslint-disable`, `@ts-ignore`, `@ts-expect-error` or rules turned off.
- The window is the scroll container. A pull starts only when `window.scrollY <= 0` and the movement is mostly vertical and downward.
- Gesture values: threshold `64` px of indicator travel, max `96` px, resistance `0.5` (finger px × 0.5), direction slop `8` px.
- Copy:
  - Spinner: `role="status"` with `aria-label="Refreshing"`, only while refreshing.
  - Feed error: `Couldn't refresh the feed.` with a `Retry` button.
  - Item error: `Couldn't refresh this item.` with a `Retry` button.
- Feed refresh: same `type`, no `cursor`, and the result replaces the list and `nextCursor`.
- Not included: auto-refresh on visibility or focus, a desktop refresh button.
- Tools: the repo's Node through the Volta pin and npm scripts. `npx` only for binaries already in the repo's `node_modules` (`tsc`, `playwright`). No global installs.
- No secrets, project IDs, emails or real item data in code, tests or commits. e2e uses `fixtures/*.json` and the `demo-pigeon-e2e` emulator project.
- English commit messages. Don't push or open a PR until the owner approves this plan. Never merge, never comment on GitHub.

## Review Focus

1. **iOS rubber-band or native scroll competing with the pull.** On the iPhone app, pulling at the top must move only the spinner, not bounce the page. Expected: the `touchmove` listener is non-passive and calls `preventDefault()` once a pull is recognised, and `html, body` get `overscroll-behavior-y: none`. Task 2 tests that pulling moves are cancelled and that horizontal moves and moves on a scrolled page are not. Only a real device proves this, so the owner checks it after deploy (Task 6).
2. **"Load more" still loading when a refresh lands.** Its late result must not add old page-2 items to the new list. Task 3 test: `a Load more that finishes after a refresh is dropped`.
3. **A second pull, or a Retry tap, while a refresh is still running.** Expected: one request, not two. Task 2 test: `ignores pulls and refresh() while refreshing`.
4. **Gestures that start like a pull but are not one:** the finger goes back above its starting point, a second finger touches, or the system cancels the touch (`touchcancel`). Expected: no refresh. Tests in Tasks 1 and 2.
5. **The item was deleted before the refresh.** `getItem` returns `null`. Expected: the page shows `This item doesn't exist.`, not old content or an error. Task 4 test.

---

## File map

| File | Change |
|---|---|
| `frontend/src/pullToRefresh/gesture.ts` (+ `.test.ts`) | Create: pure gesture state machine |
| `frontend/src/pullToRefresh/usePullToRefresh.ts` (+ `.test.tsx`) | Create: window touch listeners, refreshing flag |
| `frontend/src/pullToRefresh/PullIndicator.tsx` | Create: spinner |
| `frontend/src/testing/pull.ts` | Create: `fireEvent` touch helpers for tests |
| `frontend/src/index.css` | Add `overscroll-behavior-y: none` on `html, body` |
| `frontend/src/pages/FeedPage.tsx` (+ test) | Add refresh |
| `frontend/src/pages/ItemPage.tsx` (+ test) | Add refresh |
| `e2e/fixtures/touch.ts` | Create: CDP swipe helper |
| `e2e/tests/pull-to-refresh.spec.ts` | Create: touch e2e tests |

---

### Task 1: Gesture logic

**Files:**
- Create: `frontend/src/pullToRefresh/gesture.ts`
- Test: `frontend/src/pullToRefresh/gesture.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const PULL_THRESHOLD = 64
  export const PULL_MAX = 96
  export const PULL_RESISTANCE = 0.5
  export const DIRECTION_SLOP = 8
  export type Point = { x: number; y: number }
  export type PullState =
    | { phase: 'idle' }
    | { phase: 'pending'; start: Point }
    | { phase: 'pulling'; start: Point; distance: number }
    | { phase: 'ignored' }
  export function startPull(point: Point, scrollY: number): PullState
  export function movePull(state: PullState, point: Point): PullState
  export function shouldRefresh(state: PullState): boolean
  ```

- [ ] **Step 0: Install the repo's dependencies in this worktree** (once for the whole plan)

Run: `npm ci` in `frontend/`, `backend/` and `e2e/`, then `npx playwright install chromium` in `e2e/`. This installs into the worktree and Playwright's browser cache only.
Expected: each exits 0, and `git status` stays clean.

- [ ] **Step 1: Write the failing tests**

```ts
const at = (x: number, y: number) => ({ x, y })
it('starting below the top is ignored', () => {
  expect(startPull(at(0, 0), 1)).toEqual({ phase: 'ignored' })
})
it('starting at the top is pending', () => {
  expect(startPull(at(0, 0), 0)).toEqual({ phase: 'pending', start: at(0, 0) })
})
it('a move inside the slop stays pending', () => {
  const s = startPull(at(0, 0), 0)
  expect(movePull(s, at(3, 7))).toBe(s)
})
it('a mostly vertical downward move pulls with resistance', () => {
  expect(movePull(startPull(at(0, 0), 0), at(10, 100))).toEqual({
    phase: 'pulling', start: at(0, 0), distance: 50,
  })
})
it('a mostly horizontal move is ignored and stays ignored', () => {
  const s = movePull(startPull(at(0, 0), 0), at(40, 20))
  expect(s).toEqual({ phase: 'ignored' })
  expect(movePull(s, at(40, 300))).toEqual({ phase: 'ignored' })
})
it('an upward move is ignored', () => {
  expect(movePull(startPull(at(0, 0), 0), at(0, -20))).toEqual({ phase: 'ignored' })
})
it('distance is capped at PULL_MAX', () => {
  expect(movePull(startPull(at(0, 0), 0), at(0, 1000))).toMatchObject({ distance: PULL_MAX })
})
it('moving back above the start brings distance to 0 and does not refresh', () => {
  const s = movePull(movePull(startPull(at(0, 0), 0), at(0, 200)), at(0, -50))
  expect(s).toMatchObject({ phase: 'pulling', distance: 0 })
  expect(shouldRefresh(s)).toBe(false)
})
it('refreshes at the threshold, not below it', () => {
  const pulled = (dy: number) => movePull(startPull(at(0, 0), 0), at(0, dy))
  expect(shouldRefresh(pulled(PULL_THRESHOLD / PULL_RESISTANCE))).toBe(true)
  expect(shouldRefresh(pulled(PULL_THRESHOLD / PULL_RESISTANCE - 2))).toBe(false)
  expect(shouldRefresh({ phase: 'idle' })).toBe(false)
})
```

- [ ] **Step 2: Run and see them fail**

Run (in `frontend/`): `npm test -- src/pullToRefresh/gesture.test.ts`
Expected: FAIL, because `./gesture` cannot be resolved.

- [ ] **Step 3: Implement `gesture.ts`**

The rules for `movePull` on `pending`, with `dx = |x − start.x|` and `dy = y − start.y`:

- If `max(dx, |dy|) < DIRECTION_SLOP`, return the same state object.
- Else if `dy <= 0 || dx >= dy`, return `ignored`.
- Else return `pulling` with `distance = min(PULL_MAX, dy * PULL_RESISTANCE)`.

On `pulling`, recompute `distance = clamp(0, PULL_MAX, dy * PULL_RESISTANCE)`. On `idle` and `ignored`, return the state unchanged.

- [ ] **Step 4: Run and see them pass** (same command). Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Add pull-to-refresh gesture logic"`

---

### Task 2: Hook, indicator, overscroll

**Files:**
- Create: `frontend/src/pullToRefresh/usePullToRefresh.ts`, `frontend/src/pullToRefresh/PullIndicator.tsx`, `frontend/src/testing/pull.ts`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/pullToRefresh/usePullToRefresh.test.tsx`

**Interfaces:**
- Consumes: everything from Task 1.
- Produces:
  ```ts
  export function usePullToRefresh(onRefresh: () => Promise<void>): {
    distance: number
    refreshing: boolean
    refresh: () => void
  }
  export function PullIndicator(props: { distance: number; refreshing: boolean }): JSX.Element | null
  export function touch(kind: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', x: number, y: number, fingers?: number): boolean
  export function pullDown(dy: number, dx?: number): void
  ```
- Contract: `onRefresh` never rejects. Pages catch their own errors.

- [ ] **Step 1: Write the test helper and the failing tests**

`testing/pull.ts`:

- `touch` fires the event on `window` with `touches` set to `fingers` copies of `{ clientX: x, clientY: y }`. It sends `touches: []` for end and cancel, and returns `fireEvent`'s result (`false` means the event was cancelled).
- `pullDown(dy, dx = 0)` calls `touch('touchStart', 100, 100)`, then `touch('touchMove', 100 + dx, 100 + dy)`, then `touch('touchEnd', 100 + dx, 100 + dy)`.

Test harness: a `Harness` component that calls the hook with a `vi.fn` and renders `<PullIndicator {...state} />` plus `<button onClick={state.refresh}>go</button>`. Use a deferred promise helper so the tests control when `onRefresh` settles. Set `window.scrollY` with `Object.defineProperty(window, 'scrollY', { value, configurable: true })`, and reset it to `0` in `afterEach`.

```tsx
it('a pull past the threshold calls onRefresh once and shows the spinner until it settles')
  // pullDown(200): onRefresh called 1 time; getByRole('status', { name: 'Refreshing' }) present;
  // resolve(): waitFor -> queryByRole('status') null
it('a short pull does nothing')
  // pullDown(100) (distance 50): onRefresh not called; queryByRole('status') null
it('the pulling move is cancelled so the page does not bounce')
  // touch('touchStart',100,100); expect(touch('touchMove',100,300)).toBe(false)
it('horizontal moves and moves on a scrolled page are not cancelled')
  // touch start, expect(touch('touchMove',300,110)).toBe(true); end
  // scrollY=200; touch start, expect(touch('touchMove',100,300)).toBe(true); end; onRefresh not called
it('a two-finger touch is ignored')
  // touch('touchStart',100,100,2); touch('touchMove',100,300,2); touch('touchEnd',...): onRefresh not called
it('touchcancel does not refresh')
  // start, move to 300, touch('touchCancel',100,300): onRefresh not called; indicator gone
it('ignores pulls and refresh() while refreshing')
  // pullDown(200); pullDown(200); click 'go': onRefresh called 1 time
it('refresh() triggers a refresh without a gesture')
  // click 'go': onRefresh called 1 time; spinner present
it('removes its listeners on unmount')
  // unmount(); pullDown(200): onRefresh not called
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -- src/pullToRefresh/usePullToRefresh.test.tsx`
Expected: FAIL, because `./usePullToRefresh` cannot be resolved.

- [ ] **Step 3: Implement the hook**

- Keep the gesture state in a `useRef<PullState>`, the in-flight lock in a `useRef<boolean>`, and `distance` and `refreshing` in `useState`.
- Add the listeners in one `useEffect` on `window`:
  - `touchstart` (passive): uses `startPull` when there is exactly one touch and nothing is in flight; otherwise `ignored`.
  - `touchmove` with `{ passive: false }`: uses `movePull`; when the result is `pulling`, calls `preventDefault()` if `cancelable` and sets `distance`.
  - `touchend`: refreshes if `shouldRefresh`.
  - `touchcancel`: no refresh.
  - Both `touchend` and `touchcancel` reset to `idle` and set distance to `0`.
- Read the latest `onRefresh` through `useEffectEvent`, so the listeners aren't re-added every render.
- `refresh()` returns early if a refresh is in flight. Otherwise it sets the lock and `refreshing`, then calls `void onRefresh().finally(...)` to clear both.

- [ ] **Step 4: Implement `PullIndicator`**

- Return `null` when `distance === 0 && !refreshing`.
- Outer element: `fixed inset-x-0 top-0 z-10 flex justify-center pointer-events-none`, with top padding `calc(env(safe-area-inset-top) + 0.5rem)` (the app uses `viewport-fit=cover`).
- Inner element: a `size-7 rounded-full border-2 border-border border-t-primary bg-background shadow-sm` circle.
  - Translated down by `refreshing ? PULL_THRESHOLD : distance` px.
  - While pulling: rotated `distance * 4` deg, opacity `min(1, distance / PULL_THRESHOLD)`, `aria-hidden`.
  - While refreshing: `animate-spin motion-reduce:animate-none`, `role="status"`, `aria-label="Refreshing"`.

- [ ] **Step 5: Add to `index.css`**: `html, body { overscroll-behavior-y: none; }`

- [ ] **Step 6: Run and see them pass**: `npm test -- src/pullToRefresh`. Expected: PASS.

- [ ] **Step 7: Commit**: `git commit -m "Add usePullToRefresh hook and spinner"`

---

### Task 3: Feed refresh

**Files:**
- Modify: `frontend/src/pages/FeedPage.tsx`
- Test: `frontend/src/pages/FeedPage.test.tsx`

**Interfaces:**
- Consumes: `usePullToRefresh`, `PullIndicator` (Task 2), `pullDown` (Task 2 helper).

- [ ] **Step 1: Write the failing tests** (add a `describe('pull to refresh')` block)

```tsx
it('refetches the first page with the same type and resets Load more')
  // listItems: once {items:[i_a], nextCursor:'c2'}, once {items:[i_b], nextCursor:'c3'},
  //            once {items:[i_new, i_a], nextCursor:'c9'}, once {items:[], nextCursor:null}
  // render type="news"; click Load more; findByText('Title i_b')
  // pullDown(200)
  // findByText('Title i_new'); expect(listItems).toHaveBeenNthCalledWith(3, { type: 'news' })
  // queryByText('Title i_b') null
  // click Load more -> expect(listItems).toHaveBeenLastCalledWith({ type: 'news', cursor: 'c9' })
it('keeps the current items on screen while refreshing')
  // second listItems call returns a pending deferred; pullDown(200)
  // getByText('Title i_a') present; queryByText('Loading…') null; getByRole('status', { name: 'Refreshing' })
  // resolve with [i_new] -> findByText('Title i_new'); waitFor status gone
it('a failed refresh keeps the items and offers Retry')
  // second call rejects; pullDown(200)
  // findByRole('alert') has text "Couldn't refresh the feed."; getByText('Title i_a') present
  // third call resolves [i_new]; click Retry -> findByText('Title i_new'); queryByRole('alert') null
it('a pull after a failed first load shows the feed')
  // first call rejects -> findByText("Couldn't load the feed."); pullDown(200) -> findByText('Title i_a')
it('a Load more that finishes after a refresh is dropped')
  // first {items:[i_a], nextCursor:'c2'}; second (Load more) = deferred d; third (refresh) {items:[i_new], nextCursor:null}
  // click Load more; pullDown(200); findByText('Title i_new'); d.resolve({items:[i_old2], nextCursor:'c3'})
  // after a microtask flush: queryByText('Title i_old2') null; queryByRole('button', { name: 'Load more' }) null
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -- src/pages/FeedPage.test.tsx`
Expected: the new tests FAIL (no refetch, `listItems` called once). The existing tests still PASS.

- [ ] **Step 3: Implement**

In `FeedPage`:

- Add `refreshFailed` state and a `generation` ref.
- `refresh(): Promise<void>`:
  - Bumps `generation`.
  - Calls `api.listItems(filterArgs(type))`.
  - On success, if this is still the latest generation: `setState({ status: 'ready', ...page })` and `setRefreshFailed(false)`.
  - On failure: `setRefreshFailed(true)`. It never rejects.
- `loadMore` saves `generation.current` before its request and drops the result if the value has changed.
- `const pull = usePullToRefresh(refresh)`. Render `<PullIndicator distance={pull.distance} refreshing={pull.refreshing} />` inside `<main>`.
- When `state.status === 'ready' && refreshFailed`, render above the list a `role="alert"` block with the copy from Global Constraints and a `Retry` button whose `onClick={pull.refresh}`. It uses the same classes as the existing error block.

- [ ] **Step 4: Run all frontend tests**: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Pull to refresh the feed"`

---

### Task 4: Item page refresh

**Files:**
- Modify: `frontend/src/pages/ItemPage.tsx`
- Test: `frontend/src/pages/ItemPage.test.tsx`

**Interfaces:**
- Consumes: the same as Task 3.

- [ ] **Step 1: Write the failing tests**

```tsx
it('a pull refetches the item and shows the new version')
  // getItem once response(), once response({ title: 'Heat pumps v2' })
  // findByText('Tree header'); pullDown(200)
  // findByRole('heading', { level: 1, name: 'Heat pumps v2' }); expect(getItem).toHaveBeenCalledTimes(2)
  // waitFor(document.title === 'Heat pumps v2 · pigeon')
it('keeps the item on screen while refreshing')
  // second call deferred; pullDown(200): heading 'Heat pumps' present; queryByText('Loading…') null; status 'Refreshing' present
it('a failed refresh keeps the item and offers Retry')
  // second rejects: findByRole('alert') has "Couldn't refresh this item."; heading 'Heat pumps' present
  // third resolves v2; click Retry -> heading 'Heat pumps v2'; alert gone
it('a refresh that finds the item deleted shows the missing message')
  // second resolves null -> findByText("This item doesn't exist.")
```

- [ ] **Step 2: Run and see them fail**

Run: `npm test -- src/pages/ItemPage.test.tsx`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement**

`refresh()`:

- Calls `getItem(id)`.
- If it returns data: `ready`. If it returns `null`: `missing`. In both cases, clear `refreshFailed`.
- On failure: set `refreshFailed`. It never rejects.

Add the hook, the indicator, and an alert shown only when `ready && refreshFailed`, placed under the back link.

- [ ] **Step 4: Run all frontend tests**: `npm test`. Expected: PASS.

- [ ] **Step 5: Commit**: `git commit -m "Pull to refresh an item"`

---

### Task 5: Touch e2e

**Files:**
- Create: `e2e/fixtures/touch.ts`, `e2e/tests/pull-to-refresh.spec.ts`

**Interfaces:**
- Produces: `export async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 10): Promise<void>`. It opens `page.context().newCDPSession(page)` and sends `Input.dispatchTouchEvent`: one `touchStart`, then `steps` × `touchMove` along the line, then `touchEnd` with `touchPoints: []`. This works in Chromium only, which is the only browser the repo installs.

Spec file setup: `test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })` and `routeImages` in `beforeEach`. A local helper `pull(page)` calls `swipe(page, { x: 195, y: 200 }, { x: 195, y: 500 })`. Mark the page with `page.evaluate((m) => { document.body.dataset.pullMarker = m }, RUN)` and assert `expect(page.locator('body')).toHaveAttribute('data-pull-marker', RUN)` to prove there was no reload.

- [ ] **Step 1: Write the failing tests**

```ts
test('pulling the feed shows an item saved after it loaded, without a reload')
  // save sample-news as `Pull first ${RUN}` (dedupeKey news:pull-a-${RUN}); signIn
  // expect link /Pull first RUN/ visible; mark body
  // save sample-news as `Pull second ${RUN}` (dedupeKey news:pull-b-${RUN})
  // expect link /Pull second RUN/ toHaveCount(0)
  // pull(page); expect link /Pull second RUN/ visible; marker still there
test('pulling an item page shows its updated version, without a reload')
  // save `Pull item ${RUN}` (dedupeKey news:pull-item-${RUN}); signIn; open its url; mark body
  // save again, same dedupeKey, title `Pull item ${RUN} v2`
  // pull(page); expect h1 toHaveText(`Pull item ${RUN} v2`); marker still there
test('a horizontal swipe on the filter row does not refresh')
  // save one item; signIn; wait for its link
  // count GET requests whose pathname is /api/items
  // box = filter nav boundingBox; swipe from (box.x+box.width-20, cy) to (box.x+20, cy)
  // then pull(page) and await page.waitForResponse(GET /api/items)
  // expect(count).toBe(1)
```

- [ ] **Step 2: Run and see them fail**

Run (in `e2e/`): `npx playwright test tests/pull-to-refresh.spec.ts`. Run this after Task 2 and before Task 3 (see "Execution order" below), so the pages don't refresh yet.
Expected: the first two tests FAIL waiting for the new title or link. The third FAILS too, because `waitForResponse` times out when the pull doesn't trigger a fetch.

- [ ] **Step 3: Run after Tasks 3–4 and see them pass**: the same command. Expected: 3 passed.

- [ ] **Step 4: Commit**: `git commit -m "Add touch e2e tests for pull to refresh"`

Execution order: Task 1 → 2 → 5 (red) → 3 → 4 → 5 (green) → 6.

---

### Task 6: Full verification, then PR (only after the owner's go-ahead)

- [ ] **Step 1: frontend**: `npm run lint && npm run format:check && npx tsc --noEmit && npm test && npm run build`. Expected: all exit 0, with no lint warnings.
- [ ] **Step 2: backend (unchanged, sanity)**: `npm run lint && npx tsc --noEmit && npm test`. Expected: exit 0.
- [ ] **Step 3: e2e**: `npx tsc --noEmit && npm test && npm run test:servers-stopped`. Expected: all specs pass, including the existing `flow.spec.ts` and `mcp-auth.spec.ts`.
- [ ] **Step 4: Check the diff**:
  - `git diff origin/main --stat` lists only the files in the File map plus the two docs.
  - `git diff origin/main -- '*package*.json'` is empty.
  - `git grep -nE '//|/\*' -- frontend/src/pullToRefresh e2e/fixtures/touch.ts` shows no comments.
- [ ] **Step 5: Push and open a PR to `main`** (English) with: why (no pull-to-refresh in the home-screen app), what changed, what's not included, tests run, and a manual check for the owner after deploy:
  - On the iPhone home-screen app, pull at the top of the feed: the spinner shows, a new item appears, and the page doesn't bounce.
  - Swiping the filter chips doesn't refresh.
  - Normal scrolling doesn't refresh.

  End the PR body with the Claude Code attribution line. Don't merge.
