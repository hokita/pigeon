# pigeon: Generative UI feed for Muse — Design

Status: draft for the owner's approval (2026-11-15). Requirements: [`docs/spec/2026-11-15-pigeon-spec.md`](../../spec/2026-11-15-pigeon-spec.md). Where this doc and the spec differ, the difference is listed under [Changes from the spec](#changes-from-the-spec).

## 1. Intent

Muse (Meta's AI assistant; it runs in Meta's cloud) already runs the owner's scheduled research: a daily news digest, product price watching, other recurring lookups. Its own interface is poor for browsing, comparing and looking back. pigeon is a personal web app that keeps what Muse collects and shows each item as a rich response, mixing text, images, tables, charts, timelines and cards the way a good ChatGPT answer does.

Items are open-ended: a news digest, a research write-up, a price drop, anything Muse collects. Each item has a free-form `type` (a short slug Muse picks), and the feed filters by it. Price history is one small, optional extension (§7.2) that any item can use by listing products; it isn't the centre of the app.

Muse picks the layout while it collects. It sends the content and a JSON component tree through one MCP tool. pigeon validates and stores both and renders the stored tree whenever the owner opens it. Viewing an item never calls an LLM.

## 2. Goals, non-goals, anti-goals

**Goals (MVP)**

- An MCP tool `save_feed_item` that Muse can call from a scheduled task to save one item of any type with its UI tree.
- Firestore storage of the item, its sources, its UI tree and its schema version, plus, when an item lists products, a price history per product built only from real observations.
- A REST API and a React app with two pages: a feed (newest first, filter by any `type` that exists, mobile first) and a detail page that renders the stored tree with assistant-ui's generative UI renderer. The detail page supports dark mode.
- The whole flow is tested locally with no Muse involved: sample JSON → MCP tool → backend → Firestore emulator → REST API → React renderer, covered by Playwright.
- Phase 4 adds the Muse connection, the prompt and the instructions, and runs after the deploy. Bearer auth was confirmed by the owlet Muse test (2026-11-15).

**Non-goals (MVP)**

- No chat UI, no LLM calls from pigeon, no regenerating UIs.
- No editing or deleting from the web app, and no `delete_feed_item` tool. Updating means saving again with the same `dedupeKey`.
- No OAuth for MCP: Muse sends a static Bearer header, verified by a real test (§4.3). Also no multi-user support, no image proxy, no full-text search.
- No price-drop alerts from pigeon. Muse still does the notifying.

**Anti-goals** (failures even if everything technically works)

- A price chart showing a number pigeon never recorded as an observation.
- A bad UI tree that blanks the page or loses the item's content.
- Running anything Muse sent as code or HTML.
- A deploy credential, the MCP token or a real email address committed to this public repo. (The project ID, backend URL and Firebase web config may be committed in workflows, as owlet and hamster do; owner, 2026-11-15.)
- A separate hand-built page layout for each content type. Layout comes from the tree.
- A fixed list of item types in code. Types come from what Muse saves.
- Shop-specific code. Price history works the same way for every shop.

## 3. Constraints

- Fixed by the spec: React + TypeScript; `@assistant-ui/generative-ui`; JSON component trees; Markdown for rich text; a remote MCP server; Muse generates the UI; the UI is stored in a database and re-rendered; no arbitrary code execution.
- Fixed by the orchestrator, reusing hokita/owlet's setup: Vite + Tailwind CSS frontend on Firebase Hosting; Node 24 (pinned **24.22.3**) Express backend on Cloud Run; Firestore through the Admin SDK, with client rules denying everything; Google sign-in restricted to `ALLOWED_EMAILS`; MCP served at `/mcp` on the same backend with its own API token (hashed compare, stored in Secret Manager, never logged, revoked by rotating the secret); GitHub Actions CI plus path-filtered deploy workflows; the Firestore emulator for local work and Playwright e2e.
- The repo is public, so no secrets, tokens, real emails or project-private data go into commits. Test values are obviously fake (`e2e@example.com`, `demo-pigeon-*` project IDs).
- Other workers use owlet's emulator ports (8081, 9099, 8090, 5174), so pigeon picks its own (§12).

## 4. What was verified

### 4.1 `@assistant-ui/generative-ui` 0.0.11

Checked against the published tarball (`npm pack`, read `src/` and `dist/*.d.ts`), the package README, the official docs page <https://www.assistant-ui.com/docs/tools/generative-ui>, and the official shadcn registry items at `https://r.assistant-ui.com/{generative-ui,generative-ui-style,elements-generative-markdown}.json`. The package was published on 2026-11-12, and `latest` is 0.0.11.

- **Rendering a stored tree outside the chat runtime is officially supported.** `renderGenerativeUI(node: unknown, library: GenerativeUILibrary, context?: { status: "streaming" | "done"; dispatch?; imageOrigins? }): ReactNode` from `@assistant-ui/generative-ui/react` (`src/renderGenerativeUI.tsx`) takes plain JSON. It doesn't need `Thread`, the runtime or the `present` tool. The `GenerativeUITree` component in the same file isn't exported from `/react`, so pigeon calls `renderGenerativeUI`.
- **Wire format.** Each node is `{ "$type": "Name", ...props, "children": Node | Node[] }`. Models may write `_type` (and `_key`, `_action`), which normalize the same way (`src/constants.ts`, `src/ir.ts`). A child can also be a plain string or number.
- **Built-in safety** (in the source): a node whose type isn't in the library renders `null`, with a `console.error` outside production. Each element sits inside its own error boundary (`ElementBoundary`), so a throwing component blanks only itself. `Citation` opens only valid `http(s)` links (`linkHref`). `Image` uses `referrerPolicy="no-referrer"` and accepts an `imageOrigins` allowlist; with none given, it allows any source.
- **No prop validation at render time.** Props go to `render` unvalidated. Each library entry carries a zod `properties` schema, but only the `present` tool path uses it. pigeon has to validate.
- **Built-in vocabulary** (`defaultGenerativeUILibrary`, 35 components, unstyled semantic HTML with `data-aui` attributes). Covering the spec's 10 required components:

  | Spec component | Official component (props) |
  | --- | --- |
  | Rich Text / Markdown | `Markdown {value}`. The default renders the source as plain text. The docs and the official `elements-generative-markdown` registry item say to override it with **react-markdown + remark-gfm**. |
  | Heading | `Header {text, size?}` |
  | Image | `Image {src, alt, size?, round?}` |
  | Table | `Table {columns?: {label, align?, format?}[], rows?: cell[][], sortable?}` |
  | Chart (line/bar) | `Chart {variant: bar\|line\|sparkline\|area, data? \| series?, stacked?, showAxis?, showLegend?, color?}`, drawn as SVG by the package itself |
  | Timeline | `Timeline {items: {time, title, detail?}[]}` |
  | Card | `Card {title?, padding?, background?, asForm?, confirm?, cancel?}` |
  | Layout | `Row {gap?, align?, justify?}`, `Col {gap?, align?}` |
  | Callout | `Alert {title?, description?, tone?: info\|success\|warning\|danger}` |
  | Citation / Link | `Citation {title, url?, source?, snippet?}` |

  Also usable: `Text`, `Caption`, `Divider`, `Fact {label, value, delta?, trend?, upIsGood?}`, `Badge`, `Steps`, `Tabs`, `Carousel`. The rest are interactive or form components, `Box`, `Diagram`, `Map` and `Icon`.
- **Styling.** The package ships no CSS. The official `generative-ui-style` registry item is a shadcn CSS block of 261 `[data-aui…]` rules plus light/dark variables (`--aui-success`, `--aui-warning`, `--aui-panel`). It reads shadcn theme tokens (`--foreground`, `--background`, `--muted`, `--muted-foreground`, `--border`, `--primary`, `--radius`, `--card`, `--chart-1…5`, …). It has no rules for the HTML inside Markdown.
- **Peers.** The `/react` entry needs `react`, `zod` ^4 and `@assistant-ui/react` ^0.15.0. The source imports `@assistant-ui/react` for types only (`ToolDefinition`, `ToolCallMessagePartProps`), but the README says to install it, so pigeon does. Current versions: `@assistant-ui/react` 0.15.36, `zod` 4.6.7, `react` 19.3.1.
- **The root entry** (`@assistant-ui/generative-ui`) is React-free but exports only the IR types and `normalizeUINode`. The zod `properties` schemas are reachable only through `defaultGenerativeUILibrary` from `/react` (the exports map blocks deep imports). `buildPresentParameters(library)` (JSON Schema for a library) is also exported only from `/react`.
- **`@assistant-ui/react-generative-ui` 0.1.10** is a re-export shim (`export * from "@assistant-ui/generative-ui/react"`). Its README says new code should depend on `@assistant-ui/generative-ui` directly. **pigeon doesn't use it.**
- **Pre-1.0.** The package went from 0.0.5 to 0.0.11 in four weeks, so pigeon pins exact versions.

**Verdict:** the package can do what the spec needs. pigeon writes three adapters of its own: a prop-validating guard, the Markdown override and the `PriceHistory` component (§8).

### 4.2 MCP TypeScript SDK

owlet's `feat/mcp-server` branch (`backend/src/mcp/server.ts`) uses `@modelcontextprotocol/server` 2.4.0, `@modelcontextprotocol/node` 2.1.2 (`toNodeHandler`) and the streamable HTTP transport in stateless mode through `createMcpHandler(factory)`. Its tests use `@modelcontextprotocol/client` 2.4.0 against an in-process Express app. As of today these are the npm `latest` versions. pigeon copies this pattern as is: a factory per request, `server.server.onerror` plus handler `onerror` logging only `err.message`, and tool errors returned as `isError: true` results.

### 4.3 Muse remote MCP: auth verified, scheduled tasks unverified

- **Verified (Meta pages exist):** the Muse Help Center has articles on connectors (<https://www.meta.com/help/artificial-intelligence/1687253048996149/>) and on reminders and scheduled tasks (<https://www.meta.com/help/artificial-intelligence/1484325780075655/>). Scheduled tasks run on a schedule. Meta's Connect recap (<https://developers.meta.com/blog/meta-connect-recap/>) says Meta AI Connectors can connect a service "through an API or MCP server". The help pages render client-side, and I couldn't read their full text with my tools.
- **Verified by a real test (2026-11-15, owlet):** the owner connected Muse to owlet's remote MCP server with an `Authorization: Bearer <token>` header, and Muse called owlet's custom tools successfully. So Muse accepts a custom remote MCP URL, sends a static Bearer header, and calls custom tools from a chat. pigeon uses the same auth (§9). No OAuth is needed.
- **Still unverified:** whether Muse **scheduled tasks** can call custom MCP tools without the owner present, and any payload, timeout or tool-count limits. pigeon's limits (§6.3) are its own; a lower Muse limit would show up in Phase 4. Before the owlet test, third-party guides disagreed on auth: bearer header ([pallyy](https://pallyy.com/docs/api/mcp/meta-muse), [crosswalk](https://crosswalk.to/agents/muse/custom-connector), [tokenrip](https://tokenrip.com/blog/meta-muse-custom-connector)), OAuth ([anythingmcp](https://anythingmcp.com/guides/clients/muse), [arcade](https://www.arcade.dev/blog/connect-meta-muse-mcp-gateway/)), and "not documented in the consumer app" ([aiagentslibrary](https://www.aiagentslibrary.com/blog/meta-muse-mcp/), [twitterapi.io](https://twitterapi.io/blog/muse-connectors)).
- **Plan:** nothing in Phases 1–3 depends on Muse. Phase 4 is no longer blocked on auth; it needs only the deployed backend (Task 22). The scheduled-task question is answered in Phase 4 itself (plan Task 25): the owner will use both chat and scheduled tasks. If scheduled tasks turn out unable to call custom tools, chat saves still work, and `docs/muse.md` records the limit.

### 4.4 Markdown and charts

- **Markdown:** `react-markdown` 10.1.0 and `remark-gfm` 4.0.1, the pair the official registry item uses. react-markdown escapes raw HTML by default because pigeon adds no `rehype-raw`. Its default `urlTransform` blocks `javascript:` and other unsafe protocols. pigeon also forces links to `target="_blank" rel="noopener noreferrer nofollow"` and sends Markdown images through the same `https` check as `Image`. `@tailwindcss/typography` 0.5.20 provides the `prose` styling, since the registry CSS doesn't style Markdown's HTML.
- **Charts:** pigeon uses the package's own SVG `Chart`, styled by the registry CSS. **No chart library.** It covers line and bar, as the spec requires. A Recharts-style dependency would duplicate an official component.

## 5. Approaches considered

**A. Render with the official vocabulary through `renderGenerativeUI`, plus a small guard and a few overrides (chosen).** The tree format is the package's own `$type`/`_type` format, and Muse writes the official component names. pigeon's library is an allowlisted subset of `defaultGenerativeUILibrary` with a react-markdown `Markdown` and one custom `PriceHistory`. A guard validates each node's props with the official zod schemas before rendering. *Trade-off:* the stored format is tied to a 0.0.x package's vocabulary. `schemaVersion` plus a migration step on read covers that (§6.4).

**B. A pigeon-specific tree format (`{type: "column", children}`, as in the spec's example) with an adapter to assistant-ui components.** This decouples storage from the package, but it means designing a second vocabulary, writing a mapping layer and documenting a format Muse has never seen. The package already gives a validated, model-oriented format with descriptions written for LLMs. *Dropped:* it's more code, and it's further from "prefer built-in components".

**C. Use the `present` tool / `JSONGenerativeUI` with a fake thread runtime to replay stored tool calls.** This would emulate the chat runtime for a non-chat page. It depends on runtime internals, and the spec says no chat UI. *Dropped.*

**Shared validation, sub-decision.** Option 1 (chosen): the backend imports `defaultGenerativeUILibrary` from `@assistant-ui/generative-ui/react` to reuse the official zod `properties` schemas, and runs `buildPresentParameters` for the guide tool. That adds `react` as a backend dependency, used only for schemas and never rendered. Option 2: mirror the schemas by hand in the backend, at the risk of drift. Task 3 of the plan checks that Option 1 loads under Node 24 and Vitest. If it doesn't, the plan falls back to Option 2, with a contract test both packages run against the shared fixtures.

## 6. JSON component tree

### 6.1 Envelope

```json
{ "schemaVersion": 1, "root": { "_type": "Col", "gap": 4, "children": [ ... ] } }
```

- `schemaVersion` is an integer and must be `1`. (The spec's example uses `"1.0"`; an integer is simpler to compare and migrate. The tool accepts `"1.0"` and stores it as `1`.)
- `root` is one node, any allowed type, written in the official wire format: `_type` or `$type`, props inline, `children` as a node or an array of nodes, string, number. Stored as received after normalization: `_type` is rewritten to `$type`, and unknown props are rejected rather than dropped.

### 6.2 Allowlist (schema v1)

| Type | Props (official schema, plus pigeon's tighter rules) | Children |
| --- | --- | --- |
| `Col`, `Row` | `gap 0–8`, `align`, `justify` (Row) | yes |
| `Card` | `title?`, `padding 0–8`. **Removed:** `background`, `asForm`, `confirm`, `cancel`. | yes |
| `Tabs` | `tabs` (≤ 8 labels), `label?` | one child per tab |
| `Header` | `text` (≤ 200), `size?` | no |
| `Text`, `Caption` | `value` (≤ 2,000), `size?`, `weight?`, `color?` (Text) | no |
| `Markdown` | `value` (≤ 20,000 chars) | no |
| `Image` | `src` (https URL), `alt` (required, ≤ 300), `size?`, `round?` | no |
| `Divider` | `flush?` | no |
| `Table` | `columns` (≤ 12), `rows` (≤ 200, each row exactly `columns.length` cells), `sortable?` | no |
| `Chart` | `variant: line\|bar` (`sparkline`, `area` allowed too), `data` (≤ 366 points) or `series` (≤ 5 series × ≤ 366 points), `showAxis?`, `showLegend?`, `stacked?` | no |
| `Timeline` | `items` (≤ 50) | no |
| `Steps` | `steps` (≤ 30) | no |
| `Alert` | `title?`, `description?` (≤ 2,000), `tone?` | no |
| `Citation` | `title`, `url?` (http(s)), `source?`, `snippet?` (≤ 500) | no |
| `Fact` | `label`, `value`, `delta?`, `trend?`, `upIsGood?` | no |
| `Badge` | `value` (≤ 40), `variant?` | no |
| `PriceHistory` (custom) | `product` (the `productKey` or the `url` of one entry in this item's `products`), `title?` | no |

Everything else, including `Box`, `Button`, form controls, `Diagram`, `Map`, `Icon`, `Carousel`, `ListView`, `Spacer` and any `_action`, is rejected in v1. Adding a component later means adding a row here, a library entry and a test, with the same `schemaVersion`. Changing the meaning of an existing prop bumps `schemaVersion`.

### 6.3 Limits (checked on save and again before render)

- Request body for `/mcp`: 512 KB (`express.json({ limit })`). The MCP SDK sees nothing larger.
- `ui` serialized: ≤ 200 KB. Nodes: ≤ 400. Depth: ≤ 12. Images per tree: ≤ 30.
- URLs: ≤ 2,048 chars, parsed with `new URL`, scheme `https:` for images and products and `http:` or `https:` for links. No credentials (`user:pass@`). No IP-literal or `localhost` hosts.
- Item: `title` ≤ 200, `summary` ≤ 500, `content.markdown` ≤ 20,000, `sources` 1–30, `products` ≤ 20.

### 6.4 Validation, fallback and migration

- **On save (backend, authoritative):** the item fields are validated strictly. If they're invalid, the tool returns an error and nothing is saved. Then `validateUiTree(ui)` runs. If the tree is invalid, **the item is still saved** with `ui: null` and `uiStatus: "invalid"`, and the tool result lists up to 20 issues (`path`, `message`) so Muse can fix the tree and save again with the same `dedupeKey`. The rejected tree isn't stored, so untrusted data stays out of storage and the doc stays small.
- **On render (frontend, defensive):** `guardTree(root, library)` walks the stored tree again. It applies the same limits and safe-parses each node's props with that library entry's `properties` schema. A bad node becomes a small "Couldn't show this part" notice, and the rest renders. A top-level React error boundary around the renderer catches anything left.
- **When `ui` is null or invalid**, the detail page renders `fallbackTree(item)`, built in code from the item's content: a `Header` and a `Markdown` summary, a `PriceHistory` per product, and a `Citation` per source. Content is never lost.
- **Migration:** `migrateUi(ui)` on read maps older `schemaVersion`s to the current one. v1 is the only version, so it's the identity plus a version check, and an unknown version goes to the fallback.

### 6.5 Content vs presentation

The item's `content` (Markdown summary, sources, products with observed prices) is the record. `ui` is how to show it, and it may repeat text from `content`. Because `content` is complete without `ui`, a tree can be regenerated or dropped at any time, which is what the fallback relies on. Price history values never come from `ui`. `PriceHistory` names a product, and the frontend draws its points from stored observations (§7.2).

## 7. Data model (Firestore)

### 7.1 `items/{itemId}`

| Field | Type | Notes |
| --- | --- | --- |
| `type` | string slug `[a-z][a-z0-9-]{0,31}` | Muse's choice, e.g. `news`, `research`, `price-watch`. Not an enum. |
| `title`, `summary` | string | |
| `content` | `{ markdown: string, sources: {title, url, publisher?, publishedAt?}[] }` | Muse's write-up. Labelled "Written by Muse" in the UI. |
| `products` | `{ productId, productKey?, name, url, canonicalUrl, price, listPrice?, imageUrl?, retailer?, observedAt }[]` | optional on any type; `[]` when absent. Prices are integer JPY. |
| `ui` | `{ schemaVersion: 1, root }` or `null` | |
| `uiStatus` | `"valid" \| "invalid" \| "missing"` | |
| `uiSchemaVersion` | number or `null` | |
| `dedupeKey` | string | |
| `contentHash` | string | sha256 of the normalized input, used to detect `unchanged` |
| `publishedAt` | Timestamp or `null` | from Muse |
| `createdAt`, `updatedAt` | Timestamp | server time. `createdAt` doesn't change on update. |
| `origin` | `"mcp"` | for future sources |

**itemId** = `i_` + first 20 hex chars of sha256(`dedupeKey`). **dedupeKey** is Muse's optional input (`[A-Za-z0-9:._/-]{1,200}`, e.g. `news:daily-ai:2026-11-15`). If missing, it defaults to `` `${type}:${normalizedTitle}:${jstDate(publishedAt ?? now)}` ``. Saving the same key again either updates the item (`status: "updated"`, `createdAt` kept) or, if `contentHash` matches, writes nothing (`status: "unchanged"`). The whole save runs in one Firestore transaction.

**`types/{type}`**: `{ type, count, lastItemAt }`, updated in the same transaction (count +1 on create; if an update changes an item's type, −1 on the old one and +1 on the new one; a type at 0 is deleted). The feed's filter reads this, so new types appear in the filter without code changes.

### 7.2 Price history (optional, generic)

Any item may list `products`. Nothing else in pigeon depends on them. There's no product item type, no shop-specific code, and prices are integer JPY only.

`products/{productId}`: `{ identity: "key" | "url", productKey?, canonicalUrl, name, retailer?, imageUrl?, lastPrice, lastObservedAt, firstObservedAt }`

`products/{productId}/observations/{itemId}`: `{ price, observedAt, sourceUrl, itemId, createdAt }`

- **Same product** means:
  1. the same `productKey`, when Muse sends one (`[A-Za-z0-9:._/-]{1,200}`, e.g. a shop's SKU or `jan:4901234567890`). `productId` = `p_` + first 20 hex chars of sha256(`"key:" + productKey`).
  2. otherwise the same `canonicalUrl(url)`. `productId` = `p_` + first 20 hex chars of sha256(`"url:" + canonicalUrl`).
- **`canonicalUrl` is generic and the same for every shop:**
  1. Parse with `new URL`. Require `https:` (`http:` is upgraded).
  2. Lowercase the host, drop a leading `www.`, the default port and the fragment.
  3. Drop tracking-only parameters (case-insensitive names): any `utm_*`, `fbclid`, `gclid`, `gbraid`, `wbraid`, `dclid`, `msclkid`, `yclid`, `twclid`, `ttclid`, `igshid`, `mc_cid`, `mc_eid`, `_ga`, `_gl`, `ref`, `ref_src`, `ref_url`, `referrer`, `spm`. The list lives in one exported constant.
  4. Sort the remaining parameters and drop a trailing `/` (except on the root path).
- **If identity isn't stable** (a shop puts session IDs in its URLs, or Muse changes the `productKey`), the history splits into two products. Nothing breaks: each one has fewer points, and the item still renders. The Muse prompt (Phase 4) asks for a `productKey` when the page shows a stable product code. That's the fix, not per-shop rules.
- **One observation per (product, item)**, keyed by `itemId`. Resubmitting the same item overwrites its observation instead of adding a new one, so retries never invent history. `observedAt` = the product's `observedAt` from Muse, defaulting to the server's time. Must not be in the future (5 minutes of clock skew allowed).
- **Only observations are history.** `listPrice` (a "was" price shown on the retailer page) is stored and shown as a page fact, never as a history point. The detail API computes `change` against the previous observation (`price − previous.price`, and the percentage). That number comes from pigeon's own records.
- `PriceHistory {product}` matches an entry of the same item by `productKey`, then by `url`, then by `canonicalUrl(product)`. The save validates that it matches (otherwise the tree is invalid, §6.4). The detail API returns `priceHistories: { [productId]: {observedAt, price}[] }` (newest 365, oldest first), and the component renders the official `Chart` (`variant: "line"`, `showAxis: true`) from that. A single observation shows as a `Fact`, "First observation <date>", not as a one-point line.

### 7.3 Indexes and rules

- Composite index: `items` (`type` ASC, `createdAt` DESC). Single-field indexes cover the unfiltered feed, `types` ordered by `lastItemAt` and `observations` ordered by `observedAt`.
- `firestore.rules`: deny all, copied from owlet. Only the Admin SDK in the backend touches data.

## 8. Rendering architecture (frontend)

```
DetailPage ── api.getItem(id) ──► { item, priceHistories }
   └─ <ItemRenderer item priceHistories>
        ├─ migrateUi(item.ui) ─ null? ──► fallbackTree(item)
        ├─ guardTree(root, pigeonLibrary)       [custom]
        └─ <RenderBoundary>                       [custom: React error boundary]
             <PriceHistoryContext value>          [custom]
               renderGenerativeUI(root, pigeonLibrary, { status: "done" })   [official]
```

- **Official:** `renderGenerativeUI` and `defaultGenerativeUILibrary` (for `Header`, `Text`, `Caption`, `Image`, `Divider`, `Table`, `Chart`, `Timeline`, `Steps`, `Card`, `Row`, `Col`, `Tabs`, `Alert`, `Citation`, `Fact`, `Badge`), the per-element error boundaries, unknown-type dropping, `Citation` link filtering and `Image` `no-referrer`. Styling comes from the official `generative-ui-style` registry CSS, vendored into `frontend/src/generative-ui/aui.css` with its source URL and sha256 (`e4dfc7c6…44dd` as fetched 2026-11-15) in a header comment. pigeon defines the shadcn theme tokens it reads for light and dark in `index.css`.
- **Custom:** `pigeonLibrary`, which picks the allowlisted entries and overrides `Card` to drop the removed props; `Markdown`, the official registry's react-markdown + remark-gfm component with pigeon's link and image handling plus `prose dark:prose-invert`; `PriceHistory`; `Unsupported`, the guard's placeholder; `guardTree`; `fallbackTree`; `RenderBoundary`; `migrateUi`. No `imageOrigins` allowlist, because news images come from arbitrary sites. `https` is enforced on save and again in the guard instead.
- **Why no shadcn CLI:** `npx shadcn add` needs a shadcn project setup (`components.json`, `lib/utils`, a theme rewrite of `index.css`) that pigeon doesn't otherwise use. pigeon vendors the one CSS file instead, under its MIT license. Updating means fetching the registry JSON again and regenerating the file with `scripts/vendor-aui-css.mjs` (§12).
- **Pages:** a tiny `history.pushState` router like owlet's: `/` is the feed (`?type=<slug>`), `/items/:id` is the detail page. The feed shows cards with title, summary, type badge, date and, when the item lists products, the first product's price and its change. The filter is `All` plus one chip per entry in `types` (most recent first), in a row that scrolls sideways on a phone; a `?type=` that has no entry still filters. Infinite "Load more" uses a cursor.
- **Dark mode:** `prefers-color-scheme`, with the token values switched in CSS and Tailwind's `dark:` variant on its default media strategy. No toggle in the MVP.
- **Reading layout:** one centred column (`max-w-3xl`, comfortable line height). Tables scroll sideways in their own container, images are `max-width: 100%`, and charts use the official SVG, sized to the column.

## 9. MCP server

- **Route** `/mcp` on the same Express app. Streamable HTTP, stateless, SDK versions as in owlet. `express.json({ limit: "512kb" })` is mounted for `/mcp`.
- **Auth:** `Authorization: Bearer <PIGEON_MCP_TOKEN>`, checked by `apiTokenMatcher`, copied from owlet (sha256 of both sides, then `timingSafeEqual`, minimum 43 characters, off when unset). A missing or wrong token gets `401 {"error":"Invalid token"}`. Firebase ID tokens aren't accepted on `/mcp`. The token is never logged. Auth middleware runs before body parsing, so unauthenticated bodies are never parsed. **Revocation** is rotating the Secret Manager secret and redeploying. The old value stops working on the next revision.
- **HTTPS:** Cloud Run serves only HTTPS. In production, the backend also rejects requests whose `X-Forwarded-Proto` is `http`.
- **Rate limit:** 120 tool calls per hour per instance (in-memory, owlet's limiter). Over the limit, the tool returns an error, as in owlet.
- **Tools** (small surface: one write, one read-only):

  1. `save_feed_item`, annotated `{ destructiveHint: false, idempotentHint: true }`.

     Input (zod, so the SDK publishes it as JSON Schema):

     ```ts
     {
       type: string,                  // slug [a-z][a-z0-9-]{0,31}; reuse an existing one (get_ui_guide lists them)
       title: string,                 // 1–200
       summary: string,               // 1–500, plain text, shown in the feed
       publishedAt?: string,          // ISO 8601
       dedupeKey?: string,            // see §7.1
       content: {
         markdown: string,            // 1–20,000; Muse's write-up
         sources: { title: string; url: string; publisher?: string; publishedAt?: string }[] // 1–30
       },
       products?: {                   // optional on any type, ≤ 20
         name: string; url: string; productKey?: string /* §7.2 */; price: number /* integer JPY ≥ 0 */;
         listPrice?: number; imageUrl?: string; retailer?: string; observedAt?: string
       }[],
       ui?: { schemaVersion: 1 | "1.0"; root: Record<string, unknown> } // validated in the handler (§6.4)
     }
     ```

     `ui.root` is deliberately loose in the published schema. If the SDK validated the tree, a bad tree would reject the whole call and lose valid content. The handler validates it instead.

     Output: a text result with the JSON `{ id, status: "created" | "updated" | "unchanged", uiStatus: "valid" | "invalid" | "missing", uiIssues?: {path, message}[], url }`. `url` is `${FRONTEND_URL}/items/${id}`.

     Errors (`isError: true`): `Invalid input: <field>: <message>` (zod issues, first 10), `Rate limit reached: try again in N seconds`, `Internal error`.

  2. `get_ui_guide`, annotated `{ readOnlyHint: true }`, no input. It returns the v1 guide as text: the allowed components with their descriptions (the official descriptions plus pigeon's notes), the limits, the JSON Schema for one node from `buildPresentParameters(pigeonLibrary)`, the sample trees, and the item types that already exist (from `types`, so Muse reuses `news` instead of inventing `daily-news`). Muse can read the rules when a task starts instead of carrying them all in its prompt.

- **Server `instructions`** (sent at initialize): a short paragraph telling the client to call `get_ui_guide` before building a tree, to use only real URLs, and never to put historical prices in a `Chart`.

## 10. REST API (web app)

All `/api/*` routes need a Firebase ID token for an email in `ALLOWED_EMAILS` (owlet's `authMiddleware`, unchanged). CORS is limited to `FRONTEND_URL`.

| Method and path | Response |
| --- | --- |
| `GET /health` | `{ ok: true }` (no auth) |
| `GET /api/types` | `{ types: {type, count, lastItemAt}[] }`, most recent first |
| `GET /api/items?type=<slug>&limit=20&cursor=<opaque>` | `{ items: FeedItemSummary[], nextCursor: string \| null }`, newest `createdAt` first. `limit` 1–50. |
| `GET /api/items/:id` | `{ item: FeedItemDetail, priceHistories: Record<productId, {observedAt, price}[]> }`, or `404` |

`FeedItemSummary` = `{ id, type, title, summary, createdAt, publishedAt, products?: {name, price, change?: {amount, percent}}[] }`. `FeedItemDetail` adds `content`, `ui`, `uiStatus` and the full `products`. Timestamps are ISO strings. The cursor is base64url of `{createdAt, id}`. Bad parameters get `400 {"error": "..."}`.

## 11. Security summary

| Spec requirement | How |
| --- | --- |
| No arbitrary JS/JSX | The tree is data. Components come from a fixed library map, with no eval or dynamic import (official). |
| No unrestricted HTML; sanitize Markdown | react-markdown without `rehype-raw` escapes HTML. Its default `urlTransform` is kept, and links and images go through pigeon's checks. |
| Allowlist | §6.2, enforced on save (backend) and on render (frontend guard). |
| Links and images | `http(s)` only, no credentials, no localhost or IP hosts. Images `https` only with `no-referrer`. Links open with `noopener noreferrer nofollow`. |
| Payload, depth and node limits | §6.3, checked twice. |
| Rendering workload | Node, table, chart and string caps. Tabs render one panel at a time (official). |
| Untrusted persisted data | Everything rendered goes through the guard again. Nothing is trusted because it's in storage. |
| Failures don't crash the app | Per-element boundaries (official), plus pigeon's `RenderBoundary`, plus the fallback tree. |
| Token handling | Secret Manager, hashed constant-time compare, never logged (tested), rotation revokes it. |
| Web app auth | Google sign-in plus the `ALLOWED_EMAILS` check on every API call (owlet's pattern). Firestore rules deny clients. |
| Hosting headers | `firebase.json` sets a CSP: `default-src 'self'`, `script-src 'self' https://apis.google.com`, `img-src https:`, `style-src 'self' 'unsafe-inline'` (React inline image sizing), `connect-src 'self' <backend> https://*.googleapis.com`, `frame-src https://<project>.firebaseapp.com`. Also `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff`. |

## 12. Repository layout and conventions (copied from owlet)

```
pigeon/
├── backend/      Express + MCP (Node 24.22.3, TypeScript, Vitest, supertest)
├── frontend/     React 19 + Vite + Tailwind 4 (Vitest + Testing Library)
├── e2e/          Playwright + firebase-tools (Firestore + Auth emulators)
├── fixtures/     sample-news.json, sample-research.json, sample-price-drop.json, sample-invalid-ui.json (save_feed_item inputs, shared by all tests)
├── scripts/      check-node-pins.sh (from owlet), vendor-aui-css.mjs, seed-local.mjs
├── firebase.json, .firebaserc (`demo-pigeon` until the deploy task sets the real ID), firestore.rules, firestore.indexes.json
└── .github/workflows/  ci.yml, backend.yml, frontend.yml, firestore-rules.yml
```

- Separate npm packages per directory (no workspaces), Volta `node: 24.22.3` in each `package.json`, the same script names as owlet (`dev`, `build`, `start`, `start:e2e`, `test`, `lint`, `format`, `format:check`), the same `.prettierrc` and ESLint flat configs. Exact versions everywhere (no `^`), because the package is 0.0.x and the repo is new.
- **Ports** (chosen so pigeon runs beside owlet): Auth emulator 9199, Firestore emulator 8181, emulator hub 4410, logging 4510; backend dev 8180 / e2e 8190; frontend dev 5180 / e2e 5190. Project IDs `demo-pigeon` (dev) and `demo-pigeon-e2e`.
- **Backend:** `"type": "module"`, `module`/`moduleResolution` `nodenext`. owlet is CommonJS, but the MCP SDK v2 and assistant-ui are ESM-only. The Dockerfile is owlet's with `node:24.22.3-alpine`, a non-root user and port 8080.
- **Dependency versions** (npm `latest` checked 2026-11-15): `@assistant-ui/generative-ui` 0.0.11, `@assistant-ui/react` 0.15.36, `react`/`react-dom` 19.3.1, `zod` 4.6.7, `react-markdown` 10.1.0, `remark-gfm` 4.0.1, `@tailwindcss/typography` 0.5.20, `tailwindcss`/`@tailwindcss/vite` 4.3.5, `vite` 8.3.8, `@vitejs/plugin-react` 6.3.0, `vitest` 5.1.0, `jsdom` 31.0.1, `@testing-library/react` 16.3.3, `typescript` 5.9.3 (TS 6 is fine with typescript-eslint 8.72.2 but is left for later), `typescript-eslint` 8.72.2, `eslint` 10.15.0, `prettier` 3.10.1, `express` 5.3.0, `cors` 2.8.6, `firebase-admin` 14.5.1, `firebase` 13.3.0, `@modelcontextprotocol/server` 2.4.0, `@modelcontextprotocol/node` 2.1.2, `@modelcontextprotocol/client` 2.4.0, `supertest` 7.3.2, `tsx` 4.23.15, `@playwright/test` 1.65.1, `firebase-tools` 15.36.0. These are newer majors than owlet's (Express 5, React 19, Vite 8, Vitest 5, firebase-admin 14). If one fails to install or run, drop that one package back to owlet's major and note it in the README.

## 13. Deploy (needs the owner's GCP actions)

This copies owlet and hamster (both read 2026-11-15, read-only): one GCP/Firebase project per app, region `asia-northeast1`, Workload Identity Federation for every deploy, no static keys, and secrets in Secret Manager. **The owner runs every command; the build creates nothing.** The exact commands go in the README (plan Task 22), with `<PROJECT_ID>`, `<PROJECT_NUMBER>` and `<BILLING_ACCOUNT_ID>` as placeholders.

1. **Project and billing (owner):** `gcloud projects create pigeon-<6 hex>` (the same shape as `owlet-c659da` and `hamster-52b093`), `firebase projects:addfirebase <PROJECT_ID>`, and `gcloud billing projects link <PROJECT_ID> --billing-account=<BILLING_ACCOUNT_ID>`.
2. **APIs:** `run`, `artifactregistry`, `firestore`, `secretmanager`, `iamcredentials`, `firebasehosting`, `identitytoolkit`. No Cloud Build: the image is built in Actions.
3. **Firestore:** `gcloud firestore databases create --location=asia-northeast1`.
4. **Artifact Registry:** Docker repo `pigeon` in `asia-northeast1`, with owlet's cleanup policy (keep the 2 most recent, delete the rest).
5. **Auth:** register a Firebase web app (its config is public, like owlet's). Turn on the Google sign-in provider in the console; `<PROJECT_ID>.web.app` is an authorized domain by default.
6. **Secrets:** `ALLOWED_EMAILS` (the owner's email, entered by the owner, never committed) and `pigeon-mcp-token` (`openssl rand -hex 32`). The Cloud Run runtime service account (the default compute SA) gets `roles/secretmanager.secretAccessor` on both, and `roles/datastore.user` on the project.
7. **WIF (owlet's setup):** pool `github-pool`, provider `github-provider` with the condition `assertion.repository == 'hokita/pigeon' && assertion.ref == 'refs/heads/main'`, and service account `github-actions-deploy` with `roles/run.admin`, `roles/artifactregistry.writer`, `roles/firebasehosting.admin`, `roles/serviceusage.serviceUsageViewer`, `roles/firebaserules.admin` and `roles/datastore.indexAdmin`. `roles/iam.serviceAccountUser` goes on the runtime service account only. GitHub repo secrets `WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT` (`gh secret set`).
8. **Budget:** a ¥100 alert on the billing account, scoped to the project, as owlet has.
9. **MCP token switch (owlet's pattern):** `backend.yml` adds `PIGEON_MCP_TOKEN=${PIGEON_MCP_TOKEN_SECRET}:latest` to `--set-secrets` only when the repo variable `PIGEON_MCP_TOKEN_SECRET` is set. Deploys work before the secret exists, with `/mcp` off (the matcher is off when unset, §9).

**Workflows** are owlet's four files with `owlet` → `pigeon`. As in owlet, the project ID, the Cloud Run URL and the Firebase web config are written in the workflow files (they're public by design; owlet and hamster, both public repos, do the same; the owner approved this for pigeon on 2026-11-15). Only deploy credentials (WIF values), the MCP token and the owner's email stay secret. Order, as in hamster: the deploy task starts only when the owner gives the project ID. The backend is deployed once to get its URL, then `frontend.yml` is written with the real URL. No placeholder is ever committed. Cloud Run: `pigeon-backend`, `--allow-unauthenticated` (the app's own auth is the gate), `--min-instances 0`, `--max-instances 2`. `firebase-tools@15.22.1` as in owlet.

## 14. Changes from the spec

1. **Approval gate:** the spec says to implement without stopping at a proposal. Instead, this plan stops for approval, and then the build runs straight through (orchestrator, approved by the owner).
2. **Order:** the whole flow is built and tested locally first. Muse (Phase 4) comes after the deploy. The owlet Muse test (2026-11-15) already confirmed Bearer auth; whether scheduled tasks can call custom tools is checked in Phase 4.
3. **Tree format:** the official `$type`/`_type` wire format and official component names instead of the spec's illustrative `{type: "column"}`. The spec says to design the schema around the chosen renderer.
4. `schemaVersion` is the integer `1` (`"1.0"` accepted).
5. A second, read-only tool, `get_ui_guide`.
6. **Item types are open-ended** (owner, 2026-11-15): a slug Muse picks, with the feed filter built from what exists, instead of a fixed news/product pair.
7. **Price history is a small optional extension** (owner, 2026-11-15): any item may list products, identity is a `productKey` or a generic canonical URL with no per-shop rules, and prices are JPY only.
8. **Retention:** items are kept forever. There's no deletion job (owner, 2026-11-15).

## 15. Decisions left to the builder

Tailwind class choices and visual polish within §8; error message wording beyond what §9 fixes; how feed cards look; test helper structure.

## 16. Open questions (only the owner can answer)

None open. Answered on 2026-11-15:

- **Chat vs scheduled tasks:** the owner will use both. Whether a scheduled task can call custom tools doesn't block building; Phase 4 (plan Task 25) checks it, with no owlet pre-test.
- **Shops:** any shop, with no per-shop rules (§7.2).
- **Currency:** JPY only.
- **GCP:** the owner creates the project and billing and runs the setup commands; everything else follows owlet (§13).
- **Retention:** keep items forever.
- **Public config in the repo:** yes. The project ID, backend URL and Firebase web config may be committed in workflows; deploy credentials, the MCP token and the email stay secret.
