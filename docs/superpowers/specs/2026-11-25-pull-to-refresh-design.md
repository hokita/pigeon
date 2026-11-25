# Pull-to-refresh

Approved by the owner on 2026-11-25 (approach A). One PR.

## Why

The owner opens pigeon from an iPhone home-screen icon. It runs as a full-screen web app with no Safari UI, so there is no browser pull-to-refresh. Each page fetches only when it mounts (`FeedPage.tsx` and `ItemPage.tsx` use a `useEffect`; plain `fetch` through `api.ts`), and the only way to fetch again is the Retry button shown after an error. New items Muse saves can't be seen without closing the app.

## Design

- **Feed:** pull down while the page is scrolled to the top. Past a short threshold a spinner shows, then the first page of items is fetched again.
  - The selected type filter is kept.
  - The "Load more" cursor resets to the first page.
  - The type list (filter chips) is fetched again too, so a chip for a new type shows right away. If that fetch fails, the current chips stay. (Added by the owner on 2026-11-25 when approving the plan.)
- **Item page:** the same pull fetches that item again.
- **While loading:** the current content stays on screen (no blank flash).
- **On failure:** the old content stays, with a short error message and a Retry button.
- **When it starts:** only when the window is scrolled to the top, so normal scrolling never triggers it. Horizontal swipes (the filter chip row) are ignored. The window is the scroll container.
- **How it's built:** a small hook and component in the repo. No new dependency or library.
- **Left to the implementer:** the exact threshold and spinner style (match the current look), and the test setup.

## Not included

- Auto-refresh when the app comes back to the foreground or becomes visible.
- A refresh button for desktop.
- Any new dependency or library.

## Approaches considered

- **A. In-app pull gesture that re-fetches data (chosen).** It matches the gesture the owner asked for, keeps the content on screen, and needs no new dependency.
- **B. Full page reload on pull.** Rejected: a white flash and a sign-in check on every reload.
- **C. A refresh button.** Rejected: it is not the gesture that was asked for.
