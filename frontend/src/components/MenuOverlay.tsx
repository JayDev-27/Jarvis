import { useEffect } from 'react'
import { CloseIcon } from './Icons'

type Item = { label: string; hint: string; onSelect: () => void }

/** Full-bleed navigation sheet with oversized type. */
export function MenuOverlay({ open, onClose, items }: { open: boolean; onClose: () => void; items: Item[] }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div
      className={`fixed inset-0 z-50 transition-[visibility] ${open ? 'visible' : 'invisible delay-700'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      aria-hidden={!open}
    >
      <div
        className={`absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-500 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      <nav
        className={`absolute right-3 top-3 flex max-h-[calc(100dvh-24px)] w-[min(560px,calc(100vw-24px))] flex-col overflow-y-auto rounded-[28px] bg-surface p-6 shadow-2xl transition-all duration-700 ease-[cubic-bezier(0.76,0,0.24,1)] sm:p-8 ${
          open ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'
        }`}
      >
        <div className="mb-8 flex items-center justify-between">
          <p className="eyebrow">Navigate</p>
          <button className="icon-btn" onClick={onClose} aria-label="Close menu" tabIndex={open ? 0 : -1}><CloseIcon /></button>
        </div>
        <ul className="space-y-1">
          {items.map((item, i) => (
            <li
              key={item.label}
              className="transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
              style={{ transitionDelay: open ? `${120 + i * 60}ms` : '0ms', opacity: open ? 1 : 0, transform: open ? 'none' : 'translateY(20px)' }}
            >
              <button
                tabIndex={open ? 0 : -1}
                onClick={() => { item.onSelect(); onClose() }}
                className="group flex w-full items-baseline justify-between gap-4 border-b border-line py-4 text-left"
              >
                <span className="display text-4xl transition-transform duration-500 group-hover:translate-x-2 group-hover:text-accent sm:text-5xl">
                  {item.label}
                </span>
                <span className="text-xs text-muted">{item.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-sm text-muted">
          Hold <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs">Space</kbd> anywhere to talk.
        </p>
      </nav>
    </div>
  )
}
