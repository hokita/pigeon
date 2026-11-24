# Unread indicator: design

Status: approved by the owner on 2026-11-25.
Mockup (placeholder colours): https://claude.ai/artifact/BkW6xNbT6JiS4dtjzFrmA5

## Why

Every feed item looks the same, so the owner can't tell what Muse added since they last looked.

## What the owner sees

- In the feed, an unread item shows a small dot and a bold title. Nothing else on the card changes.
- An item becomes read when the owner opens its item page. Scrolling past it in the feed doesn't count.
- A new item saved by Muse is unread.
- When Muse saves the same item again (same `dedupeKey`, which replaces it), it is unread again.
- Items saved before this change have no mark and count as read. There is no migration.

## Where the state lives

The mark is stored in the backend, on each item. It is not kept in browser storage, because the
iPhone home-screen app and Safari have separate storage and would disagree.

Opening an item page calls an authenticated backend endpoint that clears the mark. It is a write
of its own, not a side effect of reading the item. Only the signed-in owner can call it; the
existing auth middleware for `/api/items` stays as it is.

## Not included

- An unread count.
- An "unread only" filter.
- "Mark all read".
- Any change to Muse's MCP tools or instructions.

## Approaches considered

1. **A per-item mark in the backend (chosen).** Set on every save that writes the item, cleared
   by an endpoint when the item page opens. Works the same on every device.
2. **Phone storage (rejected).** The iPhone home-screen app and Safari keep separate storage, so
   an item read in one would still look unread in the other.
3. **"Everything since my last visit" (rejected).** One timestamp can't clear a single item when
   it is opened; the owner chose per-item reading.

## Left to the builder

The dot's exact look, matching the current card style.

## Technical shape

- Firestore `items/{id}` gains a boolean `unread`. A save that writes the item sets it to `true`.
  A document without the field reads as `false`.
- `POST /api/items/:id/read` clears it and answers `204`; an unknown or malformed id answers `404`.
  Clearing does not change `updatedAt`.
- `GET /api/items` and `GET /api/items/:id` include `unread: boolean` on each item.
- No new Firestore query, so no new index; the rules stay deny-all (only the backend's Admin SDK
  touches Firestore).
