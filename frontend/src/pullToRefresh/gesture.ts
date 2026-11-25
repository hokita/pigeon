export const PULL_THRESHOLD = 64
export const PULL_MAX = 96
export const PULL_RESISTANCE = 0.5
export const DIRECTION_SLOP = 8

export type Point = { x: number; y: number }

export type PullState =
  | { phase: 'idle' }
  | { phase: 'pending'; start: Point }
  | { phase: 'pulling'; start: Point; distance: number }
  | { phase: 'ignored' }

const pullDistance = (dy: number) => Math.min(PULL_MAX, Math.max(0, dy * PULL_RESISTANCE))

export function startPull(point: Point, scrollY: number): PullState {
  return scrollY > 0 ? { phase: 'ignored' } : { phase: 'pending', start: point }
}

export function movePull(state: PullState, point: Point): PullState {
  if (state.phase === 'pulling') {
    return { ...state, distance: pullDistance(point.y - state.start.y) }
  }
  if (state.phase !== 'pending') return state
  const dx = Math.abs(point.x - state.start.x)
  const dy = point.y - state.start.y
  if (Math.max(dx, Math.abs(dy)) < DIRECTION_SLOP) return state
  if (dy <= 0 || dx >= dy) return { phase: 'ignored' }
  return { phase: 'pulling', start: state.start, distance: pullDistance(dy) }
}

export function shouldRefresh(state: PullState): boolean {
  return state.phase === 'pulling' && state.distance >= PULL_THRESHOLD
}
