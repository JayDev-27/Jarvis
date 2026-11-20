import { type ReactNode, useEffect, useRef, useState } from 'react'
import { API_BASE, DEFAULT_API_BASE } from '../config'
import { CloseIcon } from './Icons'
import type { ProviderHealth } from './Panels'

type ModelInfo = { id: string; name: string; free: boolean }

export type ProviderChoice = 'auto' | 'groq' | 'mistral' | 'openrouter' | 'ollama'

export type SettingsModalProps = {
  isOpen: boolean
  hotkey: string
  holdToTalk: boolean
  ttsEnabled: boolean
  ttsRate: number
  playVoicePrefix: boolean
  strictCloneMode: boolean
  continuousMode: boolean
  selectedProvider: ProviderChoice
  selectedModel: string
  providerHealth: ProviderHealth
  backendOnline: boolean
  onClose: () => void
  onHotkeyChange: (v: string) => void
  onHoldToTalkChange: (v: boolean) => void
  onTtsEnabledChange: (v: boolean) => void
  onTtsRateChange: (v: number) => void
  onPlayVoicePrefixChange: (v: boolean) => void
  onStrictCloneModeChange: (v: boolean) => void
  onContinuousModeChange: (v: boolean) => void
  onProviderChange: (v: ProviderChoice) => void
  onModelChange: (v: string) => void
  onApiBaseChange: (v: string) => void
}

type Tab = 'general' | 'provider' | 'keys' | 'connection'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6 first:mt-2">
      <p className="eyebrow mb-3">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 ${checked ? 'bg-accent' : 'bg-line-strong'}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function ToggleRow({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2 px-4 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  )
}

const inputCls = 'w-full rounded-2xl border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-accent'

const PROVIDERS: { id: ProviderChoice; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'groq', label: 'Groq' },
  { id: 'mistral', label: 'Mistral' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'ollama', label: 'Ollama' },
]

export function SettingsModal(props: SettingsModalProps) {
  const {
    isOpen, hotkey, holdToTalk, ttsEnabled, ttsRate, playVoicePrefix, strictCloneMode, continuousMode,
    selectedProvider, selectedModel, providerHealth, backendOnline, onClose, onHotkeyChange, onHoldToTalkChange,
    onTtsEnabledChange, onTtsRateChange, onPlayVoicePrefixChange, onStrictCloneModeChange, onContinuousModeChange,
    onProviderChange, onModelChange, onApiBaseChange,
  } = props

  const [models, setModels] = useState<ModelInfo[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [freeOnly, setFreeOnly] = useState(false)
  const [tab, setTab] = useState<Tab>('general')
  const [keys, setKeys] = useState({ groq: '', mistral: '', openrouter: '', huggingface: '' })
  const [keysStatus, setKeysStatus] = useState({ groq: false, mistral: false, openrouter: false, huggingface: false })
  const [keysMsg, setKeysMsg] = useState<string | null>(null)
  const [apiDraft, setApiDraft] = useState(API_BASE)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  useEffect(() => {
    if (tab !== 'keys' || !isOpen) return
    let active = true
    fetch(`${API_BASE}/settings/keys/status`)
      .then((r) => r.json())
      .then((status) => { if (active) setKeysStatus(status) })
      .catch(() => {})
    return () => { active = false }
  }, [tab, isOpen])

  useEffect(() => {
    if (selectedProvider === 'auto' || !isOpen) return
    let active = true
    Promise.resolve().then(() => { if (active) setLoadingModels(true) })
    fetch(`${API_BASE}/models/${selectedProvider}`)
      .then((r) => r.json())
      .then((data) => { if (active) setModels(data.models ?? []) })
      .catch(() => { if (active) setModels([]) })
      .finally(() => { if (active) setLoadingModels(false) })
    return () => { active = false }
  }, [selectedProvider, isOpen])

  // Reset the model only when the provider actually changes (not on mount / reload).
  const prevProvider = useRef(selectedProvider)
  useEffect(() => {
    if (prevProvider.current !== selectedProvider) {
      prevProvider.current = selectedProvider
      onModelChange('')
    }
  }, [selectedProvider, onModelChange])

  const visibleModels = selectedProvider === 'auto' ? [] : freeOnly ? models.filter((m) => m.free) : models

  async function saveKeys() {
    const body = {
      groq: keys.groq || null,
      mistral: keys.mistral || null,
      openrouter: keys.openrouter || null,
      huggingface: keys.huggingface || null,
    }
    try {
      const r = await fetch(`${API_BASE}/settings/keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => null)
        setKeysMsg(err?.detail ?? 'Could not save keys')
        return
      }
      setKeysMsg('Saved')
      setKeys({ groq: '', mistral: '', openrouter: '', huggingface: '' })
      const res = await fetch(`${API_BASE}/settings/keys/status`)
      setKeysStatus(await res.json())
    } catch {
      setKeysMsg('Backend unreachable')
    } finally {
      setTimeout(() => setKeysMsg(null), 2500)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'provider', label: 'Model' },
    { id: 'keys', label: 'API keys' },
    { id: 'connection', label: 'Connection' },
  ]

  return (
    <div
      className={`fixed inset-0 z-[60] flex items-end justify-center p-3 transition-[visibility] sm:items-center ${isOpen ? 'visible' : 'invisible delay-500'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      aria-hidden={!isOpen}
    >
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />
      {isOpen && (
        <div className="relative flex max-h-[min(760px,calc(100dvh-24px))] w-full max-w-xl flex-col overflow-hidden rounded-[28px] bg-surface text-ink shadow-2xl animate-[word-up_0.6s_cubic-bezier(0.2,0.8,0.2,1)_both]" style={{ transform: 'translateY(12px)' }}>
          <div className="flex items-start justify-between px-6 pb-2 pt-6 sm:px-8 sm:pt-8">
            <div>
              <p className="eyebrow">Preferences</p>
              <h2 className="display mt-2 text-4xl">Settings</h2>
            </div>
            <button onClick={onClose} className="icon-btn" aria-label="Close settings"><CloseIcon /></button>
          </div>

          <div className="flex gap-1 overflow-x-auto px-6 pt-4 sm:px-8" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`pill !h-9 !px-4 !text-[11px] ${tab === t.id ? 'pill-dark' : 'text-muted hover:text-ink'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-8 pt-4 sm:px-8">
            {tab === 'general' && (
              <>
                <Section title="Input">
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-muted">Push-to-talk hotkey</span>
                    <input value={hotkey} onChange={(e) => onHotkeyChange(e.target.value)} className={inputCls} placeholder="Space" />
                  </label>
                  <ToggleRow label="Hold to talk" hint="Off = press once to start, again to stop." checked={holdToTalk} onChange={onHoldToTalkChange} />
                  <ToggleRow label="Continuous conversation" hint="Re-open the mic automatically after each reply." checked={continuousMode} onChange={onContinuousModeChange} />
                </Section>
                <Section title="Voice">
                  <ToggleRow label="Speak replies" checked={ttsEnabled} onChange={onTtsEnabledChange} />
                  <div className="rounded-2xl border border-line bg-surface-2 px-4 py-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Speaking rate</span>
                      <span className="font-mono text-muted">{ttsRate.toFixed(1)}×</span>
                    </div>
                    <input type="range" min={0.7} max={1.3} step={0.1} value={ttsRate} onChange={(e) => onTtsRateChange(Number(e.target.value))} className="mt-2 w-full accent-[var(--accent)]" aria-label="Speaking rate" />
                  </div>
                  <ToggleRow label="Play signature prefix" hint="Plays backend/assets/jarvis.wav before every reply." checked={playVoicePrefix} onChange={onPlayVoicePrefixChange} />
                  <ToggleRow
                    label="Strict clone mode"
                    hint={strictCloneMode ? 'Only Pocket-TTS audio plays. Turn off if you hear nothing.' : 'Only allow the cloned Pocket-TTS voice.'}
                    checked={strictCloneMode}
                    onChange={onStrictCloneModeChange}
                  />
                </Section>
              </>
            )}

            {tab === 'provider' && (
              <>
                <Section title="Provider">
                  <div className="flex flex-wrap gap-2">
                    {PROVIDERS.map(({ id, label }) => {
                      const selected = selectedProvider === id
                      const online = id !== 'auto' && providerHealth[id as keyof ProviderHealth]
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => onProviderChange(id)}
                          className={`pill !h-10 !normal-case !tracking-normal !text-sm ${selected ? 'pill-accent' : 'pill-light'}`}
                        >
                          {id !== 'auto' && <span className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-ok' : 'bg-bad/60'}`} />}
                          {label}
                        </button>
                      )
                    })}
                  </div>
                  {selectedProvider === 'auto' && (
                    <p className="text-xs text-muted">Auto tries Groq → Mistral → OpenRouter → Ollama and uses the first that answers.</p>
                  )}
                </Section>

                {selectedProvider !== 'auto' && (
                  <Section title="Model">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>{loadingModels ? 'Loading…' : `${visibleModels.length} model${visibleModels.length !== 1 ? 's' : ''}`}</span>
                      <label className="flex items-center gap-2">
                        Free only <Switch checked={freeOnly} onChange={setFreeOnly} label="Free models only" />
                      </label>
                    </div>
                    <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                      <ModelRow selected={!selectedModel} name="Provider default" onClick={() => onModelChange('')} />
                      {!loadingModels && visibleModels.length === 0 && (
                        <p className="py-4 text-center text-xs text-muted">
                          {selectedProvider === 'ollama' ? 'No local Ollama models found. Is Ollama running?' : 'No models available.'}
                        </p>
                      )}
                      {visibleModels.map((m) => (
                        <ModelRow key={m.id} selected={selectedModel === m.id} name={m.name} free={m.free} onClick={() => onModelChange(m.id)} />
                      ))}
                    </div>
                  </Section>
                )}
              </>
            )}

            {tab === 'keys' && (
              <Section title="Provider API keys">
                <p className="text-xs text-muted">Keys are written to <code className="font-mono">backend/.env</code> on your machine and never leave it.</p>
                {(
                  [
                    { field: 'groq', label: 'Groq', placeholder: 'gsk_…' },
                    { field: 'mistral', label: 'Mistral', placeholder: 'sk-…' },
                    { field: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-…' },
                    { field: 'huggingface', label: 'Hugging Face', placeholder: 'hf_…' },
                  ] as const
                ).map(({ field, label, placeholder }) => (
                  <label key={field} className="block">
                    <span className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted">{label}</span>
                      <span className={keysStatus[field] ? 'text-ok' : 'text-muted'}>{keysStatus[field] ? '● Set' : '○ Not set'}</span>
                    </span>
                    <input
                      type="password"
                      value={keys[field]}
                      onChange={(e) => setKeys((prev) => ({ ...prev, [field]: e.target.value }))}
                      className={inputCls}
                      placeholder={placeholder}
                      autoComplete="off"
                    />
                  </label>
                ))}
                <button type="button" onClick={saveKeys} className="pill pill-dark mt-2 w-full justify-center">
                  {keysMsg ?? 'Save keys'}
                </button>
              </Section>
            )}

            {tab === 'connection' && (
              <Section title="Backend">
                <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm">
                  <span className={`h-2 w-2 rounded-full ${backendOnline ? 'bg-ok' : 'bg-bad'}`} />
                  {backendOnline ? 'Connected' : 'Not reachable'} · <span className="truncate font-mono text-xs text-muted">{API_BASE}</span>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-muted">Backend URL</span>
                  <input value={apiDraft} onChange={(e) => setApiDraft(e.target.value)} className={`${inputCls} font-mono`} placeholder={DEFAULT_API_BASE} spellCheck={false} />
                </label>
                <div className="flex gap-2">
                  <button className="pill pill-dark" onClick={() => onApiBaseChange(apiDraft)}>Save &amp; reconnect</button>
                  <button className="pill pill-light" onClick={() => { setApiDraft(DEFAULT_API_BASE); onApiBaseChange(DEFAULT_API_BASE) }}>Reset</button>
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  JARVIS's brain runs on your own Mac. Start it with <code className="font-mono">./start.sh</code>. When using the hosted UI, add its
                  address to <code className="font-mono">JARVIS_ALLOWED_ORIGINS</code> in <code className="font-mono">backend/.env</code> and allow local network access when your browser asks.
                </p>
              </Section>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ModelRow({ selected, name, free, onClick }: { selected: boolean; name: string; free?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm transition-colors ${
        selected ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface-2 text-ink-2 hover:border-line-strong'
      }`}
    >
      <span>{name}</span>
      {free && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ok">Free</span>}
    </button>
  )
}
