import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { usePullToRefresh } from './usePullToRefresh'
import { PullIndicator } from './PullIndicator'
import { pullDown, touch } from '../testing/pull'

function deferred() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function Harness({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const pull = usePullToRefresh(onRefresh)
  return (
    <>
      <PullIndicator distance={pull.distance} refreshing={pull.refreshing} />
      <button type="button" onClick={pull.refresh}>
        go
      </button>
    </>
  )
}

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { value, configurable: true })
}

afterEach(() => setScrollY(0))

describe('usePullToRefresh', () => {
  it('a pull past the threshold calls onRefresh once and shows the spinner until it settles', async () => {
    const d = deferred()
    const onRefresh = vi.fn(() => d.promise)
    render(<Harness onRefresh={onRefresh} />)
    pullDown(200)
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status', { name: 'Refreshing' })).toBeInTheDocument()
    d.resolve()
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('a short pull does nothing', () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    render(<Harness onRefresh={onRefresh} />)
    pullDown(100)
    expect(onRefresh).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('the pulling move is cancelled so the page does not bounce', () => {
    render(<Harness onRefresh={() => Promise.resolve()} />)
    touch('touchStart', 100, 100)
    expect(touch('touchMove', 100, 300)).toBe(false)
  })

  it('horizontal moves and moves on a scrolled page are not cancelled', () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    render(<Harness onRefresh={onRefresh} />)
    touch('touchStart', 100, 100)
    expect(touch('touchMove', 300, 110)).toBe(true)
    touch('touchEnd', 300, 110)
    setScrollY(200)
    touch('touchStart', 100, 100)
    expect(touch('touchMove', 100, 300)).toBe(true)
    touch('touchEnd', 100, 300)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('a two-finger touch is ignored', () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    render(<Harness onRefresh={onRefresh} />)
    touch('touchStart', 100, 100, 2)
    touch('touchMove', 100, 300, 2)
    touch('touchEnd', 100, 300)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('touchcancel does not refresh', () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    const { container } = render(<Harness onRefresh={onRefresh} />)
    touch('touchStart', 100, 100)
    touch('touchMove', 100, 300)
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
    touch('touchCancel', 100, 300)
    expect(onRefresh).not.toHaveBeenCalled()
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('ignores pulls and refresh() while refreshing', () => {
    const onRefresh = vi.fn(() => deferred().promise)
    render(<Harness onRefresh={onRefresh} />)
    pullDown(200)
    pullDown(200)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('refresh() triggers a refresh without a gesture', () => {
    const onRefresh = vi.fn(() => deferred().promise)
    render(<Harness onRefresh={onRefresh} />)
    fireEvent.click(screen.getByRole('button', { name: 'go' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status', { name: 'Refreshing' })).toBeInTheDocument()
  })

  it('removes its listeners on unmount', () => {
    const onRefresh = vi.fn(() => Promise.resolve())
    const { unmount } = render(<Harness onRefresh={onRefresh} />)
    unmount()
    pullDown(200)
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
