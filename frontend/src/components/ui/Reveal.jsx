import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

/**
 * Reveal — animates children into view on scroll (fade + slide).
 * Lightweight: uses IntersectionObserver + CSS transitions, no dependency.
 *
 * Fail-safe by design — content is NEVER left hidden:
 *  - Anything already inside the viewport on mount shows instantly (no fade-in
 *    flash, so headings are clearly visible without any scroll/hover).
 *  - A safety timer force-shows content if the observer never fires.
 *  - Respects prefers-reduced-motion (instant visibility).
 */
export default function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
  as: Comp = 'div',
  once = true,
  ...props
}) {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)

  // Show immediately (before paint) if already in view — avoids hidden headings.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const rect = el.getBoundingClientRect()
    const inView = rect.top < (window.innerHeight || 0) && rect.bottom > 0
    if (reduce || inView) setShown(true)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || shown) return

    if (!('IntersectionObserver' in window)) {
      setShown(true)
      return
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          if (once) io.disconnect()
        } else if (!once) {
          setShown(false)
        }
      },
      { threshold: 0, rootMargin: '0px 0px -5% 0px' }
    )
    io.observe(el)

    // Safety net: never leave content hidden if the observer misfires.
    const t = setTimeout(() => setShown(true), 900)

    return () => {
      io.disconnect()
      clearTimeout(t)
    }
  }, [once, shown])

  return (
    <Comp
      ref={ref}
      className={cn('transition-all duration-700 ease-out will-change-transform', className)}
      style={{
        transitionDelay: `${delay}ms`,
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : `translateY(${y}px)`,
      }}
      {...props}
    >
      {children}
    </Comp>
  )
}
