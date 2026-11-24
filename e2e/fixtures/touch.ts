import type { Page } from '@playwright/test'

type Point = { x: number; y: number }

export async function swipe(page: Page, from: Point, to: Point, steps = 10): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] })
    for (let i = 1; i <= steps; i++) {
      const point = {
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] })
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  } finally {
    await cdp.detach()
  }
}
