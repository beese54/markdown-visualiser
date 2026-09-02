import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Reading progress down the edge of the sheet.
 *
 * From `scroll-progress-timeline`: a base line with a progress line scaled by
 * scroll position. Under reduced motion the fill is shown as a discrete
 * position rather than a scrubbed interpolation, and the whole thing is
 * decorative - it is hidden from assistive technology, since the index
 * already conveys position semantically.
 */

export function ProgressRail({
  scrollHost,
}: {
  readonly scrollHost: RefObject<HTMLElement | null>
}) {
  const [progress, setProgress] = useState(0)
  const frame = useRef(0)

  useEffect(() => {
    const host = scrollHost.current
    if (!host) return

    const measure = () => {
      const scrollable = host.scrollHeight - host.clientHeight
      // A document shorter than the viewport is fully read by definition.
      setProgress(scrollable <= 0 ? 1 : Math.min(1, host.scrollTop / scrollable))
    }

    // Scroll fires far more often than a frame can paint, so the read of
    // layout properties is coalesced into one per frame. Reading scrollTop
    // synchronously on every event is what makes naive scroll handlers janky.
    const onScroll = () => {
      if (frame.current !== 0) return
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        measure()
      })
    }

    measure()
    host.addEventListener('scroll', onScroll, { passive: true })

    const observer = new ResizeObserver(measure)
    observer.observe(host)

    return () => {
      host.removeEventListener('scroll', onScroll)
      observer.disconnect()
      if (frame.current !== 0) cancelAnimationFrame(frame.current)
    }
  }, [scrollHost])

  return (
    <div className="rail" aria-hidden="true">
      <div className="rail-base" />
      <div className="rail-fill" style={{ transform: `scaleY(${progress})` }} />
      <div className="rail-thumb" style={{ top: `${progress * 100}%` }} />
    </div>
  )
}
