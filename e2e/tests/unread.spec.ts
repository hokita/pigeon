import { test, expect, type Page } from '@playwright/test'
import { routeImages, signIn } from '../fixtures/auth.js'
import { fixture, RUN, saveItem } from '../fixtures/mcp.js'

test.beforeEach(async ({ page }) => {
  await routeImages(page)
})

const card = (page: Page, title: string) =>
  page.getByRole('link', { name: new RegExp(`${title}( |$)`) })

test('an item Muse saved is unread until its page is opened', async ({ page }) => {
  const viaLink = `Unread link ${RUN}`
  const viaBack = `Unread back ${RUN}`
  await saveItem(fixture('sample-news'), { dedupeKey: `news:unread-link-${RUN}`, title: viaLink })
  await saveItem(fixture('sample-news'), { dedupeKey: `news:unread-back-${RUN}`, title: viaBack })
  await signIn(page)

  await expect(card(page, viaLink).getByTestId('unread-dot')).toBeVisible()
  await card(page, viaLink).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(viaLink)
  await page.getByRole('link', { name: '← Feed' }).click()
  await expect(card(page, viaLink)).toBeVisible()
  await expect(card(page, viaLink).getByTestId('unread-dot')).toHaveCount(0)

  await expect(card(page, viaBack).getByTestId('unread-dot')).toBeVisible()
  await card(page, viaBack).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(viaBack)
  await page.goBack()
  await expect(card(page, viaBack)).toBeVisible()
  await expect(card(page, viaBack).getByTestId('unread-dot')).toHaveCount(0)

  await page.reload()
  await expect(card(page, viaLink)).toBeVisible()
  await expect(card(page, viaLink).getByTestId('unread-dot')).toHaveCount(0)
  await expect(card(page, viaBack).getByTestId('unread-dot')).toHaveCount(0)
})

test('Muse saving the item again makes it unread again', async ({ page }) => {
  const dedupeKey = `news:unread-resave-${RUN}`
  const title = `Unread resave ${RUN}`
  const saved = await saveItem(fixture('sample-news'), { dedupeKey, title })
  await signIn(page)
  await page.goto(new URL(saved.url).pathname)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(title)
  await page.getByRole('link', { name: '← Feed' }).click()
  await expect(card(page, title)).toBeVisible()
  await expect(card(page, title).getByTestId('unread-dot')).toHaveCount(0)

  await saveItem(fixture('sample-news'), { dedupeKey, title: `${title} v2` })
  await page.reload()
  await expect(card(page, `${title} v2`).getByTestId('unread-dot')).toBeVisible()
})
