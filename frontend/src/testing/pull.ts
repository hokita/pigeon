import { fireEvent } from '@testing-library/react'

type TouchKind = 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel'

export function touch(kind: TouchKind, x: number, y: number, fingers = 1): boolean {
  const ended = kind === 'touchEnd' || kind === 'touchCancel'
  const point = { clientX: x, clientY: y }
  const touches = ended ? [] : Array.from({ length: fingers }, () => point)
  return fireEvent[kind](window, { touches, changedTouches: [point] })
}

export function pullDown(dy: number, dx = 0): void {
  touch('touchStart', 100, 100)
  touch('touchMove', 100 + dx, 100 + dy)
  touch('touchEnd', 100 + dx, 100 + dy)
}
