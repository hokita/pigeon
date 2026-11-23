# Honest fallback note and layout guidance for Muse

Approved by the owner on 2026-11-23. One PR.

## Why

A read-only review of production found three problems:

- Most items had `uiStatus: "missing"` (Muse sent no layout), but the page said "the layout Muse sent couldn't be used". That is not true for those items.
- The title shows two or three times on every page: the page `<h1>`, a `Header` node, and often a leading `# <title>` line in the Markdown.
- The one valid layout was almost all long Markdown blocks, so it looked like the plain-text fallback.

## 1. Item page (frontend)

- `uiStatus: "missing"`: the note reads "Muse didn't send a layout for this item."
- `uiStatus: "invalid"`, and layouts the browser rejects (`migrateUi` / `guardTree`): the note stays "Showing the saved content; the layout Muse sent couldn't be used."
- The fallback page stops repeating the title:
  - `fallbackTree` (`frontend/src/generative-ui/fallback.ts`) no longer adds a `Header`.
  - The Markdown shown in the fallback drops a leading `# <title>` line. It must match the title exactly, and only the first line is checked.
- Muse's valid layouts are not changed.

## 2. Guidance for Muse (backend MCP)

- The server instructions and the `save_feed_item` description say to always include a `ui` layout.
- When a save's `uiStatus` is `"missing"`, the tool result adds a hint: "No layout sent; this item shows as plain text. Call get_ui_guide and save again with a ui."
- `get_ui_guide`:
  - Adds a digest example: a headline `Table` of all stories (category, subject, date, one-line point); `Tabs` with one `Card` per story and no heading that repeats the tab name; `Fact` for key figures; `Alert` with tone `"warning"` for things to act on; a `Timeline`; and an `Alert` titled "Muse's take" with real analysis.
  - Adds these rules: don't start the layout with a `Header` that repeats the title (the page already shows it); don't add inline source lines like "（出典：…）" (pigeon lists the sources); don't repeat a tab's name as a heading inside that tab.
  - Removes the title-repeating `Header` from the existing examples.
  - Every example must pass the real validator, with a test for each.

## 3. Items without a URL

Approved by the owner on 2026-11-23 as an addition to the same PR.

Muse will save almost all of its information into pigeon, not just web articles. Items with no URL at all, such as notes, its own findings and summaries, are a normal case, not an exception. The schema descriptions and guidance are worded that way. With no sources, the page ends cleanly after the body: no empty heading or stray divider.

Places that still assume items are web articles are listed, not fixed, under "Risks / not included" in the plan.

- **Backend input** (`backend/src/items/input.ts`):
  - `content.sources` may be empty: min 0, and it defaults to `[]` when left out.
  - `sources[].url` becomes optional. When present, it must still pass `checkLinkUrl`, so `javascript:` and other unsafe URLs are still rejected.
  - The field descriptions are reworded to match.
  - `products[].url` stays required, because it is the product's identity.
- **Read model and frontend:**
  - `FeedSource.url` is optional in `backend/src/items/read.ts` and `frontend/src/types.ts`.
  - The item page's Sources footer (heading and list) is not shown when there are no sources.
  - A source without a URL shows its title as plain text. The page already does this for unsafe URLs.
- **Guidance:** the server instructions and the guide keep "use only URLs you actually visited" and add "leave url out when there is none; never invent one".
- **Docs:** the original design (`docs/superpowers/specs/2026-11-15-pigeon-design.md`) and `README.md` are amended to say sources are 0–30, the url is optional, and the footer shows only when there are sources.

## Not included

Storing `uiIssues`, soft hints, cleaning up test items, and any change to what counts as a valid layout.
