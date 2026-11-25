import { test, expect, type Page, type Request } from '@playwright/test'
import { routeImages, signIn } from '../fixtures/auth.js'
import { fixture, RUN, saveItem } from '../fixtures/mcp.js'
import { swipe } from '../fixtures/touch.js'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  await routeImages(page)
})

const isFeedFetch = (r: Request) =>
  r.method() === 'GET' && new URL(r.url()).pathname === '/api/items'

async function pull(page: Page) {
  await swipe(page, { x: 195, y: 200 }, { x: 195, y: 500 })
}

async function markPage(page: Page) {
  await page.evaluate((marker) => {
    document.body.dataset.pullMarker = marker
  }, RUN)
}

async function expectSamePage(page: Page) {
  await expect(page.locator('body')).toHaveAttribute('data-pull-marker', RUN)
}

test('pulling the feed shows an item saved after it loaded, without a reload', async ({ page }) => {
  await saveItem(fixture('sample-news'), {
    dedupeKey: `news:pull-a-${RUN}`,
    title: `Pull first ${RUN}`,
  })
  await signIn(page)
  await expect(page.getByRole('link', { name: new RegExp(`Pull first ${RUN}`) })).toBeVisible()
  await markPage(page)

  await saveItem(fixture('sample-news'), {
    dedupeKey: `news:pull-b-${RUN}`,
    title: `Pull second ${RUN}`,
  })
  const second = page.getByRole('link', { name: new RegExp(`Pull second ${RUN}`) })
  await expect(second).toHaveCount(0)

  await pull(page)
  await expect(second).toBeVisible()
  await expectSamePage(page)
})

test('pulling an item page shows its updated version, without a reload', async ({ page }) => {
  const dedupeKey = `news:pull-item-${RUN}`
  const saved = await saveItem(fixture('sample-news'), { dedupeKey, title: `Pull item ${RUN}` })
  await signIn(page)
  await page.goto(new URL(saved.url).pathname)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Pull item ${RUN}`)
  await markPage(page)

  await saveItem(fixture('sample-news'), { dedupeKey, title: `Pull item ${RUN} v2` })
  await pull(page)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Pull item ${RUN} v2`)
  await expectSamePage(page)
})

test('a horizontal swipe on the filter row does not refresh', async ({ page }) => {
  await saveItem(fixture('sample-news'), {
    dedupeKey: `news:pull-swipe-${RUN}`,
    title: `Pull swipe ${RUN}`,
  })
  await signIn(page)
  await expect(page.getByRole('link', { name: new RegExp(`Pull swipe ${RUN}`) })).toBeVisible()

  let fetches = 0
  page.on('request', (r) => {
    if (isFeedFetch(r)) fetches++
  })
  const box = await page.getByRole('navigation', { name: 'Filter by type' }).boundingBox()
  if (!box) throw new Error('filter row is not visible')
  const y = box.y + box.height / 2
  await swipe(page, { x: box.x + box.width - 20, y }, { x: box.x + 20, y })

  const refreshed = page.waitForResponse((r) => isFeedFetch(r.request()), { timeout: 5_000 })
  await pull(page)
  await refreshed
  expect(fetches).toBe(1)
})
