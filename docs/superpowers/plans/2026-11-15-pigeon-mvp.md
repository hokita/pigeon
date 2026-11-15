# pigeon MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Muse saves news and price-drop items, each with a JSON component tree, through an MCP tool. pigeon stores them in Firestore and renders the stored trees with `@assistant-ui/generative-ui`. The whole flow is proven locally with the Firestore emulator and Playwright before Muse is involved.

**Architecture:** One Express backend (REST for the web app, MCP at `/mcp` for Muse) on Cloud Run, Firestore through the Admin SDK, and a React/Vite app on Firebase Hosting that calls `renderGenerativeUI` on each stored tree after a defensive guard. The layout and conventions come from hokita/owlet.

**Tech Stack:** Node 24.22.3, TypeScript 5.9.3, Express 5.3.0, `@modelcontextprotocol/server` 2.4.0 + `/node` 2.1.2, firebase-admin 14.5.1, zod 4.6.7, React 19.3.1, Vite 8.3.8, Tailwind 4.3.5, `@assistant-ui/generative-ui` 0.0.11, react-markdown 10.1.0 + remark-gfm 4.0.1, Vitest 5.1.0, Playwright 1.65.1, firebase-tools 15.36.0. Every exact version is in the design, §12.

**Spec:** `docs/superpowers/specs/2026-11-15-pigeon-design.md` (design) and `docs/spec/2026-11-15-pigeon-spec.md` (requirements). Read both before starting.

## Global Constraints

- The repo is **public**. Never commit secrets, tokens, real email addresses or project IDs. Test values: `e2e@example.com`, `dev@example.com`, `demo-pigeon`, `demo-pigeon-e2e`, MCP test token `e2e-mcp-token-` + `x` × 50.
- Never run `git push`, `gh` writes or `gcloud`/`firebase deploy` against real projects, except where a task is marked **[NEEDS ORCHESTRATOR OK]** or **[NEEDS OWNER GCP]**. Never modify `~/ghq/github.com/hokita/owlet`.
- Node pins: Volta `"node": "24.22.3"` in every `package.json`, `node:24.22.3-alpine` in both Dockerfile stages, `node-version: '24.22.3'` in every `setup-node`. `scripts/check-node-pins.sh` enforces this.
- Exact dependency versions (no `^` or `~`), as listed in design §12.
- Ports: Auth emulator 9199, Firestore emulator 8181, hub 4410, logging 4510, backend 8180 (dev) / 8190 (e2e), frontend 5180 (dev) / 5190 (e2e).
- Use red/green TDD for every code task: write the failing test, run it, implement, run it, commit.
- Prettier settings match owlet: `{ "semi": false, "singleQuote": true, "trailingComma": "es5", "printWidth": 100, "tabWidth": 2 }`.
- Never log tokens or `Authorization` headers. Log only `err.message` for MCP transport errors.
- Limits (design §6.3): `/mcp` body 512 KB, `ui` ≤ 200 KB serialized, ≤ 400 nodes, depth ≤ 12, ≤ 30 images, URL ≤ 2,048 chars, title ≤ 200, summary ≤ 500, markdown ≤ 20,000, sources 1–30, products ≤ 20.
- Copy owlet's code where the plan says so: hokita/owlet's `feat/mcp-server` branch (read-only; never modify owlet).

## Review Focus

1. **Muse retries a save** (same `dedupeKey`, or the same input with no key): there must be no second feed entry and no second price observation. Pinned in Task 6 (`saveFeedItem twice with the same input is unchanged and writes one observation`).
2. **A stored tree with a removed component or one bad prop** (e.g. `Button`, or `Chart` with a string value): the rest of the item still renders, with a small notice in place of the bad node. Pinned in Task 15 (`replaces only the bad node`) and Task 20 (e2e invalid tree).
3. **A wide table or a long unbroken URL on a 375 px iPhone viewport** must not cause sideways page scrolling. Pinned in Task 20 (`no horizontal scroll at 375px`).
4. **The same product URL with and without tracking parameters, `www.` or a trailing slash, on any shop,** must produce one history line, and a `productKey` must win over the URL. Pinned in Task 4 (canonicalUrl table, `productIdFor`) and Task 6 (`two saves of the same product with different tracking params share one product`, `productKey groups different URLs`).
5. **Markdown containing `<script>`, `<img onerror>` or a `javascript:` link** must render as inert text or a dropped link, never as live HTML. Pinned in Task 14 (`Markdown renders raw HTML as text and drops javascript: links`).

---

## Phase 0: Bootstrap

### Task 1: Initial commit on `main` **[NEEDS ORCHESTRATOR OK before push]**

**Files:**
- Create: `README.md` (one paragraph: what pigeon is, a link to the design doc), `.gitignore` (owlet's, plus `.firebase/`, `*-debug.log`, `e2e/playwright-report/`, `e2e/test-results/`), `.prettierrc`, `.prettierignore` (owlet's), `LICENSE` (MIT, holder "hokita")

- [ ] **Step 1:** On `main` (no commits yet), stage only the files above. Run `git diff --cached --stat`. Expected: just those five files.
- [ ] **Step 2:** Scan for secrets: `git diff --cached | grep -nEi "token|secret|@gmail|apiKey"`. Expected: no output.
- [ ] **Step 3:** Commit `Initial commit`.
- [ ] **Step 4:** **Stop and ask the orchestrator** for OK to run `git push -u origin main`. Push only after the OK.
- [ ] **Step 5:** Rebase `docs/initial-design` onto `main` (`git rebase --onto main --root`, since the branches share no commit), then commit this plan on it. Branch `feat/mvp` from `main` for Tasks 2 onward. The docs PR and the MVP PR are separate, and opening them also needs the orchestrator's OK.

---

## Phase 3: MVP (local)

### Task 2: Backend skeleton and repo config

**Files:**
- Create: `backend/package.json` (`"type": "module"`, owlet's scripts with `dev`: `tsx watch --env-file=.env src/index.ts`, `start:e2e`: `tsx --env-file=.env.e2e src/index.ts`, plus `test:db`: `firebase emulators:exec --project demo-pigeon-test --only firestore "vitest run --config vitest.db.config.ts"`), `backend/tsconfig.json` (`target` ES2023, `module`/`moduleResolution` `nodenext`, `strict`, `outDir` dist, `rootDir` src, tests excluded), `backend/vitest.config.ts` (node env, excludes `**/*.db.test.ts`), `backend/vitest.db.config.ts` (includes only `**/*.db.test.ts`, `fileParallelism: false`), `backend/eslint.config.mjs` (owlet's), `backend/.env.example`, `backend/.env.e2e`, `backend/Dockerfile` (owlet's with `24.22.3`), `backend/.dockerignore`, `backend/src/app.ts`, `backend/src/index.ts`, `backend/src/config/firebase.ts` (owlet's), `firebase.json`, `.firebaserc` (`{"projects":{"default":"demo-pigeon"}}`), `firestore.rules` (owlet's deny-all, comments renamed), `firestore.indexes.json`, `scripts/check-node-pins.sh`
- Test: `backend/src/app.test.ts`

`.env.example`: `ALLOWED_EMAILS=dev@example.com`, `FIREBASE_PROJECT_ID=demo-pigeon`, `FRONTEND_URL=http://localhost:5180`, `PORT=8180`, `FIRESTORE_EMULATOR_HOST=127.0.0.1:8181`, `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9199`, `PIGEON_MCP_TOKEN=` (empty, with a comment that 43+ chars enables MCP). `.env.e2e` uses the e2e ports, `demo-pigeon-e2e`, `e2e@example.com` and the e2e token.

`firebase.json`: `emulators` `{ auth: {port: 9199}, firestore: {port: 8181}, hub: {port: 4410}, logging: {port: 4510}, ui: {enabled: false} }`, plus hosting config (Task 22 adds headers). `firestore.indexes.json`: one composite index, `items` with `type` ASC and `createdAt` DESC. (`types` ordered by `lastItemAt` uses a single-field index.) `check-node-pins.sh`: owlet's script, with the expected count of `setup-node` lines set to the number in pigeon's workflows (update it in Tasks 21 and 22) and the Volta files `backend/package.json`, `frontend/package.json`, `e2e/package.json` (counts grow as each package is created).

**Interfaces:**
- Produces: `createApp(deps?: AppDeps): express.Express` from `backend/src/app.ts`, where `AppDeps` is filled in by Task 11. For now, `createApp()` serves `GET /health`.

- [ ] **Step 1:** Install with exact versions: deps `express@5.3.0 cors@2.8.6 firebase-admin@14.5.1 zod@4.6.7`, devDeps `typescript@5.9.3 tsx@4.23.15 vitest@5.1.0 supertest@7.3.2 @types/supertest @types/express@5.0.6 @types/cors @types/node@24 eslint@10.15.0 @eslint/js typescript-eslint@8.72.2 prettier@3.10.1 firebase-tools@15.36.0`, all pinned exactly with `npm i -E`.
- [ ] **Step 2: Failing test** in `app.test.ts`: `it('GET /health returns ok')`, `expect(res.status).toBe(200); expect(res.body).toEqual({ ok: true })`.
- [ ] **Step 3:** Run `cd backend && npm test`. Expected: FAIL (no `createApp`).
- [ ] **Step 4:** Implement `createApp` with `cors({ origin: process.env.FRONTEND_URL || '*' })` and `/health`. `index.ts` follows owlet, with default port 8080.
- [ ] **Step 5:** Run `npm test && npm run lint && npx tsc --noEmit && npm run build`. Expected: all pass.
- [ ] **Step 6:** Commit `Add backend skeleton with health route`.

### Task 3: UI tree validator (backend), reusing the official schemas

**Files:**
- Create: `backend/src/ui/library.ts`, `backend/src/ui/validate.ts`, `backend/src/ui/limits.ts`
- Test: `backend/src/ui/validate.test.ts`, `backend/src/ui/library.test.ts`

**Interfaces:**
- Consumes: `defaultGenerativeUILibrary`, `buildPresentParameters` from `@assistant-ui/generative-ui/react`.
- Produces:
  - `UI_LIMITS = { maxBytes: 200_000, maxNodes: 400, maxDepth: 12, maxImages: 30, maxUrlLength: 2048 } as const` (limits.ts)
  - `ALLOWED_TYPES: readonly string[]`, the 19 names in design §6.2, `PriceHistory` included (library.ts)
  - `propSchemas: Record<string, z.ZodType>`. For official types, the official `properties` schema, `.strict()`, with pigeon's tighter rules from §6.2 applied through `.superRefine` (string lengths, array caps, the `Table` row/column match, URL checks via Task 4's `checkLinkUrl`/`checkImageUrl`). `Card` uses `z.strictObject({ title, padding })` copied from the official shape. `PriceHistory` is `z.strictObject({ product: z.string().min(1).max(2048), title: z.string().max(200).optional() })`. `product` is the `productKey` or `url` of an entry in the item's `products`; Task 5 checks the match, because the tree alone can't.
  - `validateUiTree(input: unknown): { ok: true; ui: StoredUi } | { ok: false; issues: UiIssue[] }`, where `StoredUi = { schemaVersion: 1; root: UiNode }`, `UiIssue = { path: string; message: string }` (path like `root.children[2].rows`), and `UiNode = { $type: string; [prop: string]: unknown; children?: UiNode | UiNode[] | string | number }`. Normalizes `_type` to `$type`, accepts `schemaVersion` `1` or `"1.0"`, and caps issues at 20.
  - `uiGuideSchema(): JSONSchema7`, which is `buildPresentParameters` on the allowlisted library.
- **Spike first (Step 1):** check that `import { defaultGenerativeUILibrary } from '@assistant-ui/generative-ui/react'` loads in Vitest (node env) and in `tsx` under Node 24.22.3. **If it doesn't load**, mirror the official schemas by hand in `library.ts` (copied from the 0.0.11 `src/vocabulary/definitions/*.ts`, with a header comment saying so), drop `uiGuideSchema` to a hand-written JSON Schema, and note the fallback in the commit message. Every test below stays the same either way.

- [ ] **Step 1: Spike.** `npm i -E @assistant-ui/generative-ui@0.0.11 @assistant-ui/react@0.15.36 react@19.3.1` in backend. Write `library.test.ts` with `it('loads the official vocabulary under node')`: `expect(Object.keys(defaultGenerativeUILibrary)).toEqual(expect.arrayContaining(['Markdown','Chart','Timeline','Citation','Card','Row','Col','Alert','Table','Image','Header']))`. Run it, then run `npx tsx -e "import('@assistant-ui/generative-ui/react').then(m=>console.log(Object.keys(m.defaultGenerativeUILibrary).length))"`. Expected: `35`. Record the outcome.
- [ ] **Step 2: Failing tests** in `validate.test.ts`, one `it` each:
  - `accepts the news, research and price-drop fixture ui`: `validateUiTree(fixture.ui).ok === true`. Task 5 creates the fixtures. Until then, use an inline tree with Col > [Header, Markdown, Image, Table, Chart(line), Timeline, Alert, Citation, Row > [Fact, Fact], Card > Text]).
  - `normalizes _type to $type`: the output root has `$type: 'Col'` and no `_type`.
  - `accepts schemaVersion "1.0" as 1`. `rejects schemaVersion 2` with issue path `schemaVersion`.
  - `rejects an unknown component`: `{ _type: 'Button', label: 'x' }` gives an issue `{ path: 'root', message: 'Unknown component "Button"' }`.
  - `rejects Card background`: an issue at `root.background` (unrecognized key).
  - The four URL tests below start as `it.skip` with a `// enabled in Task 4` comment, because the URL checks are Task 4's. Task 4 Step 4 removes the skips.
  - `rejects a non-https image`: `Image src 'http://a.example/x.png'` gives an issue at `root.src`. Same for `javascript:alert(1)` and `https://user:pw@a.example/x.png`.
  - `rejects a javascript: citation url` at `root.url`.
  - `rejects a table row with the wrong cell count` at `root.rows[1]`.
  - `rejects more than 400 nodes` (a Col with 400 Text children = 401 nodes) with message `Too many nodes (max 400)`.
  - `rejects depth over 12` (13 nested Cols) with message `Too deep (max 12)`.
  - `rejects more than 200 KB` (a Markdown of 20,000 chars ×11 across Markdown nodes) with message `UI definition too large (max 200000 bytes)`.
  - `caps issues at 20`: 30 bad Images give `issues.length === 20`.
  - `uiGuideSchema lists exactly the allowed types`: `_type.enum` sorted equals `ALLOWED_TYPES` sorted.
- [ ] **Step 3:** Run `npm test -- src/ui`. Expected: FAIL.
- [ ] **Step 4:** Implement. Check the limits first (bytes via `Buffer.byteLength(JSON.stringify(input))`, then node count and depth in one iterative walk), then per-node type and props. Node keys other than `$type`/`_type`, `children` and the props go to the props schema, so `$key`/`_key`/`$action`/`_action` are rejected as unknown props.
- [ ] **Step 5:** Run `npm test && npm run lint && npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 6:** Commit `Validate UI trees against the v1 allowlist`.

### Task 4: URL safety and generic product identity

**Files:**
- Create: `backend/src/urls.ts`
- Test: `backend/src/urls.test.ts`

**Interfaces:**
- Produces:
  - `checkLinkUrl(value: string): string | null`, which returns an error message or `null`. Allows `http:` and `https:`, ≤ 2,048 chars, no credentials, no host that is `localhost`, an IPv4/IPv6 literal, or a name without a dot.
  - `checkImageUrl(value: string): string | null`, the same but `https:` only.
  - `TRACKING_PARAMS: readonly string[]` and `isTrackingParam(name: string): boolean` (any `utm_*`, plus the exact list in design §7.2, case-insensitive). No host-specific rules anywhere.
  - `canonicalUrl(value: string): string`, which throws `Error('Invalid product URL')` on a bad URL. Rules are in design §7.2, steps 1–4.
  - `productIdFor(p: { url: string; productKey?: string }): string`: `'p_' + sha256('key:' + productKey).slice(0, 20)` when `productKey` is set, else `'p_' + sha256('url:' + canonicalUrl(url)).slice(0, 20)`.

- [ ] **Step 1: Failing tests** (`it.each` tables):
  - `checkLinkUrl` accepts `https://example.com/a?b=1` and `http://news.example.org/x`. It rejects `javascript:alert(1)`, `data:text/html,x`, `ftp://example.com`, `https://user:pw@example.com`, `https://localhost/x`, `https://127.0.0.1/x`, `https://[::1]/x`, `https://intranet/x`, and `'https://example.com/' + 'a'.repeat(2048)`.
  - `checkImageUrl` rejects `http://example.com/a.png` and accepts `https://images.example.com/a.png`.
  - `canonicalUrl`:
    - `https://www.Example.com/item/42/?utm_source=x&b=2&a=1#reviews` becomes `https://example.com/item/42?a=1&b=2`
    - `http://example.com/item/42` becomes `https://example.com/item/42`
    - `https://shop.example.org/item?id=77&UTM_Campaign=x&_gl=1*abc&ref=top` becomes `https://shop.example.org/item?id=77` (non-tracking params like `id` are kept)
    - `https://store.example.net/p/9?ttclid=a&igshid=b&msclkid=c&color=red` becomes `https://store.example.net/p/9?color=red`
    - `https://shop.example.com/` becomes `https://shop.example.com/`
    - `https://shop.example.com:443/p?gclid=1&fbclid=2` becomes `https://shop.example.com/p`
  - `canonicalUrl('not a url')` throws `Invalid product URL`.
  - `productIdFor` returns the same id for `{url:'https://www.example.com/p/1?utm_medium=a'}` and `{url:'https://example.com/p/1/'}`, and matches `/^p_[0-9a-f]{20}$/`.
  - `productIdFor uses productKey over url`: `{url:A, productKey:'sku:1'}` and `{url:B, productKey:'sku:1'}` give the same id, and it differs from `{url:A}`.
- [ ] **Step 2:** Run `npm test -- src/urls`. Expected: FAIL.
- [ ] **Step 3:** Implement with `new URL` and `node:crypto` `createHash('sha256')`. Wire `checkLinkUrl` and `checkImageUrl` into Task 3's refinements (`Image.src`, `Citation.url`, `PriceHistory.product` is not a URL check, since it may be a key).
- [ ] **Step 4:** Remove the `it.skip`s from Task 3's URL tests, then run `npm test`. Expected: PASS, Task 3's URL tests included.
- [ ] **Step 5:** Commit `Add URL safety checks and generic product identity`.

### Task 5: Feed item input schema and sample fixtures

**Files:**
- Create: `backend/src/items/input.ts`, `fixtures/sample-news.json`, `fixtures/sample-research.json`, `fixtures/sample-price-drop.json`, `fixtures/sample-invalid-ui.json`
- Test: `backend/src/items/input.test.ts`

**Interfaces:**
- Consumes: `validateUiTree` (Task 3), `checkLinkUrl`, `checkImageUrl`, `canonicalUrl`, `productIdFor` (Task 4).
- Produces:
  - `saveFeedItemShape`, a zod raw shape (an object of zod types) exactly as in design §9, for `registerTool`'s `inputSchema: z.object(saveFeedItemShape)`. Every field has a `.describe()` in plain words for Muse.
  - `parseFeedItemInput(raw: unknown, now: Date): { ok: true; value: FeedItemInput; ui: UiResult } | { ok: false; error: string }`, where `UiResult = { status: 'valid'; ui: StoredUi } | { status: 'invalid'; issues: UiIssue[] } | { status: 'missing' }` and `error` is `Invalid input: <path>: <message>; …` (first 10 zod issues). `FeedItemInput` holds the trimmed fields plus `dedupeKey` (defaulted), `contentHash`, `publishedAt: Date | null`, and `products` (always an array, `[]` when absent) each with `canonicalUrl`, `productId`, optional `productKey` and `observedAt: Date`. `type` is a slug matching `/^[a-z][a-z0-9-]{0,31}$/`, not an enum. Prices are integers (JPY) ≥ 0; there is no `currency` field. After `validateUiTree`, every `PriceHistory.product` in the tree must equal some product's `productKey` or `url`, or canonicalize to its `canonicalUrl`; otherwise the ui becomes `invalid` with issue `PriceHistory product not found in products` at that node's path.
  - `defaultDedupeKey(type, title, publishedAt: Date | null, now: Date): string`, giving `` `${type}:${title.trim().toLowerCase().replace(/\s+/g, ' ')}:${YYYY-MM-DD in Asia/Tokyo}` ``.
  - `contentHash(input)`, the sha256 hex of a stable JSON (sorted keys) of every input field except `observedAt` defaults.

Fixtures are real-looking but fictional, with only `example.com`/`example.org`/`example.net` hosts and no real people:
- `sample-news.json`: `type: news`, `dedupeKey: "news:daily-ai:2026-11-15"`, 3 sources, Markdown of about 1,500 chars, and a `ui` of Col > [Header, Markdown, Image (`https://images.example.com/ai-chip.jpg`), Table (4 columns × 5 rows, comparing model releases), Chart (bar, 5 points), Timeline (5 items), Divider, Alert (info, title `Muse's take`)]. No Citation nodes: the page frame lists the sources (design §8).
- `sample-research.json`: `type: research`, `dedupeKey: "research:heat-pumps:2026-11-15"`, no products, 4 sources, and a `ui` of Col > [Header, Markdown, Tabs (3 tabs: Summary / Options / Sources) > [Markdown, Table, Col > Citation × 4], Steps]. It proves a type the code never names works end to end.
- `sample-price-drop.json`: `type: price-watch`, `dedupeKey: "price-watch:headphones:2026-11-15"`, 2 products (`https://www.shop.example.com/p/wh-2000?utm_source=muse` at 32,800 with `listPrice` 39,600 and `productKey: "sku:wh-2000"`, and `https://shop.example.net/item/ear-7?ref=feed` at 14,980 with no key), and a `ui` of Col > [Header, Row > [Image, Col > [Fact price, Fact listPrice with delta and trend down, Badge "Price drop"]], PriceHistory (`product: "sku:wh-2000"`), PriceHistory (`product` = product 2's url), Table (2-product comparison), Markdown, Citation × 2].
- `sample-invalid-ui.json`: a valid news item whose `ui.root` contains a `Button` and an `Image` with `src: "javascript:alert(1)"`.

- [ ] **Step 1: Failing tests:**
  - `accepts sample-news, sample-research and sample-price-drop`: `ok` true, `ui.status === 'valid'`.
  - `accepts any slug type` (`type: 'reading-list'`) and `rejects a bad type` (`'News'`, `'a b'`, `''`, 33 chars) with error containing `type`.
  - `products are optional on any type`: a `research` item with products is accepted; a `price-watch` item without products is accepted with `products: []`.
  - `PriceHistory must name a product of this item`: `product: 'sku:other'` gives `ui.status === 'invalid'` with that issue; `product` set to a tracking-param variant of a product url is accepted.
  - `keeps an invalid ui as issues, not an error`: `sample-invalid-ui` gives `ok` true, `ui.status === 'invalid'`, and `ui.issues.length >= 2`.
  - `missing ui is status missing`.
  - `rejects a negative or fractional price`, `rejects an unknown currency field` (strict object), `rejects a javascript: source url` (error contains `content.sources.0.url`).
  - `rejects observedAt more than 5 minutes in the future`.
  - `defaults dedupeKey from type, title and the Tokyo date`: `now = 2026-11-14T16:30:00Z`, no publishedAt, title `"  Daily  AI "`, gives `news:daily ai:2026-11-15`.
  - `contentHash is stable across key order` and `changes when the summary changes`.
- [ ] **Step 2:** Run `npm test -- src/items`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Then point Task 3's inline-tree tests at the fixtures.
- [ ] **Step 5:** Commit `Add save_feed_item input schema and sample fixtures`.

### Task 6: Save service (Firestore, emulator-tested)

**Files:**
- Create: `backend/src/items/store.ts`
- Test: `backend/src/items/store.db.test.ts`, run by `npm run test:db` (the Firestore emulator on 8181 through `firebase emulators:exec`, project `demo-pigeon-test`). Clear data with `DELETE http://127.0.0.1:8181/emulator/v1/projects/demo-pigeon-test/databases/(default)/documents` in `beforeEach`.

**Interfaces:**
- Consumes: `FeedItemInput`, `UiResult` (Task 5).
- Produces: `saveFeedItem(input: FeedItemInput, ui: UiResult): Promise<{ id: string; status: 'created' | 'updated' | 'unchanged' }>`, using one `runTransaction`. Document shapes follow design §7.1 and §7.2 exactly, including `types/{type}` counts in the same transaction. Inside the transaction it: reads the existing item and the observations of every product it touches (old and new); replaces the item fully; deletes this item's observations for products it no longer lists; upserts the rest; recomputes each touched product's `lastPrice`/`lastObservedAt`/`firstObservedAt` from its observations (deleting a product with none left); and stores each `products[]` entry's `change` against the observation immediately before it by `observedAt` (`percent` rounded to 1 decimal). Firestore transactions need all reads before writes, so it reads first and computes in memory. `itemIdFor(dedupeKey: string): string` = `'i_' + sha256(dedupeKey).slice(0, 20)`.

- [ ] **Step 1: Failing tests:**
  - `creates an item with ui`: status `created`. The stored doc has `uiStatus 'valid'`, `uiSchemaVersion 1`, `createdAt == updatedAt`, `origin 'mcp'`.
  - `saveFeedItem twice with the same input is unchanged and writes one observation`: the second call gives `unchanged`. `products/{pid}/observations` has size 1 and `items` has size 1.
  - `a changed summary with the same dedupeKey updates and keeps createdAt`: status `updated`, `createdAt` unchanged, `updatedAt` later.
  - `invalid ui stores the item with ui null and uiStatus invalid`.
  - `re-save replaces the item fully`: save with a valid ui and 2 sources, then the same `dedupeKey` with a new title, 1 source and an invalid ui. The doc has the new title, 1 source, `ui: null`, `uiStatus: 'invalid'`; no field of the old tree or old sources remains. Same with `ui` missing: `uiStatus: 'missing'`, `ui: null`.
  - `re-save drops observations of removed products`: save products A and B, then re-save with only A. `products/B/observations/{itemId}` is gone, and B (no observations left) is deleted. A's observation is updated to the new price.
  - `re-save recomputes product fields`: product A has observations from item 1 (day 1, 39,600) and item 2 (day 2, 32,800). Re-save item 2 without A. A's `lastPrice` is 39,600, `lastObservedAt` and `firstObservedAt` are day 1.
  - `change is stored at save time`: item 1 (day 1, 39,600), then item 2 (day 2, 32,800). Item 2's stored `products[0].change` is `{ amount: -6800, percent: -17.2 }`; item 1 has no `change`.
  - `a back-dated insert leaves older items' change alone (known limit)`: items at day 1 and day 3, then one at day 2. Day 2's `change` is against day 1; day 3's stored `change` is still against day 1.
  - `two saves of the same product with different tracking params share one product`: two items (different dedupeKeys, different days) whose product URLs differ only by `utm_*` and `www.` give one `products` doc with 2 observations, and `lastPrice` equals the later observation's price.
  - `productKey groups different URLs`: two items whose products have different URLs but the same `productKey` give one `products` doc (`identity: 'key'`) with 2 observations.
  - `unstable identity splits history without failing`: same product name, URLs differing by a non-tracking `sid=` param, no key: both saves succeed and give 2 product docs with 1 observation each.
  - `types counts`: creating a news and a research item gives `types/news.count 1` and `types/research.count 1`; re-saving unchanged doesn't change counts; updating an item from `news` to `research` gives `news` deleted and `research.count 2`.
  - `an older observation does not overwrite lastPrice`: save the observedAt day-2 item, then the day-1 item, and `lastPrice` stays at the day-2 price.
- [ ] **Step 2:** Run `npm run test:db`. Expected: FAIL. Java 21 is needed locally, and the README says so.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm run test:db`. Expected: PASS.
- [ ] **Step 5:** Commit `Save feed items, products and price observations`.

### Task 7: Read service

**Files:**
- Create: `backend/src/items/read.ts`
- Test: `backend/src/items/read.db.test.ts`

**Interfaces:**
- Consumes: `saveFeedItem` (Task 6) to seed.
- Produces:
  - `listItems(opts: { type?: string; limit: number; cursor?: string }): Promise<{ items: FeedItemSummary[]; nextCursor: string | null }>`
  - `listTypes(): Promise<{ type: string; count: number; lastItemAt: string }[]>`, most recent first.
  - `getItem(id: string): Promise<{ item: FeedItemDetail; priceHistories: Record<string, PricePoint[]> } | null>`
  - `encodeCursor({ createdAt: string; id: string }): string` and `decodeCursor(s): {…} | null` (base64url JSON)
  - Types `FeedItemSummary`, `FeedItemDetail` and `PricePoint = { observedAt: string; price: number }`, exactly as in design §10. `change` is read from the stored item (Task 6), never computed here, so `listItems` does one query and no per-item reads. `getItem` returns, per product, the observations with `observedAt <=` this item's own observation's `observedAt`, the newest 365 of those, oldest first.

- [ ] **Step 1: Failing tests:**
  - `lists newest first`: 3 items give `createdAt` descending.
  - `filters by type` (a `research` type the code never names).
  - `listTypes is most recent first`.
  - `paginates with a cursor`: limit 2 over 3 items gives 2 + 1, then `nextCursor` null.
  - `decodeCursor rejects garbage` (returns `null`).
  - `getItem returns null for an unknown id`.
  - `getItem returns price history oldest first, only this item's products`.
  - `an old item shows history as of its own observation`: items on days 1, 2 and 3 for one product. `getItem(day-2 item)` returns 2 points (days 1–2), the day-3 item returns 3.
  - `listItems returns the stored change without reading observations` (spy on the observations collection: no reads).
- [ ] **Step 2:** Run `npm run test:db`. Expected: FAIL.
- [ ] **Step 3:** Implement. The feed query is `orderBy('createdAt','desc').orderBy(FieldPath.documentId(),'desc')`, which matches the index from Task 2. If the emulator asks for another index, add it to `firestore.indexes.json`.
- [ ] **Step 4:** Run `npm run test:db`. Expected: PASS.
- [ ] **Step 5:** Commit `Read the feed, item detail and price history`.

### Task 8: Auth middleware (copied from owlet)

**Files:**
- Create: `backend/src/middleware/auth.ts`, `apiToken.ts`, `rateLimit.ts`, copied from owlet's feat/mcp-server branch. Keep only `apiTokenMatcher` and `apiTokenAuth` (pigeon has no REST token route). The warning text names `PIGEON_MCP_TOKEN`. Add `requireHttps` in `backend/src/middleware/https.ts`.
- Test: the matching `*.test.ts` files (port owlet's tests), plus `https.test.ts`.

**Interfaces:**
- Produces: `authMiddleware`, `apiTokenMatcher(configured?: string)`, `apiTokenAuth({ matches })`, `createRateLimiter({ limit, windowMs, now? })`, and `requireHttps(): RequestHandler`, which returns `403 {"error":"HTTPS required"}` when `NODE_ENV === 'production'` and `req.get('x-forwarded-proto') === 'http'`.

- [ ] **Step 1:** Copy owlet's tests and adjust the names. Add these:
  - `apiTokenAuth never logs the token`: spy on `console.*`, send a wrong `Bearer secret-value-…` and the right one, and assert that `JSON.stringify(spy.mock.calls)` doesn't contain either value.
  - `requireHttps rejects http in production`, `allows https in production`, `allows http outside production`.
- [ ] **Step 2:** Run `npm test -- src/middleware`. Expected: FAIL (the files are missing).
- [ ] **Step 3:** Copy and adapt the code.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `Add sign-in, MCP token and HTTPS middleware`.

### Task 9: REST routes

**Files:**
- Create: `backend/src/routes/items.ts`
- Test: `backend/src/routes/items.test.ts` (mocks `../items/read` and passes in an allow-all `userAuth`, as owlet does)

**Interfaces:**
- Consumes: `listItems`, `listTypes`, `getItem`, `decodeCursor` (Task 7).
- Produces: `createItemsRouter({ userAuth }: { userAuth: RequestHandler }): Router`, mounted at `/api/items`, and `createTypesRouter({ userAuth }): Router`, mounted at `/api/types` (Task 11).

- [ ] **Step 1: Failing tests:**
  - `GET / passes type, limit and cursor`, and `limit defaults to 20`.
  - `GET /?type=video passes type video` (any slug is fine), `GET /?type=Bad%20Type is 400`, `GET /?limit=0 is 400`, `GET /?limit=51 is 400`, `GET /?cursor=garbage is 400` (all `{error}`).
  - `GET /api/types returns listTypes()`.
  - `GET /:id returns the item`, and `GET /:id is 404 when missing`.
  - `GET /:id with an invalid id is 404 without a read` (id must match `/^i_[0-9a-f]{20}$/`).
  - `requires userAuth`: with a rejecting `userAuth`, the response is 401 and nothing is read.
  - `read failure is 500 Internal error`, logging the error but not request headers.
- [ ] **Step 2:** Run `npm test -- src/routes`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `Add feed, type and item REST routes`.

### Task 10: MCP server tools

**Files:**
- Create: `backend/src/mcp/server.ts`, `backend/src/mcp/guide.ts`
- Test: `backend/src/mcp/server.test.ts`, using owlet's pattern: a real `Client` + `StreamableHTTPClientTransport` against an in-process Express app, with `../items/store` mocked.

**Interfaces:**
- Consumes: `saveFeedItemShape`, `parseFeedItemInput` (Task 5), `saveFeedItem` (Task 6), `listTypes` (Task 7), `uiGuideSchema`, `ALLOWED_TYPES`, `UI_LIMITS` (Task 3), `RateLimiter` (Task 8).
- Produces:
  - `createPigeonMcpServer({ limiter, frontendUrl, now? }): McpServer`.
  - `createMcpRequestHandler({ limiter, frontendUrl }): RequestHandler`, a copy of owlet's stateless handler with error logging that records only `err.message`.
  - `uiGuideText(existingTypes: string[]): string` (guide.ts). It lists every allowed component with its description, the limits, the JSON Schema, the fixture `ui` trees, and a line `Item types already in use: <comma list>. Reuse one when it fits; otherwise pick a short lowercase slug.` It also contains these exact rule lines: `Never put past prices in a Chart; use PriceHistory with the product's productKey or url — pigeon draws it from recorded observations.` and `Prices are whole yen (JPY). Send productKey when the page shows a stable product code (SKU, JAN, model number).`
  - The guide also contains these exact lines: `Keep what the sources say and your own analysis in separate blocks. Put your analysis in an Alert titled "Muse's take".` and `You don't need Citation nodes: the page always lists content.sources.`
  - `SERVER_INSTRUCTIONS` (exact copy): `pigeon stores feed items for the owner. Call get_ui_guide once before building a ui tree. Use only URLs you actually visited. Never invent prices or past prices; use PriceHistory for price history. Save each item once with save_feed_item; saving again with the same dedupeKey updates it.`

- [ ] **Step 1: Failing tests:**
  - `lists save_feed_item and get_ui_guide with annotations`: `save_feed_item.annotations.idempotentHint === true`, `get_ui_guide.annotations.readOnlyHint === true`, and `inputSchema.properties.type` has a `pattern` and no `enum`.
  - `initialize returns the server instructions`: `client.getInstructions()` equals `SERVER_INSTRUCTIONS`.
  - `save_feed_item saves the news fixture`: the result JSON equals `{ id: 'i_…', status: 'created', uiStatus: 'valid', url: 'http://localhost:5190/items/i_…' }`, and `saveFeedItem` was called once.
  - `save_feed_item with an invalid ui saves and reports issues`: the result has `isError` falsy, `uiStatus: 'invalid'` and `uiIssues[0].path` starting with `root`.
  - `save_feed_item with invalid fields is a tool error`: `type: 'Not A Slug'` gives `isError` true, text starting with `Invalid input:`, and `saveFeedItem` not called.
  - `get_ui_guide contains every allowed component, the PriceHistory rule, the facts-vs-analysis rule and the existing types` (`listTypes` mocked to return `news`, `research`).
  - `store failure is Internal error` (`console.error` called).
  - `counts only tool calls against the limit` (from owlet, limit 3).
  - `logs requests the SDK rejects, without the request headers` (from owlet).
- [ ] **Step 2:** Run `npm test -- src/mcp`. Expected: FAIL.
- [ ] **Step 3:** Install `@modelcontextprotocol/server@2.4.0 @modelcontextprotocol/node@2.1.2` and the dev dependency `@modelcontextprotocol/client@2.4.0`, exact. Implement following owlet's `server.ts`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `Add save_feed_item and get_ui_guide MCP tools`.

### Task 11: Wire the app

**Files:**
- Modify: `backend/src/app.ts`, `backend/src/index.ts`
- Test: `backend/src/app.test.ts`

**Interfaces:**
- Produces: `createApp({ mcpToken, frontendUrl }: { mcpToken?: string; frontendUrl?: string } = {})`. `index.ts` passes `process.env.PIGEON_MCP_TOKEN` and `process.env.FRONTEND_URL`. Order: `requireHttps()`, `cors`, then `/health`, then `app.use('/api', express.json({ limit: '100kb' }))` with `/api/items` and `/api/types` behind `authMiddleware`, then `app.all('/mcp', apiTokenAuth({ matches }), express.json({ limit: '512kb' }), createMcpRequestHandler(...))`. The token check runs before the body is parsed. The rate limit is 120 calls per hour.

- [ ] **Step 1: Failing tests** (supertest, with `../items/store` and `../items/read` mocked):
  - `/mcp without a token is 401`, `/mcp with a wrong token is 401`, and `/mcp with MCP token unset is 401 even with a token-shaped header`.
  - `/mcp body over 512 KB is 413` (with a valid token).
  - `/mcp with the token reaches the SDK` (a POST without the right Accept header gets the SDK's 406, as in owlet).
  - `/api/items without sign-in is 401`.
  - `CORS allows only FRONTEND_URL`: `Origin: http://evil.example` gets no `access-control-allow-origin: http://evil.example`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test && npm run lint && npx tsc --noEmit && npm run build && npm run test:db`. Expected: all PASS.
- [ ] **Step 5:** Commit `Serve REST and MCP from one app`.

### Task 12: Frontend skeleton, sign-in and API client

**Files:**
- Create: `frontend/package.json` (`"type": "module"`, owlet's scripts, `dev` on port 5180, `dev:e2e`: `vite --mode e2e --port 5190 --strictPort`), `vite.config.ts`, `tsconfig.json` (owlet's), `eslint.config.js` (owlet's), `index.html` (title "pigeon", viewport meta, `<meta name="color-scheme" content="light dark">`), `.env.example`, `.env.e2e`, `src/main.tsx`, `src/index.css`, `src/firebase.ts` (owlet's, emulator at `http://127.0.0.1:9199`), `src/api.ts`, `src/router.ts`, `src/App.tsx`, `src/pages/LoginPage.tsx` (owlet's, title "pigeon", tagline "What Muse found for you"), `src/test-setup.ts`, `src/types.ts`
- Test: `src/api.test.ts`, `src/router.test.ts`, `src/App.test.tsx`, `src/pages/LoginPage.test.tsx`

**Interfaces:**
- Produces:
  - `src/types.ts`: `FeedItemSummary`, `FeedItemDetail`, `PricePoint`, `ItemResponse = { item: FeedItemDetail; priceHistories: Record<string, PricePoint[]> }`. These mirror the backend types from Task 7 field for field.
  - `api.listItems({ type?, cursor? }): Promise<{ items; nextCursor }>`, `api.listTypes(): Promise<{ type; count; lastItemAt }[]>`, `api.getItem(id): Promise<ItemResponse | null>` (null on 404). Owlet's `request()` adds the ID token.
  - `parseRoute(pathname: string, search: string): { page: 'feed'; type?: string } | { page: 'item'; id: string }` and `routePath(route): string`.
  - `index.css`: `@import 'tailwindcss'; @plugin '@tailwindcss/typography';`, plus the shadcn tokens the vendored CSS reads (design §4.1 lists them) under `:root`, with dark values in `@media (prefers-color-scheme: dark)`. `--chart-1…5` must stay legible on both backgrounds.

- [ ] **Step 1:** Install exact versions: `react@19.3.1 react-dom@19.3.1 firebase@13.3.0`, and dev `vite@8.3.8 @vitejs/plugin-react@6.3.0 tailwindcss@4.3.5 @tailwindcss/vite@4.3.5 @tailwindcss/typography@0.5.20 typescript@5.9.3 vitest@5.1.0 jsdom@31.0.1 @testing-library/react@16.3.3 @testing-library/jest-dom @types/react @types/react-dom eslint@10.15.0 @eslint/js typescript-eslint@8.72.2 eslint-plugin-react-hooks eslint-plugin-react-refresh globals prettier@3.10.1`.
- [ ] **Step 2: Failing tests:**
  - router: `/` gives the feed, `/?type=price-watch` gives the feed of type `price-watch`, `/?type=Bad%20Type` gives the feed with no type (slug rule from design §7.1), `/items/i_0123456789abcdef0123` gives the item route, `/items/bad` gives the feed, and `routePath` round-trips every case.
  - api: `getItem returns null on 404`, `listItems sends the bearer token and type`, `throws on 500`.
  - App: `shows LoginPage when signed out`, and `shows the feed when signed in` (mock `firebase/auth` and `./api` as owlet's App test does).
- [ ] **Step 3:** Run `cd frontend && npm test`. Expected: FAIL.
- [ ] **Step 4:** Implement. `App` switches on `parseRoute` and listens to `popstate`. Pages get `navigate(route)`. Until Task 18, the pages are placeholders.
- [ ] **Step 5:** Run `npm test && npm run lint && npx tsc --noEmit && npm run build`. Expected: PASS.
- [ ] **Step 6:** Commit `Add frontend skeleton with sign-in, routes and API client`.

### Task 13: Vendor the official generative-ui stylesheet

**Files:**
- Create: `scripts/vendor-aui-css.mjs`, `frontend/src/generative-ui/aui.css` (generated), `frontend/src/generative-ui/NOTICE.md` (MIT notice for assistant-ui, plus the source URL)
- Test: `frontend/src/generative-ui/aui.css.test.ts`

`vendor-aui-css.mjs <registry-json-path> <out-css-path>` reads a downloaded `generative-ui-style.json` (shadcn `registry:style`, with `css` an object of selector → declarations or nested at-rules, and `cssVars.light`/`cssVars.dark`). It writes plain CSS: a header comment with the source URL `https://r.assistant-ui.com/generative-ui-style.json`, the sha256 of the input file and today's date; then `cssVars.light` under `:root`, `cssVars.dark` under `@media (prefers-color-scheme: dark) { :root { … } }`, then every rule in its original order. The script never fetches. The engineer downloads the JSON into the scratchpad with `curl -sL -o …` and records its sha256 (as fetched on 2026-11-15: `e4dfc7c620653a2d2368b09200e1bcb7732fbb5c3ab9ade394fbef05ab3844dd`). If the hash differs, note the new hash in the commit message.

- [ ] **Step 1: Failing test** (`aui.css.test.ts`, reads the file with `fs`): it contains `[data-aui="chart"]`, `[data-aui="timeline"]` and `[data-aui="citation"]`, the header contains `r.assistant-ui.com/generative-ui-style.json`, and it doesn't contain `@import` or `url(`.
- [ ] **Step 2:** Run it. Expected: FAIL (no file).
- [ ] **Step 3:** Write the script, run it, and import `./generative-ui/aui.css` from `main.tsx`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Then run `npm run build`.
- [ ] **Step 5:** Commit `Vendor assistant-ui's generative UI stylesheet`.

### Task 14: pigeon component library (official components plus the Markdown override)

**Files:**
- Create: `frontend/src/generative-ui/library.tsx`, `frontend/src/generative-ui/Markdown.tsx`, `frontend/src/generative-ui/safeUrl.ts`
- Test: `frontend/src/generative-ui/library.test.tsx`, `Markdown.test.tsx`, `safeUrl.test.ts`

**Interfaces:**
- Consumes: `defaultGenerativeUILibrary`, `renderGenerativeUI`, `GenerativeUILibrary` from `@assistant-ui/generative-ui/react` (install `@assistant-ui/generative-ui@0.0.11 @assistant-ui/react@0.15.36 zod@4.6.7 react-markdown@10.1.0 remark-gfm@4.0.1`, exact).
- Produces:
  - `safeLinkUrl(v: unknown): string | undefined` and `safeImageUrl(v: unknown): string | undefined`, the same rules as backend Task 4 (`http(s)` vs `https`, no credentials, no localhost/IP/dotless hosts, ≤ 2,048 chars).
  - `pigeonLibrary: GenerativeUILibrary`, with exactly `ALLOWED_TYPES` from design §6.2 as keys. Official entries are spread from `defaultGenerativeUILibrary`. `Card` keeps the official `render` with only `title` and `padding` passed through. `Image` wraps the official render and returns the alt text in a `<span data-aui="image-blocked">` when `safeImageUrl(src)` is undefined. `PriceHistory` comes from Task 16 (until then, a placeholder that renders `null`).
  - `Markdown({ value })` renders `<div data-aui="markdown" className="prose prose-neutral dark:prose-invert max-w-none break-words">` with `ReactMarkdown remarkPlugins={[remarkGfm]}` (no rehype-raw). The `components` override is: `a` uses `safeLinkUrl`, `target="_blank"` and `rel="noopener noreferrer nofollow"`, and renders text only if unsafe. `img` uses `safeImageUrl`, `referrerPolicy="no-referrer"`, `loading="lazy"`, and renders alt text if unsafe. `table` gets a `div.overflow-x-auto` wrapper.

- [ ] **Step 1: Failing tests:**
  - `pigeonLibrary has exactly the allowed types` (sorted keys equal the list).
  - `renders official Header, Table, Chart, Timeline, Alert and Citation`: `render(<>{renderGenerativeUI(tree, pigeonLibrary)}</>)` shows `[data-aui="table"]`, `svg[data-aui="chart"]`, `[data-aui="timeline"]`, `[data-aui="alert"]` and a citation link with `rel` containing `noopener`.
  - `Card drops background` (no inline background style rendered).
  - `Image with an http src shows alt text, not an img`.
  - `Markdown renders GFM tables and lists`.
  - `Markdown renders raw HTML as text and drops javascript: links`: the input `<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1))` gives no `script` and no `img` element in the DOM, the link `x` has no `href`, and the text `<script>` is visible.
  - `Markdown http image is not loaded`.
  - The `safeUrl` table mirrors backend Task 4's cases.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `Add pigeon's generative UI library with a safe Markdown renderer`.

### Task 15: Render guard, migration and fallback tree

**Files:**
- Create: `frontend/src/generative-ui/guard.ts`, `migrate.ts`, `fallback.ts`, `Unsupported.tsx`
- Test: `guard.test.ts`, `migrate.test.ts`, `fallback.test.ts`

**Interfaces:**
- Consumes: `pigeonLibrary` (Task 14).
- Produces:
  - `UI_LIMITS`, the same values as backend Task 3.
  - `guardTree(root: unknown, library: GenerativeUILibrary): { tree: unknown; replaced: number } | null`. It returns `null` when the whole tree breaks a limit (size, nodes, depth, images), and the caller then uses the fallback. Otherwise it returns a copy where each node with an unknown type or props that fail `library[type].properties.safeParse` becomes `{ $type: 'Unsupported' }`, and `replaced` counts those nodes. `Unsupported` is registered in a render-only library extension `renderLibrary = { ...pigeonLibrary, Unsupported }`. It isn't in `pigeonLibrary`, so the backend allowlist never includes it. It renders `<p data-aui="unsupported" role="note">Couldn't show this part.</p>`.
  - `migrateUi(ui: unknown): { schemaVersion: 1; root: unknown } | null`, identity for v1 and `null` for anything else.
  - `fallbackTree(item: FeedItemDetail): unknown`, a Col with `Header(title)`, `Markdown(content.markdown)`, then for each product a `PriceHistory(product = product.productKey ?? product.url)`. No Citations: the page frame lists sources.

- [ ] **Step 1: Failing tests:**
  - `replaces only the bad node`: in a Col of [Header, `{ $type: 'Chart', variant: 'line', data: 'oops' }`, Text], only the middle node becomes Unsupported and `replaced === 1`.
  - `replaces an unknown type`: `Button` becomes Unsupported.
  - `returns null over 400 nodes` and `returns null over depth 12`.
  - `accepts both fixtures unchanged`: `replaced === 0` for both fixture `ui` trees (read from `../../../fixtures/*.json`). This is the backend–frontend contract test.
  - `migrateUi accepts 1, rejects 2 and garbage`.
  - `fallbackTree has one PriceHistory per product and no Citation`, and `fallbackTree passes guardTree with replaced 0`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `Guard stored trees and fall back to content`.

### Task 16: PriceHistory component and ItemRenderer

**Files:**
- Create: `frontend/src/generative-ui/PriceHistory.tsx`, `frontend/src/generative-ui/priceHistoryContext.ts`, `frontend/src/generative-ui/canonicalUrl.ts`, `frontend/src/components/ItemRenderer.tsx`, `frontend/src/components/RenderBoundary.tsx`
- Test: `PriceHistory.test.tsx`, `canonicalUrl.test.ts`, `ItemRenderer.test.tsx`

**Interfaces:**
- Consumes: `renderGenerativeUI`, `renderLibrary`, `guardTree`, `migrateUi`, `fallbackTree` (Task 15), and `ItemResponse` (Task 12).
- Produces:
  - `canonicalUrl(url: string): string | null`, the same generic rules and test table as backend Task 4 (no host rules). `resolveProduct(ref: string, products)` matches `ref` against `productKey`, then `url`, then `canonicalUrl`, and returns the `productId`; the component then looks up `priceHistories[productId]`.
  - `PriceHistoryContext`, a React context with `{ products: FeedItemDetail['products']; priceHistories: ItemResponse['priceHistories'] }`.
  - `PriceHistory` (library entry with the `properties` from backend Task 3 and a `render` that reads the context). With ≥ 2 points, it renders `renderGenerativeUI({ $type: 'Chart', variant: 'line', showAxis: true, data: points.map(p => ({ label: shortDate(p.observedAt), value: p.price })) }, renderLibrary)` inside a `<figure>` with a `<figcaption>`: `"<title ?? product name> · <n> observations"` (prices formatted as yen) followed by the text `Recorded by pigeon from Muse's observations.`. With 1 point, it renders a `Fact` `"First observation" / "<price> on <date>"`. With 0 points or an unmatched ref, it renders `null`.
  - `ItemRenderer({ response }: { response: ItemResponse })`: migrate, then guard; if either returns null, use `fallbackTree` and guard it. Renders `<PriceHistoryContext value><RenderBoundary>{renderGenerativeUI(tree, renderLibrary)}</RenderBoundary></PriceHistoryContext>`. `RenderBoundary` is a class error boundary whose fallback is the content Markdown, rendered with plain React (no generative UI); sources come from the page frame. When `uiStatus !== 'valid'` or the fallback was used, it shows a small note: `Showing the saved content; the layout Muse sent couldn't be used.`.

- [ ] **Step 1: Failing tests:**
  - `PriceHistory draws a line chart from recorded points, ignoring tree data`: the context has 3 points, the node has only `product`, so the result is an `svg[data-aui="chart"]` with a caption containing `3 observations`.
  - `PriceHistory matches by productKey`, and `matches a url with tracking params`.
  - `PriceHistory with one point shows First observation`, and `PriceHistory with an unknown url renders nothing`.
  - `ItemRenderer renders the news fixture` (a fixture item with `uiStatus: 'valid'` shows `[data-aui="markdown"]`, `[data-aui="table"]`, `[data-aui="timeline"]` and `svg[data-aui="chart"]`).
  - `ItemRenderer uses the fallback when ui is null`, showing the note text and one link per source.
  - `ItemRenderer survives a component that throws`: a test-only library entry that throws, injected through an optional `library` prop defaulting to `renderLibrary`, leaves the rest of the page visible and still shows the item title.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `Render items with recorded price history and safe fallbacks`.

### Task 17: Feed page

**Files:**
- Create: `frontend/src/pages/FeedPage.tsx`, `frontend/src/components/FeedCard.tsx`, `frontend/src/format.ts`
- Test: `FeedPage.test.tsx`, `format.test.ts`

**Interfaces:**
- Consumes: `api.listItems` (Task 12), `navigate(route)`.
- Produces: `FeedPage({ type, navigate })`. It has a filter row: `All` plus one button per entry from `api.listTypes()` (most recent first, label = the slug, `aria-pressed`), in a row with `overflow-x-auto` so many types scroll sideways instead of widening the page; a `type` from the URL that isn't in the list still gets a pressed button; a list of `FeedCard`s (each a `<li>` holding a `<a href="/items/:id">`, where a click calls `navigate`; showing the title, the summary in 3 lines, a type badge, the date, and, when the item has products, the first one's `name · ￥32,800` with a green `−17.2%` when `change.percent < 0`), and a `Load more` button while `nextCursor` isn't null. Empty state: `Nothing yet. Items Muse saves show up here.`. Error: `Couldn't load the feed.` with a `Retry` button. `format.ts` has `formatPrice(amount)` (`Intl.NumberFormat('ja-JP', {style:'currency', currency:'JPY'})`) and `formatDate(iso)` (Asia/Tokyo, `2026/11/15 09:00`).

- [ ] **Step 1: Failing tests:** `renders items newest first as given`, `the filter shows one button per type from listTypes`, `clicking price-watch calls listItems with that type and sets aria-pressed`, `a URL type missing from listTypes still filters`, `Load more appends the next page`, `shows the price change when an item has products`, `items without products show no price`, `empty state`, `error state with retry`, `formatPrice(32800) is ￥32,800` (use the exact string `Intl` gives in jsdom), and `formatDate uses Asia/Tokyo`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement with mobile-first Tailwind: one column `max-w-3xl mx-auto px-4`, cards with `dark:` variants, and `break-words` on titles.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit `Add the feed page`.

### Task 18: Detail page

**Files:**
- Create: `frontend/src/pages/ItemPage.tsx`
- Modify: `frontend/src/App.tsx` (route `item` to `ItemPage`)
- Test: `ItemPage.test.tsx`, plus an `App.test.tsx` case

**Interfaces:**
- Consumes: `api.getItem` (Task 12), `ItemRenderer` (Task 16).
- Produces: `ItemPage({ id, navigate })`, the fixed page frame from design §8: a back link (`← Feed`), the title as `h1`, a meta line (`Written by Muse` · type badge · date, `publishedAt` else `createdAt`), then `<article className="max-w-3xl mx-auto px-4">` with `ItemRenderer` inside (the body), then a `<footer>` with heading `Sources` listing every `content.sources` entry as title, publisher (if any) and a safe link (`rel="noopener noreferrer nofollow"`). The frame is rendered by `ItemPage`, never by the tree, so it shows for valid, invalid, missing and crashing trees alike. For a 404: `This item doesn't exist.`. For an error: `Couldn't load this item.` with `Retry`. Sets `document.title` to `<title> · pigeon`.

- [ ] **Step 1: Failing tests:** `renders the item via ItemRenderer`, `frame shows Written by Muse, the type and the date`, `date falls back to createdAt without publishedAt`, `Sources footer lists every source with title, publisher and rel noopener`, `frame and Sources show when ui is null` and `when the tree throws` (via ItemRenderer's `library` prop), `a tree without Citations still shows sources`, `404 message`, `error with retry`, and `back link navigates to the feed`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test && npm run lint && npx tsc --noEmit && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit `Add the item detail page`.

### Task 19: Local seeding through MCP and README for local dev

**Files:**
- Create: `scripts/seed-local.mjs`, run from `backend` with `npm run seed` (`node ../scripts/seed-local.mjs`). It uses `@modelcontextprotocol/client` from backend's node_modules.
- Modify: `backend/package.json` (add the `seed` script), `README.md`

`seed-local.mjs [--url http://127.0.0.1:8180/mcp]` reads `PIGEON_MCP_TOKEN` from the environment (fails with a clear message if it's unset). It connects with `StreamableHTTPClientTransport` and `Authorization: Bearer` through `requestInit.headers`, then calls `save_feed_item` for each file in `fixtures/` (`sample-news.json`, `sample-research.json`, `sample-price-drop.json` and `sample-invalid-ui.json`) and prints each result's `status`/`uiStatus`/`url` (never the token). To get real history, it then saves a copy of the price-drop fixture with `dedupeKey` `price-watch:headphones:2026-11-14`, `observedAt` one day earlier and the price at `listPrice`. This is a sample record clearly marked in the fixture data (`summary` starts with `[Sample]`), not invented history for a real product.

README "Local development" covers: Java 21 for the emulators; `firebase emulators:start --project demo-pigeon --only auth,firestore` (run from `e2e` with `npx`); backend `cp .env.example .env`, set a 64-char dev token with `openssl rand -hex 32`, `npm run dev`; frontend `npm run dev`; then `npm run seed` in backend; sign in through the emulator with `dev@example.com`.

- [ ] **Step 1:** Write the script and the README section.
- [ ] **Step 2: Manual check:** start the emulators, backend and frontend as the README says, then run `PIGEON_MCP_TOKEN=… npm run seed`. Expected output: `created valid` × 3, `created invalid`, `created valid`. Run it a second time. Expected: `unchanged` × 5. Open the URL printed for the price-drop item and check that the chart shows 2 points.
- [ ] **Step 3:** Commit `Seed local data through the MCP tool`.

### Task 20: Local end-to-end tests (Playwright)

**Files:**
- Create: `e2e/package.json` (`@playwright/test@1.65.1 firebase-tools@15.36.0 @modelcontextprotocol/client@2.4.0`, exact; owlet's scripts), `e2e/playwright.config.ts` (owlet's, with ports 9199/8190/5190, project `demo-pigeon-e2e`, and graceful SIGTERM shutdown kept), `e2e/global-setup.ts` and `e2e/fixtures/auth.ts` (owlet's with port 9199), `e2e/fixtures/mcp.ts`, `e2e/scripts/assert-servers-stopped.mjs` (owlet's with pigeon's ports, including 8181/9199/4410/4510), `e2e/tests/flow.spec.ts`, `e2e/tests/mcp-auth.spec.ts`, `e2e/assets/sample.png` (a small generated PNG)
- Test: these are the tests.

**Interfaces:**
- Produces: `saveItem(fixture: object, overrides?: object): Promise<{ id; status; uiStatus; url }>` in `e2e/fixtures/mcp.ts`, calling the real `/mcp` on 8190 with the e2e token. Each test makes its `dedupeKey` unique with a run id. Every test calls `page.route('https://images.example.com/**', r => r.fulfill({ path: 'assets/sample.png' }))` and the same for the shop image hosts, so the run stays offline.

- [ ] **Step 1: Write the tests** (flow.spec.ts):
  - `a news item saved through MCP shows in the feed and renders its tree`: save sample-news, sign in, and the feed shows the title. Click it, and the detail page shows the `h1` title, `[data-aui="markdown"] h2` or `p` text from the fixture, an `img` with `referrerpolicy="no-referrer"`, `[data-aui="table"]` with 5 body rows, `svg[data-aui="chart"]`, `[data-aui="timeline"]` with 5 items, an Alert containing `Muse's take`, the `Written by Muse` label, and a `Sources` footer with 3 links (the fixture has no Citation nodes).
  - `a price drop shows recorded history`: save the price-drop fixture with an earlier `observedAt` at 39,600 under one key, then at 32,800 under another. The second item's page shows `svg[data-aui="chart"]` and the caption `2 observations`. The feed card shows `−17.2%`.
  - `re-saving with a broken tree shows the new content, not the old tree`: save sample-news, then the same `dedupeKey` with a new title and Markdown and an invalid ui. The page shows the new title and Markdown via the fallback, and none of the old Table/Timeline.
  - `an old price item shows history as of its own date`: save price items on days 1, 2 and 3; the day-2 page caption says `2 observations`, the day-3 page `3 observations`.
  - `the type filter is built from saved types`: after saving news, research and price-watch items, the filter shows those three buttons; pressing `research` shows only the research item.
  - `a research item with no products renders` (Tabs switch panels; no price UI anywhere).
  - `an invalid tree falls back to the content`: save sample-invalid-ui. The MCP result has `uiStatus 'invalid'`, the page shows the note text, the Markdown and the sources, and there's no `img[src^="javascript"]`.
  - `no horizontal scroll at 375px`: with the viewport at 375×812, on the news and price-drop detail pages, `document.documentElement.scrollWidth <= 375`.
  - `dark mode renders`: `page.emulateMedia({ colorScheme: 'dark' })` gives a `body` background luminance below 0.2 (read through `getComputedStyle`).
  - `viewing an item makes no LLM or third-party call`: record `page.on('request')` and check that every request host is in `localhost`, `127.0.0.1`, or the routed example image hosts.
  - mcp-auth.spec.ts: `wrong token is 401`, `missing token is 401`, and `saving the same item twice is unchanged` (status `unchanged` and the feed shows the title once).
- [ ] **Step 2:** Run `cd e2e && npm ci && npx playwright install chromium && CI=1 npm test`. Expected: FAIL only where a previous task left a gap. Fix those in the owning task's files and rerun until everything passes.
- [ ] **Step 3:** Run `npm run test:servers-stopped`. Expected: `All e2e servers stopped.`
- [ ] **Step 4:** Commit `Add local end-to-end tests for the MCP-to-page flow`.

### Task 21: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`, based on owlet's: `pull_request` trigger; jobs `frontend`, `backend` (lint, `tsc --noEmit`, `npm test`, then Java 21 + `npm run test:db`), `e2e`, and `pins` (`scripts/check-node-pins.sh`). Every `setup-node` uses `node-version: '24.22.3'`.
- Modify: `scripts/check-node-pins.sh` (the expected `setup-node` count)

- [ ] **Step 1:** Run `scripts/check-node-pins.sh`. Expected: `All Node pins are 24.22.3`.
- [ ] **Step 2:** Run `npx prettier --check .` in each package, and `actionlint` if it's installed. Expected: clean.
- [ ] **Step 3:** Commit `Add CI`. CI runs for the first time when the PR is opened, which needs the orchestrator's OK.

### Task 22: Deploy setup docs, workflows and hosting headers **[Steps 4–7 NEED OWNER GCP]**

Follows owlet/hamster exactly (design §13). The owner runs every `gcloud`/`firebase`/`gh` command; the build runs none of them.

**Files:**
- Modify: `README.md`, adding "Deploy (one-time owner setup)": the exact commands for design §13 items 1–9 with placeholders `<PROJECT_ID>`, `<PROJECT_NUMBER>`, `<BILLING_ACCOUNT_ID>` (copy owlet's provisioning plan, `docs/superpowers/plans/2026-11-08-owlet-environment.md` Task 6, and its design's step 7, with `owlet` → `pigeon`; the billing account ID is never written down), then the MCP token section copied from owlet's README "One-time setup" (`pigeon-mcp-token`, `PIGEON_MCP_TOKEN_SECRET`, check with `curl` → `401` without token and a `tools/list` with it), plus rotation (`gcloud secrets versions add pigeon-mcp-token --data-file=-`, redeploy, update Muse).
- Create (Step 5, once the project ID is known): `.github/workflows/backend.yml`, `frontend.yml`, `firestore-rules.yml`, copied from owlet with `owlet` → `pigeon` and `owlet-c659da` → the real project ID, `google-github-actions/auth@v3` everywhere, `node-version: '24.22.3'`, `--set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=<id>,FRONTEND_URL=https://<id>.web.app"`, and owlet's conditional secret block with `PIGEON_MCP_TOKEN_SECRET`. Secrets `WIF_PROVIDER`/`WIF_SERVICE_ACCOUNT` only; project ID, Cloud Run URL and Firebase web config inline, as owlet does (owner-approved 2026-11-15). Never commit deploy credentials, the MCP token or the owner's email.
- Modify: `.firebaserc` (`default` → the real ID, Step 5), `firebase.json` (hosting `headers` for `**`: the CSP from design §11 with the real backend origin, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`), `scripts/check-node-pins.sh` (new count).

- [ ] **Step 1:** Write the README deploy section (placeholders only). Run `grep -rnE "@gmail|AIza|[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}" README.md`. Expected: no match (no email, key or billing account).
- [ ] **Step 2:** Add the CSP headers to `firebase.json` with `connect-src 'self' http://127.0.0.1:8180 http://127.0.0.1:8190 https://*.googleapis.com` for now. Run e2e (`CI=1 npm test` in e2e). Expected: PASS. Then `npm run build` in frontend and `npx firebase-tools@15.36.0 emulators:exec --only hosting --project demo-pigeon "curl -sI http://127.0.0.1:5010 | grep -i content-security-policy"` (hosting emulator on 5010, added to `firebase.json`). Expected: the header is present.
- [ ] **Step 3:** Commit `Document the one-time GCP setup and add hosting security headers`. This is the end of the MVP PR; no deploy workflow exists yet, so merging deploys nothing.
- [ ] **Step 4 [NEEDS OWNER]:** The owner runs README items 1–8 and gives the project ID, project number and Firebase web config. Stop until then.
- [ ] **Step 5:** On a new branch, write the three workflows and set `.firebaserc`, as in Files. The owner does hamster's first manual backend deploy (`gcloud run deploy pigeon-backend …`, the README command) to get the Cloud Run URL. Then put that URL in `frontend.yml` `VITE_API_URL` and in the CSP `connect-src`. No placeholder is committed. Run `scripts/check-node-pins.sh` and `actionlint` if installed. Expected: pass.
- [ ] **Step 6:** Commit `Add deploy workflows`. Pushing and the PR need the orchestrator's OK.
- [ ] **Step 7 [NEEDS OWNER]:** After merge, check: `curl -s <BACKEND_URL>/health` gives `{"ok":true}`, an unauthenticated `curl -s -o /dev/null -w '%{http_code}' -X POST <BACKEND_URL>/mcp` gives `401`, and the site loads and signs in. The owner then does the MCP token steps from the README.

### Task 23: README completion (spec §13 deliverables)

**Files:**
- Modify: `README.md`

Sections: architecture summary (the diagram from design §8 plus one paragraph on the MCP→Firestore→REST→render flow); major files and what each does (a table); local development (Task 19); tests (backend unit, `test:db`, frontend, e2e, pins); MCP server connection (URL `/mcp`, Bearer header, both tools, the rate limit, the limits); sample data (`npm run seed`); decisions made (design §5 and §14, short); known limitations and future work (whether Muse scheduled tasks can call custom tools, until Task 25 records it; no delete tool; product identity is a `productKey` or a generic canonical URL, so a shop with session IDs in its URLs splits history unless Muse sends a key; no image proxy; the rate limit is per instance; `@assistant-ui/generative-ui` is pre-1.0 and pinned; the vendored CSS must be regenerated by hand).

- [ ] **Step 1:** Write it. Check every command in it by running it, except the GCP ones.
- [ ] **Step 2:** Commit `Document pigeon's architecture, setup and limitations`.

---

## Phase 4: Muse integration **[needs the deployed backend from Task 22]**

Bearer auth is verified: the owlet Muse test (2026-11-15) connected Muse to a remote MCP server with `Authorization: Bearer <token>` and called custom tools successfully. Still unverified: can a Muse **scheduled task** call a custom connector's tools without the owner present? The owner will use both chat and scheduled tasks, and this doesn't block anything: Task 25 Step 3 checks it, with no owlet pre-test. If scheduled tasks can't call the tools, Phase 4 still ships and `docs/muse.md` records that only chat saves work.

### Task 24: Muse setup guide and configuration prompt

**Files:**
- Create: `docs/muse.md`

Contents:
1. Connector setup: the URL `<BACKEND_URL>/mcp` and the `Authorization: Bearer <token>` header, as in the owlet test. Ask the owner for the exact Muse menu path they used for owlet and write it down as given (no guessed menu paths).
2. A ready-to-paste **prompt** (usable in chat or as a scheduled task) for each example: a daily news digest, a research write-up and a price watch, plus a short generic template for any other kind of collection. Each prompt says: run `get_ui_guide` once; collect; write `content.markdown` as a summary in your own words with every claim linked to a source; set `sources` to the pages actually visited; pick `type` from the existing types in the guide when one fits; when listing products, use only the price seen on the page right now in whole yen with `observedAt` set to now, send `productKey` when the page shows a stable product code, and never write past prices anywhere, using `PriceHistory` instead; build a `ui` tree using only the guide's components, within the limits, keeping source facts and your own analysis in separate blocks (analysis in an Alert titled `Muse's take`; no need for Citation nodes); set `dedupeKey` as `<type>:<short-topic>:<YYYY-MM-DD>`; call `save_feed_item`; if `uiStatus` is `invalid`, fix the listed issues and save again with the same `dedupeKey` (once only); tell the owner the item URL from the result.
3. Instructions for generating UI definitions: a short version of `get_ui_guide`, with both fixture trees as examples.
4. The tool input schema, copied from `tools/list` output (generated with a one-off `client.listTools()` against local dev and pasted in, not hand-written).
5. A troubleshooting table: 401 (token), `Invalid input:` (field errors), `uiStatus invalid` (tree issues), and the rate limit.

- [ ] **Step 1:** Generate the schema dump against local dev and write `docs/muse.md`.
- [ ] **Step 2:** Add a backend test, `docs/muse.md example trees pass validateUiTree`: extract the JSON blocks tagged ```` ```json ui ```` and validate each one.
- [ ] **Step 3:** Run `npm test`. Expected: PASS. Commit `Add Muse setup guide and task prompts`.

### Task 25: Production end-to-end check with Muse **[GATED + NEEDS OWNER: manual]**

- [ ] **Step 1:** The owner adds the connector in Muse, with the token from Secret Manager pasted directly (never in chat or a commit).
- [ ] **Step 2:** The owner runs the news prompt once by hand. Check: the Muse reply contains a pigeon URL; the item shows in the feed; the detail page renders with `uiStatus` valid; Cloud Run logs for the request show no token (`gcloud logging read … | grep -c "Bearer"` gives `0`).
- [ ] **Step 3:** The owner schedules both tasks. On the next run, check that the scheduled run called `save_feed_item` at all (a new item appears, and Cloud Run logs show a `/mcp` request at the scheduled time). This is the unverified scheduled-task question. If it didn't, record that in `docs/muse.md` (chat saves still work) and tell the owner. If it did: one new item per run, no duplicates when a run retries, and for the price watch the second run adds one observation and the chart shows 2 points.
- [ ] **Step 4:** Record the results in `docs/muse.md` under a "Verified" section with the date, then commit `Record Muse end-to-end verification`.
