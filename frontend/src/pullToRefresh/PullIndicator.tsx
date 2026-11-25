import { PULL_THRESHOLD } from './gesture'

export function PullIndicator({ distance, refreshing }: { distance: number; refreshing: boolean }) {
  if (distance === 0 && !refreshing) return null
  const offset = refreshing ? PULL_THRESHOLD : distance
  const ring = 'size-7 rounded-full border-2 border-border border-t-primary bg-background shadow-sm'
  return (
    <div className="fixed inset-x-0 top-0 z-10 flex justify-center pointer-events-none pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <div style={{ transform: `translateY(${offset}px)` }}>
        {refreshing ? (
          <div
            role="status"
            aria-label="Refreshing"
            className={`${ring} animate-spin motion-reduce:animate-none`}
          />
        ) : (
          <div
            aria-hidden="true"
            className={ring}
            style={{
              transform: `rotate(${distance * 4}deg)`,
              opacity: Math.min(1, distance / PULL_THRESHOLD),
            }}
          />
        )}
      </div>
    </div>
  )
}
