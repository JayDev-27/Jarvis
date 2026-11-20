import { type ReactNode, useEffect, useRef } from 'react'

export type ProviderHealth = { groq: boolean; mistral: boolean; openrouter: boolean; ollama: boolean }

export function Card({ label, index, children, className = '' }: { label: string; index?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`card reveal flex flex-col p-5 sm:p-6 ${className}`}>
      <header className="mb-5 flex items-center justify-between">
        <p className="eyebrow">{label}</p>
        {index && <span className="font-mono text-[11px] text-muted">{index}</span>}
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  )
}

export function Row({ k, v, tone }: { k: string; v: ReactNode; tone?: 'ok' | 'bad' | 'warn' | 'accent' }) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'accent' ? 'text-accent' : 'text-ink'
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 text-sm first:border-t-0">
      <span className="text-muted">{k}</span>
      <span className={`truncate text-right font-medium ${color}`}>{v}</span>
    </div>
  )
}

export function StatusDot({ on, pulse }: { on: boolean; pulse?: boolean }) {
  return (
    <span className={`inline-block h-2 w-2 rounded-full ${on ? 'bg-ok' : 'bg-line-strong'} ${pulse && on ? 'pulse-dot' : ''}`} />
  )
}

const PROVIDER_LABELS: Record<keyof ProviderHealth, string> = {
  groq: 'Groq', mistral: 'Mistral', openrouter: 'OpenRouter', ollama: 'Ollama',
}

export function ProviderGrid({ health, active }: { health: ProviderHealth; active: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(Object.keys(PROVIDER_LABELS) as Array<keyof ProviderHealth>).map((id) => (
        <div
          key={id}
          className={`flex items-center justify-between rounded-2xl border px-3.5 py-3 text-sm transition-colors ${
            active === id ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2'
          }`}
        >
          <span className="font-medium">{PROVIDER_LABELS[id]}</span>
          <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
            <StatusDot on={health[id]} />
            {health[id] ? 'Online' : 'Off'}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Rolling three-band spectrum, drawn as soft area curves. */
export function Spectrum({ history }: { history: Array<{ b: number; m: number; t: number }> }) {
  const w = 320, h = 96
  const path = (key: 'b' | 'm' | 't', gain: number) => {
    if (history.length < 2) return `M0 ${h} L${w} ${h}`
    const pts = history.map((item, i) => {
      const x = (i / (history.length - 1)) * w
      const y = h - Math.min(1, item[key] * gain) * (h - 6) - 3
      return [x, y] as const
    })
    let d = `M${pts[0][0]} ${pts[0][1]}`
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1] = pts[i]
      const cx = (x0 + x1) / 2
      d += ` C${cx} ${y0} ${cx} ${y1} ${x1} ${y1}`
    }
    return d
  }
  const series = [
    { key: 'b' as const, label: 'Bass', color: 'var(--accent)', gain: 1.4 },
    { key: 'm' as const, label: 'Mid', color: 'var(--ink)', gain: 1.8 },
    { key: 't' as const, label: 'Treble', color: 'var(--muted)', gain: 2.2 },
  ]
  const last = history[history.length - 1] ?? { b: 0, m: 0, t: 0 }
  return (
    <div className="flex flex-1 flex-col justify-between gap-4">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Live audio spectrum">
        {series.map((s) => (
          <path key={s.key} d={path(s.key, s.gain)} fill="none" stroke={s.color} strokeWidth={s.key === 'b' ? 2 : 1.4} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="grid grid-cols-3 gap-2">
        {series.map((s) => (
          <div key={s.key}>
            <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted">
              <span className="inline-block h-1.5 w-3 rounded-full" style={{ background: s.color }} />{s.label}
            </p>
            <p className="mt-1 font-mono text-lg tabular-nums">{Math.round(last[s.key] * 100)}<span className="text-xs text-muted">%</span></p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Terminal({ lines, onClear }: { lines: string[]; onClear: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])
  return (
    <div className="flex flex-1 flex-col">
      <div ref={box} className="max-h-60 min-h-40 flex-1 overflow-y-auto rounded-2xl bg-frame p-4 font-mono text-[12px] leading-relaxed text-white/80">
        {lines.map((line, i) => (
          <p key={i} className="whitespace-pre-wrap break-words">
            <span className="mr-3 select-none text-white/25">{String(i + 1).padStart(2, '0')}</span>
            {line}
          </p>
        ))}
        <p className="mt-1 text-[#7c86ff]">›<span className="pulse-dot ml-1 inline-block h-3 w-1.5 translate-y-0.5 bg-[#7c86ff]" /></p>
      </div>
      <button onClick={onClear} className="mt-3 self-start text-xs uppercase tracking-wider text-muted underline-offset-4 hover:text-bad hover:underline">
        Clear conversation
      </button>
    </div>
  )
}
