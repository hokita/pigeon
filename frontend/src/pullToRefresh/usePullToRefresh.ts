import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { movePull, shouldRefresh, startPull, type Point, type PullState } from './gesture'

const firstTouch = (e: TouchEvent): Point => ({
  x: e.touches[0].clientX,
  y: e.touches[0].clientY,
})

export function usePullToRefresh(onRefresh: () => Promise<void>): {
  distance: number
  refreshing: boolean
  refresh: () => void
} {
  const [distance, setDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const gesture = useRef<PullState>({ phase: 'idle' })
  const inFlight = useRef(false)
  const latestOnRefresh = useRef(onRefresh)

  useLayoutEffect(() => {
    latestOnRefresh.current = onRefresh
  }, [onRefresh])

  const refresh = useCallback(() => {
    if (inFlight.current) return
    inFlight.current = true
    setRefreshing(true)
    void latestOnRefresh.current().finally(() => {
      inFlight.current = false
      setRefreshing(false)
    })
  }, [])

  useEffect(() => {
    const onStart = (e: TouchEvent) => {
      gesture.current =
        e.touches.length === 1 && !inFlight.current
          ? startPull(firstTouch(e), window.scrollY)
          : { phase: 'ignored' }
    }
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        gesture.current = { phase: 'ignored' }
        setDistance(0)
        return
      }
      const next = movePull(gesture.current, firstTouch(e))
      gesture.current = next
      if (next.phase !== 'pulling') return
      if (e.cancelable) e.preventDefault()
      setDistance(next.distance)
    }
    const finish = (refreshIfPulled: boolean) => {
      const pulled = shouldRefresh(gesture.current)
      gesture.current = { phase: 'idle' }
      setDistance(0)
      if (refreshIfPulled && pulled) refresh()
    }
    const onEnd = () => finish(true)
    const onCancel = () => finish(false)
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onCancel)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [refresh])

  return { distance, refreshing, refresh }
}
