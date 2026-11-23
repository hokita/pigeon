# Honest Note and Layout Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The item page states truthfully why it shows the fallback and stops repeating the title, and Muse is told (by the instructions, the tool descriptions, the save result and the guide) to always send a well-shaped `ui` layout. Items without any URL (notes, Muse's own findings, summaries) are a normal case: sources may be empty, a source may have no URL, and the page shows them that way on purpose.

**Architecture:** In the frontend, `ItemRenderer` picks the note from `item.uiStatus`. `fallbackTree` drops its `Header` and runs the Markdown through a new pure helper, `stripLeadingTitle`. In the backend, the MCP server text changes and adds a `hint` field to the save result when `uiStatus` is `"missing"`. `guide.ts` gains a `digest` example and three rules, and its tests check every example against `validateUiTree` and the new shape rules. `content.sources` becomes `0–30` with an optional `url` in the input schema and the read types. The Sources footer renders only when there are sources.

**Tech Stack:** TypeScript, React 19 + Vitest + Testing Library (frontend), Express + MCP SDK + Vitest (backend), Playwright (e2e), Node 26.13.1 through Volta.

**Spec:** `docs/superpowers/specs/2026-11-23-honest-note-and-guidance-design.md`

## Global Constraints

- Exact copy:
  - Missing note: `Muse didn't send a layout for this item.`
  - Fallback note (unchanged): `Showing the saved content; the layout Muse sent couldn't be used.`
  - Hint: `No layout sent; this item shows as plain text. Call get_ui_guide and save again with a ui.`
- Muse's valid layouts are not changed or filtered. What counts as valid (`validateUiTree`, `guardTree`, `migrateUi`) is not changed.
- Copy for sources and guidance:
  - URL rule, in both the server instructions and the guide: `Use only URLs you actually visited; leave url out when there is none, and never invent one.`
  - Guide line: `Items don't need sources: your own notes, findings and summaries can have none.`
- `products[].url` stays required. A source `url`, when present, must still pass `checkLinkUrl`.
- Not included: storing `uiIssues`, soft hints, cleaning up test items, changes to `fixtures/*.json`, and anything under **Risks** below.
- No code comments. Never disable lint or type rules.
- No secrets, project IDs, backend URLs, emails or real item content in the repo or PR. Example content is invented (reuse the fictional names from the fixtures, such as Lumen-7 and Kestrel Mini).
- Never merge, never post GitHub comments, never dispatch workflows, never read or write Firestore/GCP. Don't touch the main checkout.
- Install nothing outside the worktree: run `npm ci` inside `backend/`, `frontend/` and `e2e/`, and use only the project's local binaries (`npm run …`, `npx` after `npm ci`).
- English for commits, PR title and body. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Markdown that is only the title line** (`# Title`, maybe with a trailing newline). Expected: the fallback shows no empty Markdown block and no error; the `<h1>` alone carries the title. Pinned in Task 1, `fallbackTree omits Markdown when only the title line was there`.
2. **Near-miss titles.** `## Title`, `# Title (updated)`, a leading blank line before `# Title`, and `# Title` on line 3 must all be kept. CRLF `# Title\r\n` and trailing spaces after the title must still be stripped. Pinned in Task 1, `stripLeadingTitle` cases.
3. **Render crash path.** When the layout throws, `RenderBoundary` shows `item.content.markdown`, which can lead with `# Title` under the same `<h1>`. Expected: the title line is stripped there too, using the same helper. Pinned in Task 1, `the crash fallback also drops the leading title line`. (This is my reading of "the Markdown shown in the fallback". If the owner wants it left alone, drop that step.)
4. **Contradictory field docs.** The `ui` field's schema description still says "Optional". Muse reads it next to the new "always include ui" text. Expected: the field description also says to always include it, while the server still accepts and saves an item without `ui`. Pinned in Task 3, `ui field description asks for a layout`, alongside the existing missing-ui save test.
5. **Guide examples that break their own rules.** A new example could start with a `Header`, contain "（出典", or repeat a tab name as a heading or `Card` title. Expected: the tests check these rules across all examples, not just the new one. Pinned in Task 4.

---

## File map

| File | Change |
|---|---|
| `frontend/src/generative-ui/fallback.ts` | no `Header`; `stripLeadingTitle`; omit an empty Markdown node |
| `frontend/src/generative-ui/fallback.test.ts` | new expectations and strip cases |
| `frontend/src/components/ItemRenderer.tsx` | `MISSING_NOTE`; pick the note from `uiStatus` |
| `frontend/src/components/RenderBoundary.tsx` | takes `title`; strips the leading title line |
| `frontend/src/components/ItemRenderer.test.tsx` | note and no-heading tests |
| `backend/src/mcp/server.ts` | instructions, description, `MISSING_UI_HINT`, `hint` field |
| `backend/src/items/input.ts:100-105` | `ui` field description |
| `backend/src/mcp/server.test.ts` | instructions, description and hint tests |
| `backend/src/mcp/guide.ts` | drop Headers from the examples; add `digest`; three rules |
| `backend/src/mcp/guide.test.ts` | validator and shape-rule tests over every example |
| `e2e/tests/flow.spec.ts`, `e2e/fixtures/mcp.ts` | missing-layout test (Tasks 2–3); no-sources test (Task 5) |
| `backend/src/items/input.ts:45-73` | sources `0–30`, default `[]`, optional `url`, new descriptions (Task 5) |
| `backend/src/items/read.ts:35`, `frontend/src/types.ts:31` | `FeedSource.url?: string` (Task 5) |
| `frontend/src/pages/ItemPage.tsx:16-43` | no footer for zero sources (Task 5) |
| `backend/src/items/input.test.ts`, `backend/src/items/store.db.test.ts`, `frontend/src/pages/ItemPage.test.tsx` | Task 5 tests |
| `docs/superpowers/specs/2026-11-15-pigeon-design.md:147,168,222,225,255,273`, `README.md:89` | amended for optional sources and url (Task 5) |

---

### Task 1: Fallback page without a repeated title (frontend)

**Files:**
- Modify: `frontend/src/generative-ui/fallback.ts`, `frontend/src/components/RenderBoundary.tsx`, `frontend/src/components/ItemRenderer.tsx` (it passes `title` to `RenderBoundary`)
- Test: `frontend/src/generative-ui/fallback.test.ts`, `frontend/src/components/ItemRenderer.test.tsx`

**Interfaces:**
- Produces: `export function stripLeadingTitle(markdown: string, title: string): string` in `fallback.ts`. It removes line 1 only when, after trailing whitespace (including `\r`) is trimmed, line 1 is exactly `` `# ${title}` ``. It also removes the blank lines right after it. Otherwise it returns the input unchanged.
- Produces: `RenderBoundary` props become `{ markdown: string; title: string; children: ReactNode }`.

- [ ] **Step 0: Set up.** Run `npm ci` in `backend/`, `frontend/` and `e2e/`. Expected: each exits 0, and `git status` stays clean.
- [ ] **Step 1: Write the failing tests** in `fallback.test.ts`:
  - Change the existing types assertion to `['Markdown', 'PriceHistory', 'PriceHistory']` and the product slice to `slice(1)`.
  - `it.each` named `stripLeadingTitle(%j) -> %j`, with `title = 'Headphones'`:
    - `'# Headphones\n\nBody'` → `'Body'`
    - `'# Headphones\r\n\r\nBody'` → `'Body'`
    - `'# Headphones  \nBody'` → `'Body'`
    - `'## Headphones\nBody'` unchanged
    - `'# Headphones (updated)\nBody'` unchanged
    - `'\n# Headphones\nBody'` unchanged
    - `'Intro\n\n# Headphones'` unchanged
    - `'# headphones\nBody'` unchanged
  - `fallbackTree strips the title line from its Markdown`: with markdown `'# Headphones\n\n## Hi'`, the Markdown child's `value` is `'## Hi'`.
  - `fallbackTree omits Markdown when only the title line was there`: with markdown `'# Headphones\n'`, the child types are `['PriceHistory', 'PriceHistory']`, and `guardTree(...).replaced` is `0`.
- [ ] **Step 2: Write the failing tests** in `ItemRenderer.test.tsx`:
  - `the fallback shows no heading of its own`: render `sample-invalid-ui` with `ui: null, uiStatus: 'invalid'` and `content.markdown = '# ' + raw.title + '\n\nSaved content'`. Expect `screen.queryByRole('heading')` to be `null`, and the markdown text to contain `Saved content` but not `raw.title`.
  - `the crash fallback also drops the leading title line`: reuse the `Boom` library from the existing test, with `content.markdown = '# ' + title + '\n\nBody text'`. Expect the page to show `Body text` and `container.textContent` not to contain `'# ' + title`.
- [ ] **Step 3: Run them and confirm they fail.** Run `cd frontend && npx vitest run src/generative-ui/fallback.test.ts src/components/ItemRenderer.test.tsx`. Expected: the new tests FAIL (Header present, title not stripped, `stripLeadingTitle` not exported).
- [ ] **Step 4: Implement** `stripLeadingTitle`. Change `fallbackTree` so it has no `Header` and includes `{ $type: 'Markdown', value }` only when the stripped value is non-empty. Give `RenderBoundary` a `title` prop and have it render `<Markdown value={stripLeadingTitle(markdown, title)} />`. `ItemRenderer` passes `response.item.title`.
- [ ] **Step 5: Run the frontend tests and confirm they pass.** Run `cd frontend && npm test`. Expected: all PASS.
- [ ] **Step 6: Commit** with `Drop the repeated title from the fallback page`.

### Task 2: Note from uiStatus (frontend)

**Files:**
- Modify: `frontend/src/components/ItemRenderer.tsx`
- Test: `frontend/src/components/ItemRenderer.test.tsx`, `e2e/tests/flow.spec.ts`

**Interfaces:**
- Produces: `export const MISSING_NOTE = "Muse didn't send a layout for this item."`, next to the existing `FALLBACK_NOTE`.

- [ ] **Step 1: Write the failing tests:**
  - `says Muse sent no layout when uiStatus is missing`: `ui: null, uiStatus: 'missing'`. Expect `MISSING_NOTE` to be shown and the fallback `NOTE` not to be shown.
  - `keeps the fallback note when uiStatus is invalid`: `ui: null, uiStatus: 'invalid'`. Expect `NOTE` to be shown and the missing note not to be shown.
  - The existing test `uses the fallback for an unknown schema version` (a valid status that the browser rejects) also asserts that the missing note is not shown.
  - e2e `an item saved without a layout says so and shows the title once`:
    - Build `fixture('sample-news')` with the title `` `No layout ${RUN}` ``, `content.markdown` set to `` `# No layout ${RUN}\n\nBody without a layout.` `` and the `dedupeKey` `` `news:missing-${RUN}` ``. Save it with the override `ui: undefined`, and expect `saved.uiStatus` to be `'missing'`.
    - Sign in and run `openItem`. Expect `Muse didn't send a layout for this item.` to be visible, and the fallback note to have count 0.
    - Expect `page.getByRole('heading').filter({ hasText: `No layout ${RUN}` })` to have count 1. Expect `[data-aui="markdown"]` to contain `Body without a layout.` and not to contain `# No layout`.
- [ ] **Step 2: Run them and confirm they fail.** Run `cd frontend && npx vitest run src/components/ItemRenderer.test.tsx`, then `cd e2e && npx playwright test -g "without a layout"`. Expected: the missing-note unit test and the e2e test FAIL on the note text.
- [ ] **Step 3: Implement.** The condition for showing the note stays `usedFallback || item.uiStatus !== 'valid'`. The text is `MISSING_NOTE` when `item.uiStatus === 'missing'`, and `FALLBACK_NOTE` otherwise.
- [ ] **Step 4: Run them and confirm they pass.** Run `cd frontend && npm test`, then `cd e2e && npx playwright test -g "without a layout|invalid tree" && npm run test:servers-stopped`. Expected: PASS. The invalid-tree e2e still sees the old note.
- [ ] **Step 5: Commit** with `Say when Muse sent no layout instead of blaming the layout`.

### Task 3: Always-send-ui guidance and the missing hint (backend MCP)

**Files:**
- Modify: `backend/src/mcp/server.ts`, `backend/src/items/input.ts:100-105`, `e2e/fixtures/mcp.ts` (`SaveResult` gains `hint?: string`)
- Test: `backend/src/mcp/server.test.ts`, `e2e/tests/flow.spec.ts`

**Interfaces:**
- Produces: `export const MISSING_UI_HINT = 'No layout sent; this item shows as plain text. Call get_ui_guide and save again with a ui.'` in `server.ts`. The save result JSON gains `hint: MISSING_UI_HINT` only when `uiStatus === 'missing'`.

- [ ] **Step 1: Write the failing tests** in `server.test.ts`:
  - `instructions ask for a ui on every save`: `SERVER_INSTRUCTIONS` matches `/always include a `?ui`?/i` and still matches `/get_ui_guide/`.
  - `save_feed_item description asks for a ui layout`: in `listTools`, `save_feed_item.description` matches `/always include a `?ui`?/i`.
  - `ui field description asks for a layout`: the `ui` property description matches `/always include/i` and does not match `/Optional/`.
  - `save_feed_item without ui saves and returns the hint`: save `{ ...loadFixture('sample-news'), ui: undefined }`. The result is not an error. The body equals `{ id, status: 'created', uiStatus: 'missing', hint: MISSING_UI_HINT, url }`, and `saveFeedItem` was called once.
  - Keep `save_feed_item saves the news fixture` as an exact `toEqual`, so a valid save has no `hint`. Add `expect(body.hint).toBeUndefined()` to the invalid-ui test.
  - In the Task 2 e2e test, expect `saved.hint` to equal the exact hint copy.
- [ ] **Step 2: Run them and confirm they fail.** Run `cd backend && npx vitest run src/mcp/server.test.ts`. Expected: the four new tests FAIL. The e2e hint assertion fails in Step 4's e2e run if this step was skipped.
- [ ] **Step 3: Implement.** In `SERVER_INSTRUCTIONS`, replace the get_ui_guide sentence with: `Always include a ui layout with every save_feed_item; call get_ui_guide once before building one.` Change the `save_feed_item` description to: `Save one item (news, research, a price drop, anything) to the owner’s pigeon feed. Always include a ui layout for how to show it; without one the item shows as plain text. Saving again with the same dedupeKey replaces the item.` In `input.ts`, change the `ui` field's sentence `Optional; a tree that breaks…` to `Always include it; a tree that breaks the rules is reported back as uiIssues and the item is still saved.` Add `...(parsed.ui.status === 'missing' && { hint: MISSING_UI_HINT })` to the result.
- [ ] **Step 4: Run them and confirm they pass.** Run `cd backend && npm test`, then `cd e2e && npx playwright test -g "without a layout" && npm run test:servers-stopped`. Expected: all PASS, including `input.test.ts` (`missing ui is status missing`, unchanged).
- [ ] **Step 5: Commit** with `Ask Muse for a layout on every save and hint when none was sent`.

### Task 4: get_ui_guide digest example and rules (backend MCP)

**Files:**
- Modify: `backend/src/mcp/guide.ts`
- Test: `backend/src/mcp/guide.test.ts`

**Interfaces:**
- Produces: `GUIDE_EXAMPLES` with the keys `news`, `priceWatch` and `digest` (same envelope `{ schemaVersion: 1, root }`, nodes keyed by `_type`).

- [ ] **Step 1: Write the failing tests** in `guide.test.ts`. Add a small recursive `nodes(tree)` walker in the test file.
  - Keep `the %s example is a valid tree` (`validateUiTree(tree)` → `{ ok: true }`) over all of `GUIDE_EXAMPLES`.
  - `it.each` `the %s example does not open with a Header`: `root.children[0]._type !== 'Header'`, and no node in the tree is a `Header`.
  - `it.each` `the %s example has no inline source lines`: `JSON.stringify(tree)` does not match `/出典/`.
  - `it.each` `the %s example does not repeat a tab name inside the tab`: for every `Tabs` node and each index `i`, no node under `children[i]` is a `Header` with `text === tabs[i]` or a `Card` with `title === tabs[i]`.
  - `the digest example has the digest shape`. The root's direct children include:
    - a `Table` whose column labels include `Category`, `Subject`, `Date` and `Point`, with one row per tab;
    - a `Tabs` where every child is a `Card`;
    - a `Timeline`;
    - an `Alert` with `tone: 'warning'`;
    - an `Alert` with `title: "Muse's take"` whose `description` is at least 80 characters.
    
    At least one `Fact` appears somewhere in the tree.
  - `the guide lists the layout rules`: `uiGuideText([])` contains the substrings `Don't start the layout with a Header that repeats the title`, `（出典：…）` and `Don't repeat a tab's name as a heading inside it`, plus `### digest`.
- [ ] **Step 2: Run them and confirm they fail.** Run `cd backend && npx vitest run src/mcp/guide.test.ts`. Expected: the Header tests FAIL for `news` and `priceWatch`, and the digest tests FAIL.
- [ ] **Step 3: Implement.**
  - Remove the `Header` child from `news` and `priceWatch`.
  - Add `digest`: an invented three-story daily digest (fictional names only). It has a Markdown lead-in of 1–2 sentences, the headline `Table`, and `Tabs` with `label` and one `tabs` entry per story. Each tab child is a `Card` with no title, holding a short Markdown summary and (in at least one story) a `Row` of `Fact`s. Then come an `Alert` with tone `warning` ("To act on"), a `Timeline`, and an `Alert` with tone `info` titled `Muse's take`, containing two or more sentences of analysis that compare the stories.
  - Add three rule lines under `## Rules`, using this exact copy:
    - `- Don't start the layout with a Header that repeats the title; the page already shows it.`
    - `- Don't add inline source lines like "（出典：…）"; pigeon lists content.sources on the page.`
    - `- Don't repeat a tab's name as a heading inside it.`
  - Add this rule line too: `- Always send ui. If save_feed_item returns uiStatus "missing", call get_ui_guide and save again with the same dedupeKey and a ui.`
- [ ] **Step 4: Run them and confirm they pass.** Run `cd backend && npm test`. Expected: all PASS.
- [ ] **Step 5: Commit** with `Add a digest example and layout rules to the UI guide`.

### Task 5: Items without a URL

Spec §3. Notes, Muse's own findings and summaries are normal items, so every description and guidance line treats "no sources" and "no URL" as normal, not as an exception.

**Files:**
- Modify:
  - `backend/src/items/input.ts:45-73`
  - `backend/src/items/read.ts:35`
  - `backend/src/mcp/server.ts:13`
  - `backend/src/mcp/guide.ts:72-74`
  - `frontend/src/types.ts:31`
  - `frontend/src/pages/ItemPage.tsx:16-43,116`
  - `docs/superpowers/specs/2026-11-15-pigeon-design.md`
  - `README.md:89`
- Test:
  - `backend/src/items/input.test.ts`
  - `backend/src/items/store.db.test.ts`
  - `backend/src/mcp/server.test.ts`
  - `frontend/src/pages/ItemPage.test.tsx`
  - `e2e/tests/flow.spec.ts`

**Interfaces:**
- Produces: `FeedSource = { title: string; url?: string; publisher?: string; publishedAt?: string }` in both `read.ts` and `types.ts`. `FeedItemInput.content.sources` is always an array (it defaults to `[]`).

- [ ] **Step 1: Write the failing backend tests** in `input.test.ts`:
  - Replace `rejects missing sources and an unknown top-level field` (`:141-145`) with two tests:
    - `accepts zero sources`: `sources = []` → `ok`, and `value.content.sources` equals `[]`.
    - `rejects an unknown top-level field`: keeps the `extra` assertion.
  - `defaults sources to [] when left out`: `delete raw.content.sources` → `ok`, `[]`.
  - `accepts a source without a url`: `[{ title: 'Conversation with the owner' }]` → `ok`, and the stored source `not.toHaveProperty('url')`.
  - `still rejects an unsafe or empty source url`: `'javascript:alert(1)'` and `''` each give an error containing `content.sources.0.url`.
  - `products still need a url`: `delete raw.products[0].url` on `sample-price-drop` gives an error containing `products.0.url`.
- [ ] **Step 2: Write the failing database test** in `store.db.test.ts`, `saves an item with no sources and one without a url`:
  - First save: sources `[]`. The stored doc has `content.sources` equal to `[]`.
  - Second save, with another `dedupeKey`: sources `[{ title: 'Note' }]`. The stored doc has `content.sources` equal to `[{ title: 'Note' }]`, with no `url` key and no `undefined` value written.
- [ ] **Step 3: Write the failing MCP tests** in `server.test.ts`:
  - `SERVER_INSTRUCTIONS` contains the exact URL rule from Global Constraints.
  - The `get_ui_guide` text contains the URL rule and the "Items don't need sources" line.
  - The guide text no longer contains `Use only URLs you actually visited. Images must be https.` as one line; keep `Images must be https.` as its own rule.
  - The `content.sources` schema description (from `listTools` → `inputSchema.properties.content.properties.sources.description`) matches `/0 to 30/` and `/notes/`.
  - The `url` description matches `/Leave it out/`.
  - `save_feed_item accepts an item with no sources`: sample-news with `sources: []` → not an error, `status: 'created'`.
- [ ] **Step 4: Write the failing frontend tests** in `ItemPage.test.tsx`:
  - `shows no Sources footer when there are no sources`: `sources = []`. Expect `queryByRole('contentinfo')` to be `null` and `queryByText('Sources')` to be `null`, while `item-meta` and the body still render.
  - `a source without a url is plain text`: `[{ title: 'Owner conversation', publisher: 'Chat' }]`. The footer has no link and contains `Owner conversation` and `Chat`.
- [ ] **Step 5: Write the failing e2e test** `a note with no sources ends cleanly and a URL-less source is plain text`:
  - Save sample-news with `dedupeKey` `` `note:none-${RUN}` `` and `content.sources` set to `[]`. Expect `uiStatus` `'valid'`. On its page, `page.locator('footer')` has count 0.
  - Save a second item with `` `note:nourl-${RUN}` `` and `[{ title: `Owner chat ${RUN}` }]`. The footer contains that title, and `footer a` has count 0.
- [ ] **Step 6: Run them and confirm they fail.** Run:
  - `cd backend && npx vitest run src/items/input.test.ts src/mcp/server.test.ts && npm run test:db`
  - `cd frontend && npx vitest run src/pages/ItemPage.test.tsx`
  - `cd e2e && npx playwright test -g "no sources"`

  Expected: the new tests FAIL (sources rejected, url required, the footer renders for `[]`, missing copy).
- [ ] **Step 7: Implement.**
  - In `input.ts`:
    - `sources`: `.min(0).max(30).default([])`.
    - `url`: `urlString(checkLinkUrl).optional()`.
    - Descriptions, with this exact copy:
      - source `title`: `Title of the source: a page, a document, a conversation or anything else you used.`
      - `url`: `URL of the page you actually visited (http or https). Leave it out when the source has no URL; never invent one.`
      - `sources`: `What this item is based on, 0 to 30. Leave it empty for your own notes, findings or summaries. The page lists them under Sources.`
      - `content`: `The item itself: your write-up and its sources, if any.`
    - Keep `products[].url` as it is.
  - In `server.ts:13`, replace `Use only URLs you actually visited.` with the URL rule.
  - In `guide.ts`, split line 74 into the URL rule, `- Images must be https.` and the "Items don't need sources" line.
  - In `read.ts` and `types.ts`, change `url` to `url?: string`.
  - In `ItemPage.tsx`, `Sources` returns `null` for an empty array. The `href` path already renders `<span>` when `safeLinkUrl(undefined)` is null.
- [ ] **Step 8: Run them and confirm they pass.** Run the commands from Step 6, then `cd backend && npm test` and `cd frontend && npm test`. Expected: all PASS.
- [ ] **Step 9: Amend the docs:**
  - In `2026-11-15-pigeon-design.md`:
    - `:147`: `sources` becomes `0–30`.
    - `:168`: `url?`.
    - `:222`: `[custom, shown when there are sources]`.
    - `:225`: "a `Sources` footer listing every `content.sources` entry when there are any (title, publisher if any, safe link when a url is present)".
    - `:255`: `url?: string` with `// 0–30`.
    - `:273`: add "to leave url out when there is none and never invent one".
  - In `README.md:89`: `Items: up to 30 sources (zero is fine; a source's url is optional) and 20 products.`
  - Check: `git grep -n "1–30\|1 to 30" -- docs README.md` returns only historical plan files.
- [ ] **Step 10: Commit** with `Allow items without sources or source URLs`.

### Task 6: Full verification, PR

- [ ] **Step 1:** Run the same checks as CI in `backend/`: `npm run lint && npm run format:check && npx tsc --noEmit && npm test && npm run test:db && npm run build`. In `frontend/`: `npm run lint && npm run format:check && npx tsc --noEmit && npm test && npm run build`. In `e2e/`: `npx tsc --noEmit && npm test && npm run test:servers-stopped`. Also run `scripts/check-node-pins.sh`. Expected: everything exits 0. Record the output.
- [ ] **Step 2:** Run `git grep -nE '//|/\*' -- $(git diff --name-only origin/main -- '*.ts' '*.tsx')` and review each hit to confirm there are no new code comments. Check the diff for project IDs, URLs and emails. Confirm `git status` is clean apart from intended files.
- [ ] **Step 3:** Push `feat/honest-note-guidance` and open one PR to `main`, titled `Honest fallback note and layout guidance for Muse`. The body covers what and why, the test evidence, the post-merge checks and the rollback below, and ends with the Claude Code attribution line. Don't merge.

## Risks / not included: assumptions that items are web articles

Muse will save almost everything here, not just articles. These spots were found read-only on 2026-11-23 and are **not changed in this PR**. They're listed so the owner can decide.

1. **Same-title saves overwrite each other.**
   - Where: `backend/src/items/input.ts:151-158` (`defaultDedupeKey` = `type:normalized title:Tokyo date`), used at `input.ts:268`, and described at `input.ts:42`.
   - What happens: two different notes with the same title on the same day (for example "Daily notes" or "Meeting summary") get the same key, so the second save replaces the first. The result reports `status: "updated"` and nothing else warns about it.
2. **The type list grows without limit.**
   - Where: `get_ui_guide` prints every stored type (`backend/src/mcp/guide.ts:77`), from `listTypes()`, which reads the whole `types` collection with no limit (`backend/src/items/read.ts:103-110`).
   - What happens: many ad-hoc slugs make the guide longer and invite more new slugs.
   - The same list drives the feed filter row (`frontend/src/pages/FeedPage.tsx:67-68,85`), a single scrolling row of buttons that gets hard to use with dozens of types.
3. **Save volume.**
   - Where: the MCP rate limit is 120 calls/hour per instance (`backend/src/app.ts:10,27`), and `get_ui_guide` and every save count against it.
   - What happens: bulk saving, including the new "save again with a ui" hint, can hit the limit.
4. **Article wording elsewhere in the schema.**
   - Where: `title` "Headline" (`input.ts:27`), `publishedAt` "When the news or finding was published" (`input.ts:36`), and the `type` examples `news, research or price-watch` (`input.ts:23,25`).
   - What happens: these nudge Muse to treat everything as news. Task 5 only rewords the sources fields.
5. **Guide rule that assumes sources.**
   - Where: `guide.ts:72`, "Keep what the sources say and your own analysis in separate blocks".
   - What happens: for a note with no sources, the rule has nothing to separate. The "Muse's take" convention may not fit notes either.
6. **Item page frame.**
   - Where: the date shown is `publishedAt ?? createdAt` (`frontend/src/pages/ItemPage.tsx:108-109`, `frontend/src/components/FeedCard.tsx:36-37`).
   - What happens: for notes, `publishedAt` is usually absent. That's fine, but there's no "updated" date, so re-saved notes look unchanged in the feed.

## After merge (done by the owner, or by me only when asked; read-only)

- Confirm that the `backend` and `frontend` deploy workflow runs for the merge commit are green: `gh run list --branch main --limit 5`.
- `GET <backend>/health` returns 200.
- An unauthenticated `POST <backend>/mcp` (initialize) still returns 401.
- An item saved with no sources shows no Sources footer.
- On the next save, Muse's result for an item without `ui` carries `hint`, and the item page shows "Muse didn't send a layout for this item."

## Rollback

There are no data or schema changes; stored items are read the same way. To roll back, open a PR that reverts the merge commit and merge it. Both deploy workflows redeploy the previous frontend and backend. Items saved in the meantime are unaffected.
