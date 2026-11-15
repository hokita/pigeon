import { test, expect, type Page } from '@playwright/test'
import { routeImages, signIn } from '../fixtures/auth.js'
import { fixture, RUN, saveItem } from '../fixtures/mcp.js'

// A price item for its own product (unique key per test), observed on a November day.
function priceItem(tag: string, day: number, price: number) {
  const raw = fixture('sample-price-drop')
  const d = String(day).padStart(2, '0')
  raw.dedupeKey = `price-watch:${tag}-${RUN}:2026-11-${d}`
  raw.title = `Price ${tag} ${RUN} day ${day}`
  raw.products = [
    {
      ...raw.products[0],
      productKey: `sku:${tag}-${RUN}`,
      price,
      observedAt: `2026-11-${d}T09:00:00+09:00`,
    },
  ]
  raw.ui.root.children = raw.ui.root.children.filter(
    (c: { _type: string; product?: string }) =>
      c._type !== 'PriceHistory' || c.product === 'sku:wh-2000'
  )
  raw.ui.root.children.find((c: { _type: string }) => c._type === 'PriceHistory').product =
    `sku:${tag}-${RUN}`
  return raw
}

async function openItem(page: Page, url: string) {
  await page.goto(new URL(url).pathname)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

test.beforeEach(async ({ page }) => {
  await routeImages(page)
})

test('a news item saved through MCP shows in the feed and renders its tree', async ({ page }) => {
  const news = fixture('sample-news')
  const saved = await saveItem(news, {
    dedupeKey: `news:flow-${RUN}`,
    title: `${news.title} ${RUN}`,
  })
  expect(saved).toMatchObject({ status: 'created', uiStatus: 'valid' })

  await signIn(page)
  await page
    .getByRole('link', { name: new RegExp(RUN) })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${news.title} ${RUN}`)
  await expect(page.locator('[data-aui="markdown"]').first()).toContainText('Lumen-7')
  await expect(page.locator('img[referrerpolicy="no-referrer"]').first()).toBeVisible()
  await expect(page.locator('[data-aui="table"] tbody tr')).toHaveCount(5)
  await expect(page.locator('svg[data-aui="chart"]')).toHaveCount(1)
  await expect(page.locator('[data-aui="timeline"] li')).toHaveCount(5)
  await expect(page.locator('[data-aui="alert"]')).toContainText("Muse's take")
  await expect(page.getByTestId('item-meta')).toContainText('Written by Muse')
  await expect(page.locator('footer').getByRole('link')).toHaveCount(3)
})

test('a price drop shows recorded history', async ({ page }) => {
  await saveItem(priceItem('drop', 14, 39600))
  const later = await saveItem(priceItem('drop', 15, 32800))
  await signIn(page)
  await expect(page.getByRole('link', { name: new RegExp(`drop ${RUN} day 15`) })).toContainText(
    '−17.2%'
  )
  await openItem(page, later.url)
  await expect(page.locator('figure svg[data-aui="chart"]')).toBeVisible()
  await expect(page.locator('figcaption')).toContainText('2 observations')
})

test('an old price item shows history as of its own date', async ({ page }) => {
  const items = []
  for (const [day, price] of [
    [1, 40000],
    [2, 35000],
    [3, 30000],
  ]) {
    items.push(await saveItem(priceItem('asof', day, price)))
  }
  await signIn(page)
  await openItem(page, items[1].url)
  await expect(page.locator('figcaption')).toContainText('2 observations')
  await openItem(page, items[2].url)
  await expect(page.locator('figcaption')).toContainText('3 observations')
})

test('the type filter is built from saved types', async ({ page }) => {
  await saveItem(fixture('sample-news'), { dedupeKey: `news:filter-${RUN}` })
  const research = fixture('sample-research')
  await saveItem(research, { dedupeKey: `research:filter-${RUN}`, title: `Research ${RUN}` })
  await saveItem(priceItem('filter', 10, 1000))
  await signIn(page)
  const filter = page.getByRole('navigation', { name: 'Filter by type' })
  for (const t of ['All', 'news', 'research', 'price-watch']) {
    await expect(filter.getByRole('button', { name: t, exact: true })).toBeVisible()
  }
  await filter.getByRole('button', { name: 'research', exact: true }).click()
  await expect(page).toHaveURL(/\?type=research$/)
  await expect(filter.getByRole('button', { name: 'research', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  const cards = page.getByRole('main').getByRole('listitem')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(`Research ${RUN}`)
})

test('a research item with no products renders', async ({ page }) => {
  const saved = await saveItem(fixture('sample-research'), { dedupeKey: `research:tabs-${RUN}` })
  await signIn(page)
  await openItem(page, saved.url)
  await page.getByRole('tab', { name: 'Options' }).click()
  await expect(page.locator('[data-aui="table"]')).toBeVisible()
  await page.getByRole('tab', { name: 'Sources' }).click()
  await expect(page.locator('[data-aui="citation"]')).toHaveCount(4)
  await expect(page.locator('figcaption')).toHaveCount(0)
})

test('an invalid tree falls back to the content', async ({ page }) => {
  const saved = await saveItem(fixture('sample-invalid-ui'), { dedupeKey: `news:invalid-${RUN}` })
  expect(saved.uiStatus).toBe('invalid')
  await signIn(page)
  await openItem(page, saved.url)
  await expect(
    page.getByText("Showing the saved content; the layout Muse sent couldn't be used.")
  ).toBeVisible()
  await expect(page.locator('[data-aui="markdown"]')).toContainText('Saved content')
  await expect(page.locator('[data-aui="markdown"]')).toContainText("<script>alert('x')</script>")
  await expect(page.locator('footer').getByRole('link')).toHaveCount(1)
  await expect(page.locator('img[src^="javascript"]')).toHaveCount(0)
  await expect(page.locator('script:not([type="module"]):not([src])')).toHaveCount(0)
})

test('re-saving with a broken tree shows the new content, not the old tree', async ({ page }) => {
  const key = `news:resave-${RUN}`
  const first = await saveItem(fixture('sample-news'), { dedupeKey: key })
  const next = fixture('sample-news')
  next.title = `Replaced ${RUN}`
  next.content.markdown = 'The replacement write-up.'
  next.ui = { schemaVersion: 1, root: { _type: 'Button', label: 'x' } }
  const second = await saveItem(next, { dedupeKey: key })
  expect(second).toMatchObject({ id: first.id, status: 'updated', uiStatus: 'invalid' })
  await signIn(page)
  await openItem(page, second.url)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Replaced ${RUN}`)
  await expect(page.locator('[data-aui="markdown"]')).toContainText('The replacement write-up.')
  await expect(page.locator('[data-aui="table"]')).toHaveCount(0)
  await expect(page.locator('[data-aui="timeline"]')).toHaveCount(0)
})

test('no horizontal scroll at 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const news = await saveItem(fixture('sample-news'), { dedupeKey: `news:narrow-${RUN}` })
  const price = await saveItem(priceItem('narrow', 5, 1200))
  const wide = fixture('sample-research')
  wide.content.sources.push({
    title: 'A very long link',
    url: 'https://example.com/' + 'averyveryverylongpathsegment'.repeat(8),
  })
  const research = await saveItem(wide, { dedupeKey: `research:narrow-${RUN}` })
  const longUrl = 'https://example.com/' + 'unbrokenpathsegment'.repeat(10)
  const columns = Array.from({ length: 12 }, (_, i) => ({ label: `Column heading ${i + 1}` }))
  const tree = fixture('sample-news')
  tree.products = [
    {
      name: 'A-product-name-without-any-spaces-'.repeat(4),
      url: 'https://shop.example.com/p/1',
      price: 1000,
      observedAt: '2026-11-15T09:00:00+09:00',
    },
  ]
  tree.ui = {
    schemaVersion: 1,
    root: {
      _type: 'Col',
      children: [
        { _type: 'Header', text: 'Header' + 'x'.repeat(150) },
        { _type: 'Text', value: `See ${longUrl}` },
        { _type: 'Table', columns, rows: [columns.map((c) => `${c.label} value`)] },
        { _type: 'Citation', title: longUrl, url: longUrl },
        { _type: 'Alert', title: "Muse's take", description: longUrl },
        { _type: 'Fact', label: 'Link', value: longUrl },
      ],
    },
  }
  const wideTree = await saveItem(tree, {
    dedupeKey: `news:wide-tree-${RUN}`,
    title: `Wide ${RUN}`,
  })
  expect(wideTree.uiStatus).toBe('valid')
  await signIn(page)
  for (const saved of [news, price, research, wideTree]) {
    await openItem(page, saved.url)
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width, saved.url).toBeLessThanOrEqual(375)
  }
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

test('dark mode renders', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const saved = await saveItem(fixture('sample-news'), { dedupeKey: `news:dark-${RUN}` })
  await signIn(page)
  await openItem(page, saved.url)
  // Paint a pixel with the computed colour to get sRGB, whatever colour syntax the CSS uses.
  const luminance = await page.evaluate(() => {
    const color = getComputedStyle(document.body).backgroundColor
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    const lin = (c: number) => {
      const s = c / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  })
  expect(luminance).toBeLessThan(0.2)
})

test('viewing an item makes no LLM or third-party call', async ({ page }) => {
  const saved = await saveItem(fixture('sample-news'), { dedupeKey: `news:offline-${RUN}` })
  const hosts = new Set<string>()
  page.on('request', (req) => hosts.add(new URL(req.url()).hostname))
  await signIn(page)
  await openItem(page, saved.url)
  await page.waitForLoadState('networkidle')
  const allowed = /^(localhost|127\.0\.0\.1|[a-z0-9.-]*example\.(com|org|net))$/
  expect([...hosts].filter((h) => !allowed.test(h))).toEqual([])
})
