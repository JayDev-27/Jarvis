import { useEffect, useState } from 'react'

/** Intro curtain: a counting preloader that lifts away once the scene is ready. */
export function Loader({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const duration = reduced ? 200 : 1500
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      // ease-in-out so the counter lingers near the ends
      const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2
      setCount(Math.round(eased * 100))
      if (p < 1) raf = requestAnimationFrame(tick)
      else {
        setLeaving(true)
        window.setTimeout(onDone, reduced ? 50 : 900)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [onDone])

  return (
    <div
      className="fixed inset-0 z-[100] bg-[#0a0a12] text-white transition-transform duration-[900ms] ease-[cubic-bezier(0.76,0,0.24,1)]"
      style={{ transform: leaving ? 'translateY(-100%)' : 'none' }}
      aria-hidden
    >
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-16 w-16">
          <span
            className="absolute inset-0 rounded-full bg-[#2b36ff] transition-transform duration-700"
            style={{ transform: `scale(${0.35 + count / 160})` }}
          />
          <span
            className="absolute -right-3 -top-3 h-3 w-3 rounded-full bg-white"
            style={{ transform: `rotate(${count * 3.6}deg) translateX(${count / 10}px)` }}
          />
        </div>
      </div>
      <p className="absolute bottom-6 left-6 display text-[22vw] leading-none tabular-nums sm:text-[14vw]">
        {String(count).padStart(3, '0')}
      </p>
      <p className="eyebrow absolute bottom-8 right-6 !text-white/50">Initialising J.A.R.V.I.S.</p>
    </div>
  )
}
