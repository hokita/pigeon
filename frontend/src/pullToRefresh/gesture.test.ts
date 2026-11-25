import { describe, it, expect } from 'vitest'
import {
  PULL_MAX,
  PULL_RESISTANCE,
  PULL_THRESHOLD,
  movePull,
  shouldRefresh,
  startPull,
} from './gesture'

const at = (x: number, y: number) => ({ x, y })

describe('pull gesture', () => {
  it('starting below the top is ignored', () => {
    expect(startPull(at(0, 0), 1)).toEqual({ phase: 'ignored' })
  })

  it('starting at the top is pending', () => {
    expect(startPull(at(0, 0), 0)).toEqual({ phase: 'pending', start: at(0, 0) })
  })

  it('a move inside the slop stays pending', () => {
    const s = startPull(at(0, 0), 0)
    expect(movePull(s, at(3, 7))).toBe(s)
  })

  it('a mostly vertical downward move pulls with resistance', () => {
    expect(movePull(startPull(at(0, 0), 0), at(10, 100))).toEqual({
      phase: 'pulling',
      start: at(0, 0),
      distance: 50,
    })
  })

  it('a mostly horizontal move is ignored and stays ignored', () => {
    const s = movePull(startPull(at(0, 0), 0), at(40, 20))
    expect(s).toEqual({ phase: 'ignored' })
    expect(movePull(s, at(40, 300))).toEqual({ phase: 'ignored' })
  })

  it('an upward move is ignored', () => {
    expect(movePull(startPull(at(0, 0), 0), at(0, -20))).toEqual({ phase: 'ignored' })
  })

  it('distance is capped at PULL_MAX', () => {
    expect(movePull(startPull(at(0, 0), 0), at(0, 1000))).toMatchObject({ distance: PULL_MAX })
  })

  it('moving back above the start brings distance to 0 and does not refresh', () => {
    const s = movePull(movePull(startPull(at(0, 0), 0), at(0, 200)), at(0, -50))
    expect(s).toMatchObject({ phase: 'pulling', distance: 0 })
    expect(shouldRefresh(s)).toBe(false)
  })

  it('refreshes at the threshold, not below it', () => {
    const pulled = (dy: number) => movePull(startPull(at(0, 0), 0), at(0, dy))
    expect(shouldRefresh(pulled(PULL_THRESHOLD / PULL_RESISTANCE))).toBe(true)
    expect(shouldRefresh(pulled(PULL_THRESHOLD / PULL_RESISTANCE - 2))).toBe(false)
    expect(shouldRefresh({ phase: 'idle' })).toBe(false)
  })
})
