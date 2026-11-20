import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { API_BASE, setApiBase } from './config'
import { ArrowUpIcon, GearIcon, MicIcon, MoonIcon, StopIcon, SunIcon } from './components/Icons'
import { Loader } from './components/Loader'
import { MenuOverlay } from './components/MenuOverlay'
import { OrbScene, type OrbMode } from './components/OrbScene'
import { Card, ProviderGrid, Row, Spectrum, StatusDot, Terminal, type ProviderHealth } from './components/Panels'
import { SettingsModal, type ProviderChoice } from './components/SettingsModal'
import { useDubbedAudio } from './hooks/useDubbedAudio'
import { usePersistentState } from './hooks/usePersistentState'
import { useSpeechToText } from './hooks/useSpeechToText'

type Turn = { role: 'user' | 'assistant'; content: string }

const NO_PROVIDERS: ProviderHealth = { groq: false, mistral: false, openrouter: false, ollama: false }

const SUGGESTIONS = ['Open YouTube', "What's on my Desktop?", 'Check my battery', 'Take a screenshot', 'Tell me something witty']

function weatherLabel(code?: number) {
  if (code === undefined) return 'Unknown'
  if (code === 0) return 'Clear'
  if (code <= 3) return 'Cloudy'
  if (code <= 55) return 'Drizzle'
  if (code <= 67) return 'Rain'
  if (code <= 77) return 'Snow'
  if (code <= 82) return 'Showers'
  return 'Storm'
}

function dayGreeting(time: Date) {
  const h = time.getHours()
  if (h < 5) return 'Up late'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** Splits a line into words that rise into place one after another. */
function RevealWords({ text, delay = 0, className = '' }: { text: string; delay?: number; className?: string }) {
  return (
    <span className={className} aria-label={text}>
      {text.split(' ').map((w, i) => (
        <span key={`${w}-${i}`} className="word" aria-hidden>
          <span style={{ animationDelay: `${delay + i * 70}ms` }}>{w}&nbsp;</span>
        </span>
      ))}
    </span>
  )
}

function App() {
  // ── Persisted preferences ────────────────────────────────────────────────
  const [theme, setTheme] = usePersistentState<'light' | 'dark'>('jarvis.theme', document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const [hotkey, setHotkey] = usePersistentState('jarvis.hotkey', 'Space')
  const [holdToTalk, setHoldToTalk] = usePersistentState('jarvis.holdToTalk', true)
  const [ttsEnabled, setTtsEnabled] = usePersistentState('jarvis.ttsEnabled', true)
  const [ttsRate, setTtsRate] = usePersistentState('jarvis.ttsRate', 1)
  const [playVoicePrefix, setPlayVoicePrefix] = usePersistentState('jarvis.voicePrefix', false)
  const [strictCloneMode, setStrictCloneMode] = usePersistentState('jarvis.strictClone', false)
  const [continuousMode, setContinuousMode] = usePersistentState('jarvis.continuous', false)
  const [selectedProvider, setSelectedProvider] = usePersistentState<ProviderChoice>('jarvis.provider', 'auto')
  const [selectedModel, setSelectedModel] = usePersistentState('jarvis.model', '')

  // ── UI state ─────────────────────────────────────────────────────────────
  const [loaded, setLoaded] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const reducedMotion = useReducedMotion()

  // ── Conversation ─────────────────────────────────────────────────────────
  const [history, setHistory] = useState<Turn[]>([])
  const [jarvisReply, setJarvisReply] = useState('')
  const [activeProvider, setActiveProvider] = useState('')
  const [typedCommand, setTypedCommand] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const [actionStatus, setActionStatus] = useState<string | null>(null)

  // ── Telemetry ────────────────────────────────────────────────────────────
  const [time, setTime] = useState(() => new Date())
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null)
  const [weather, setWeather] = useState<{ temp?: number; label?: string }>({})
  const [locationName, setLocationName] = useState('Local system')
  const [locationSub, setLocationSub] = useState('Location not shared')
  const [backendOnline, setBackendOnline] = useState(false)
  const [providerHealth, setProviderHealth] = useState<ProviderHealth>(NO_PROVIDERS)
  const [fftHistory, setFftHistory] = useState<Array<{ b: number; m: number; t: number }>>([])
  const [apiVersion, setApiVersion] = useState(0)

  // ── Voice output ─────────────────────────────────────────────────────────
  const [ttsEngine, setTtsEngine] = useState('—')
  const [ttsStatus, setTtsStatus] = useState('idle')
  const [ttsMode, setTtsMode] = useState('…')
  const [pendingAudioUrl, setPendingAudioUrl] = useState<string | null>(null)

  const dubbedAudio = useDubbedAudio()
  // Destructure the stable callbacks: the hook's return object is recreated every render,
  // so depending on it directly would retrigger effects (and restart playback) constantly.
  const { stop: stopAudio, startSession, playFromApiPath, isPlaying: isSpeaking, levelsRef: voiceLevels } = dubbedAudio
  const sendLockRef = useRef(false)

  const continuousModeRef = useRef(continuousMode)
  useEffect(() => { continuousModeRef.current = continuousMode }, [continuousMode])

  const { transcript, resultNonce, speechError, isListening, frequencyBands,
    levelsRef: micLevels, startListening, stopListening, speechSupported } = useSpeechToText()

  // Theme
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]:not([media])')?.remove()
  }, [theme])

  // Header condenses after scrolling
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Clock
  useEffect(() => {
    const t = window.setInterval(() => setTime(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  // Battery
  useEffect(() => {
    const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }
    nav.getBattery?.().then((b) => setBatteryPercent(Math.round(b.level * 100))).catch(() => {})
  }, [])

  // Weather & location (only if the user grants geolocation)
  useEffect(() => {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const lat = coords.latitude.toFixed(3)
      const lon = coords.longitude.toFixed(3)
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`)
        if (r.ok) {
          const d = await r.json()
          setWeather({ temp: d?.current?.temperature_2m, label: weatherLabel(d?.current?.weather_code) })
        }
      } catch { /* offline */ }
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat}&lon=${lon}`)
        if (r.ok) {
          const address = (await r.json())?.address
          if (address) {
            const city = address.city || address.town || address.village || address.suburb || address.county || ''
            const state = address.state || ''
            const country = address.country || ''
            if (city) { setLocationName(city); setLocationSub([state, country].filter(Boolean).join(', ')) }
            else if (state) { setLocationName(state); setLocationSub(country) }
          }
        }
      } catch { /* offline */ }
    }, () => {}, { maximumAge: 10 * 60 * 1000 })
  }, [])

  // Backend + provider health, TTS mode
  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      try {
        const r = await fetch(`${API_BASE}/health`, { cache: 'no-store' })
        if (!cancelled) setBackendOnline(r.ok)
        if (!r.ok) throw new Error('down')
      } catch {
        if (!cancelled) { setBackendOnline(false); setProviderHealth(NO_PROVIDERS) }
        return
      }
      try {
        const r = await fetch(`${API_BASE}/health/providers`)
        if (r.ok && !cancelled) {
          const d = await r.json()
          setProviderHealth({ groq: !!d.groq, mistral: !!d.mistral, openrouter: !!d.openrouter, ollama: !!d.ollama })
        }
      } catch { /* ignore */ }
      try {
        const r = await fetch(`${API_BASE}/tts/mode`)
        if (r.ok && !cancelled) setTtsMode((await r.json()).active_mode ?? '…')
      } catch { /* ignore */ }
    }
    void refresh()
    const t = window.setInterval(refresh, 20000)
    return () => { cancelled = true; window.clearInterval(t) }
  }, [apiVersion])

  // Spectrum history — sample the live refs on a fixed cadence
  useEffect(() => {
    const t = window.setInterval(() => {
      const mic = micLevels.current
      const voice = voiceLevels.current
      const src = voice.volume > mic.volume ? voice : mic
      setFftHistory((prev) => {
        const next = [...prev, { b: src.bass, m: src.mid, t: src.treble }]
        return next.length > 48 ? next.slice(-48) : next
      })
    }, 120)
    return () => window.clearInterval(t)
  }, [micLevels, voiceLevels])

  // Scroll reveal
  useEffect(() => {
    if (!loaded) return
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) } })
    }, { rootMargin: '0px 0px -8% 0px' })
    document.querySelectorAll('.reveal:not(.is-in)').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [loaded, history.length])

  // ── Send a message ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async (message: string) => {
    if (sendLockRef.current) return
    sendLockRef.current = true
    setIsThinking(true)
    stopAudio()
    setHistory((prev) => [...prev, { role: 'user', content: message }])
    try {
      const body: Record<string, unknown> = { message, history: history.slice(-20) }
      if (selectedProvider !== 'auto') body.provider = selectedProvider
      if (selectedModel) body.model = selectedModel

      const r = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const errJson = await r.json().catch(() => null)
        const detail = typeof errJson?.detail === 'string' ? errJson.detail : 'My core returned an error, Sir.'
        setJarvisReply(detail)
        setHistory((prev) => [...prev, { role: 'assistant', content: detail }])
        setActiveProvider('offline')
        return
      }
      const data = await r.json()
      const reply: string = data.reply ?? ''
      setJarvisReply(reply)
      setActiveProvider(data.provider ?? '')
      setActionStatus(data.action_status ?? null)
      setHistory((prev) => [...prev, { role: 'assistant', content: reply }])
      setBackendOnline(true)

      if (data.audio_url && ttsEnabled) {
        setTtsEngine(data.tts_provider ?? 'unknown')
        setPendingAudioUrl(data.audio_url)
        setTtsStatus(`queued (${data.tts_provider ?? '?'})`)
      } else {
        setTtsEngine(data.tts_provider ?? 'none')
        setTtsStatus(ttsEnabled ? 'no audio from backend' : 'voice disabled')
        if (continuousModeRef.current) setTimeout(() => startListening(), 600)
      }
    } catch {
      const msg = `I can't reach my core at ${API_BASE}, Sir. Start the backend with ./start.sh, then try again.`
      setJarvisReply(msg)
      setHistory((prev) => [...prev, { role: 'assistant', content: msg }])
      setActiveProvider('offline')
      setBackendOnline(false)
    } finally {
      sendLockRef.current = false
      setIsThinking(false)
    }
  }, [history, selectedProvider, selectedModel, stopAudio, ttsEnabled, startListening])

  // Stop speaking the moment the user starts talking
  useEffect(() => { if (isListening) stopAudio() }, [isListening, stopAudio])

  // Voice transcript → send
  useEffect(() => {
    if (!transcript.trim()) return
    void sendMessage(transcript)
  }, [resultNonce]) // eslint-disable-line react-hooks/exhaustive-deps

  // Voice playback
  useEffect(() => {
    if (!ttsEnabled || !pendingAudioUrl) return
    if (strictCloneMode && ttsEngine !== 'pocket-tts') {
      setTtsStatus(`strict clone blocked ${ttsEngine}`)
      setPendingAudioUrl(null)
      return
    }
    const url = pendingAudioUrl
    setPendingAudioUrl(null)
    setTtsStatus(`playing via ${ttsEngine}`)
    const run = async () => {
      const sessionId = startSession()
      try {
        if (playVoicePrefix) {
          const ok = await playFromApiPath('/tts/prefix', 1, sessionId)
          if (!ok) return
        }
        await playFromApiPath(url, ttsRate, sessionId)
        setTtsStatus(`done via ${ttsEngine}`)
      } catch (e: unknown) {
        console.error('[JARVIS] audio play error:', e)
        setTtsStatus('playback error')
      } finally {
        if (continuousModeRef.current) setTimeout(() => startListening(), 400)
      }
    }
    void run()
  }, [ttsEnabled, pendingAudioUrl, ttsEngine, strictCloneMode, playVoicePrefix, ttsRate, startSession, playFromApiPath, startListening])

  const toggleMic = useCallback(() => {
    if (isListening) stopListening()
    else { stopAudio(); startListening() }
  }, [isListening, stopListening, stopAudio, startListening])

  // ── Push-to-talk hotkey (e.g. "Space", "Meta+J") ─────────────────────────
  const hotkeyPressedRef = useRef(false)
  useEffect(() => {
    const norm = hotkey.toLowerCase().replace(/\s+/g, '')
    const key = norm.split('+').pop()
    if (!key) return
    const isSpaceKey = key === 'space' || key === 'spacebar'
    const needsMeta = norm.includes('meta') || norm.includes('cmd')
    const blocked = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON' || target.isContentEditable || isSettingsOpen || isMenuOpen
    }
    const matches = (e: KeyboardEvent) => (isSpaceKey ? e.key === ' ' || e.code === 'Space' : e.key.toLowerCase() === key)

    const onDown = (e: KeyboardEvent) => {
      if (blocked(e) || (needsMeta && !e.metaKey) || !matches(e)) return
      e.preventDefault()
      if (e.repeat) return
      hotkeyPressedRef.current = true
      if (holdToTalk) { stopAudio(); startListening() }
      else toggleMic()
    }
    const onUp = (e: KeyboardEvent) => {
      if (!matches(e) || !hotkeyPressedRef.current) return
      e.preventDefault()
      hotkeyPressedRef.current = false
      if (holdToTalk) stopListening()
    }
    const onBlur = () => {
      if (hotkeyPressedRef.current) {
        hotkeyPressedRef.current = false
        if (holdToTalk) stopListening()
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [hotkey, holdToTalk, isSettingsOpen, isMenuOpen, startListening, stopListening, stopAudio, toggleMic])

  const clearConversation = useCallback(() => {
    setHistory([]); setJarvisReply(''); setActionStatus(null); stopAudio()
  }, [stopAudio])

  const mode: OrbMode = isListening ? 'listening' : isThinking ? 'thinking' : isSpeaking ? 'speaking' : 'idle'
  const modeLabel = { idle: 'Standing by', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' }[mode]
  const hotkeyLabel = /^space(bar)?$/i.test(hotkey) ? 'Space' : hotkey

  const logs = useMemo(() => [
    `core      voice input ${speechSupported ? 'online' : 'unsupported in this browser'}`,
    `backend   ${backendOnline ? 'connected' : 'unreachable'} @ ${API_BASE}`,
    `input     ${holdToTalk ? 'hold-to-talk' : 'toggle'} · hotkey ${hotkeyLabel}`,
    `status    ${modeLabel.toLowerCase()}`,
    speechError ? `stt       error: ${speechError}` : null,
    actionStatus ? `action    ${actionStatus.slice(0, 120)}` : null,
    transcript ? `user      ${transcript}` : null,
    jarvisReply ? `jarvis    ${jarvisReply.slice(0, 120)}` : null,
    `llm       ${activeProvider || 'pending'}${selectedModel ? ' / ' + selectedModel : ''}`,
    `tts       ${ttsEngine} · ${ttsMode} · ${ttsStatus}`,
    `memory    ${history.length} turns`,
  ].filter(Boolean) as string[], [speechSupported, backendOnline, holdToTalk, hotkeyLabel, modeLabel, speechError, actionStatus,
    transcript, jarvisReply, activeProvider, selectedModel, ttsEngine, ttsMode, ttsStatus, history.length])

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })
  const onLoaded = useCallback(() => setLoaded(true), [])
  const onApiBaseChange = useCallback((v: string) => { setApiBase(v); setApiVersion((n) => n + 1) }, [])

  const submitTyped = () => {
    const cmd = typedCommand.trim()
    if (!cmd || isThinking) return
    void sendMessage(cmd)
    setTypedCommand('')
  }

  const latestUser = [...history].reverse().find((t) => t.role === 'user')?.content

  return (
    <>
      {!loaded && <Loader onDone={onLoaded} />}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className={`fixed inset-x-0 top-0 z-40 transition-all duration-500 ${scrolled ? 'bg-bg/80 backdrop-blur-xl' : ''}`}>
        <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-6 px-4 sm:h-20 sm:px-6">
          <button onClick={() => scrollTo('top')} className="flex items-center gap-2.5" aria-label="JARVIS — back to top">
            <img src="/favicon.svg" alt="" className="h-8 w-8 rounded-[9px]" />
            <span className="text-lg font-semibold tracking-[0.18em]">JARVIS</span>
          </button>
          <p className="hidden max-w-sm text-[15px] leading-snug text-ink-2 lg:block">
            A voice-first assistant that lives on your Mac, opens your apps and talks back.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-[11px] font-medium uppercase tracking-wider text-muted md:flex">
              <StatusDot on={backendOnline} pulse />
              {backendOnline ? 'Core online' : 'Core offline'}
            </span>
            <button className="icon-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
            <button className="pill pill-dark hidden sm:inline-flex" onClick={toggleMic} disabled={isThinking}>
              {isListening ? 'Stop' : 'Talk'} <span className={`h-1.5 w-1.5 rounded-full ${isListening ? 'bg-bad pulse-dot' : 'bg-current'}`} />
            </button>
            <button className="pill pill-light" onClick={() => setIsMenuOpen(true)} aria-haspopup="dialog">
              Menu <span className="flex gap-0.5"><span className="h-1 w-1 rounded-full bg-current" /><span className="h-1 w-1 rounded-full bg-current" /></span>
            </button>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero / orb ───────────────────────────────────────────────── */}
        <section id="top" className="px-3 pt-16 sm:px-6 sm:pt-20">
          <div className="relative mx-auto h-[min(80svh,860px)] min-h-[460px] max-w-[1600px] overflow-hidden rounded-[22px] bg-frame text-white sm:rounded-[28px]">
            <OrbScene micLevels={micLevels} voiceLevels={voiceLevels} mode={mode} reducedMotion={reducedMotion} />

            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-5 sm:p-7">
              <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/70">
                <span className={`h-1.5 w-1.5 rounded-full ${mode === 'idle' ? 'bg-white/50' : mode === 'listening' ? 'bg-[#ff5a7a] pulse-dot' : 'bg-[#7c86ff] pulse-dot'}`} />
                {modeLabel}
              </p>
              <div className="flex flex-wrap justify-end gap-1.5 text-[11px] uppercase tracking-wider">
                {activeProvider && activeProvider !== 'offline' && (
                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-white/80 backdrop-blur">{activeProvider}{selectedModel ? ` · ${selectedModel.split('/').pop()}` : ''}</span>
                )}
                {backendOnline && <span className="rounded-full bg-white/10 px-3 py-1.5 text-white/60 backdrop-blur">voice · {ttsMode}</span>}
              </div>
            </div>

            {!backendOnline && loaded && (
              <div className="absolute left-1/2 top-16 w-[min(92%,520px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-sm text-white/80 backdrop-blur-md sm:top-20">
                <p className="font-medium text-white">The core is offline.</p>
                <p className="mt-1 text-white/60">
                  JARVIS's brain runs on your Mac. Run <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">./start.sh</code>, then this page connects to it at <span className="font-mono text-xs">{API_BASE.replace(/^https?:\/\//, '')}</span>.
                </p>
                <div className="mt-3 flex gap-2">
                  <button className="pill !h-8 bg-white !text-[11px] text-black" onClick={() => setIsSettingsOpen(true)}>Connection settings</button>
                  <a className="pill !h-8 border border-white/20 !text-[11px] text-white" href="https://github.com/JayDev-27/Jarvis#-quick-start" target="_blank" rel="noreferrer">Setup guide</a>
                </div>
              </div>
            )}

            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-5 sm:p-8">
              {loaded && (
                <h1 className="display text-[clamp(44px,9vw,148px)]">
                  <RevealWords text={`${dayGreeting(time)},`} />
                  <br />
                  <RevealWords text="Sir." delay={180} className="text-white/45" />
                </h1>
              )}
            </div>
          </div>

          {/* crosshair rail */}
          <div className="mx-auto grid max-w-[1600px] grid-cols-4 items-center px-1 py-4 text-muted" aria-hidden>
            <span className="text-lg font-light">+</span>
            <span className="hidden text-lg font-light sm:block">+</span>
            <span className="eyebrow col-span-2 text-center sm:col-span-1">Hold {hotkeyLabel} to speak</span>
            <span className="text-right text-lg font-light">+</span>
          </div>
        </section>

        {/* ── Conversation ─────────────────────────────────────────────── */}
        <section id="conversation" className="mx-auto max-w-[1600px] px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
          <div className="grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
            <div className="reveal">
              <p className="eyebrow mb-6">01 — Latest reply</p>
              {latestUser && <p className="mb-5 text-lg text-muted">“{latestUser}”</p>}
              <p className={`display text-[clamp(30px,4.4vw,64px)] !leading-[1.04] ${isThinking ? 'animate-pulse text-muted' : ''}`}>
                {isThinking ? 'Thinking it through…' : jarvisReply || 'At your service. Ask me anything, or tell me what to open.'}
              </p>
              {actionStatus && (
                <p className="mt-6 inline-flex max-w-full items-center gap-2 rounded-full bg-accent-soft px-4 py-2 text-sm text-accent">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" /><span className="truncate">{actionStatus}</span>
                </p>
              )}
            </div>

            <div className="reveal flex flex-col">
              <div className="mb-6 flex items-center justify-between">
                <p className="eyebrow">Transcript</p>
                <p className="font-mono text-[11px] text-muted">{history.length} turns</p>
              </div>
              {history.length === 0 ? (
                <div className="card p-6">
                  <p className="text-ink-2">Try one of these to get started:</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {SUGGESTIONS.map((s) => (
                      <button key={s} onClick={() => void sendMessage(s)} disabled={isThinking} className="pill pill-light !normal-case !tracking-normal !text-sm hover:!border-accent hover:text-accent">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <ol className="max-h-[440px] space-y-3 overflow-y-auto pr-1">
                  {history.map((turn, i) => (
                    <li key={i} className={`flex ${turn.role === 'user' ? 'justify-end' : ''}`}>
                      <p className={`max-w-[85%] rounded-[20px] px-4 py-3 text-[15px] leading-relaxed ${
                        turn.role === 'user' ? 'rounded-br-md bg-ink text-bg' : 'rounded-bl-md border border-line bg-surface'
                      }`}>
                        {turn.content}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </section>

        {/* ── Telemetry ────────────────────────────────────────────────── */}
        <section id="systems" className="mx-auto max-w-[1600px] px-4 pb-40 sm:px-6">
          <div className="reveal mb-10 flex flex-col gap-4 sm:mb-14 md:flex-row md:items-end md:justify-between">
            <h2 className="display text-[clamp(40px,7vw,104px)]">Systems,<br /><span className="text-muted">at a glance.</span></h2>
            <p className="max-w-sm text-ink-2">Live readings from the browser and the local core: what JARVIS hears, which models are awake, and what it just did.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Card label="Time" index="02">
              <p className="display text-6xl tabular-nums">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              <p className="mt-2 text-muted">{time.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</p>
              <div className="mt-auto pt-6">
                <Row k="Weather" v={weather.temp !== undefined ? `${Math.round(weather.temp)}°C · ${weather.label}` : '—'} />
              </div>
            </Card>

            <Card label="Location" index="03">
              <p className="display text-4xl">{locationName}</p>
              <p className="mt-2 text-muted">{locationSub}</p>
              <div className="mt-auto pt-6">
                <Row k="Battery" v={batteryPercent !== null ? `${batteryPercent}%` : 'n/a'} />
                <Row k="Microphone" v={speechSupported ? 'Ready' : 'Unsupported'} tone={speechSupported ? 'ok' : 'bad'} />
              </div>
            </Card>

            <Card label="Assistant" index="04">
              <Row k="State" v={modeLabel} tone={mode === 'idle' ? undefined : 'accent'} />
              <Row k="Core" v={backendOnline ? 'Online' : 'Offline'} tone={backendOnline ? 'ok' : 'bad'} />
              <Row k="Routing" v={selectedProvider === 'auto' ? 'Auto' : selectedProvider} />
              <Row k="Last model" v={activeProvider || '—'} />
              <Row k="Voice" v={ttsEnabled ? `${ttsEngine} · ${ttsRate.toFixed(1)}×` : 'Muted'} />
              <Row k="Conversation" v={continuousMode ? 'Continuous' : 'Single turn'} />
            </Card>

            <Card label="Providers" index="05">
              <ProviderGrid health={providerHealth} active={activeProvider} />
              <button onClick={() => setIsSettingsOpen(true)} className="mt-auto flex items-center gap-2 pt-5 text-sm text-muted hover:text-ink">
                <GearIcon size={15} /> Choose model
              </button>
            </Card>

            <Card label="Spectrum" index="06" className="xl:col-span-2">
              <Spectrum history={fftHistory} />
            </Card>

            <Card label="Terminal" index="07" className="xl:col-span-2">
              <Terminal lines={logs} onClear={clearConversation} />
            </Card>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <footer className="overflow-hidden border-t border-line pb-32 pt-12">
          <div className="flex w-max animate-[marquee_40s_linear_infinite] gap-12 whitespace-nowrap motion-reduce:animate-none" aria-hidden>
            {Array.from({ length: 2 }).map((_, k) => (
              <p key={k} className="display text-[clamp(64px,14vw,220px)] text-ink/90">
                Just A Rather Very Intelligent System <span className="text-accent">●</span> Just A Rather Very Intelligent System <span className="text-accent">●</span>
              </p>
            ))}
          </div>
          <div className="mx-auto mt-10 flex max-w-[1600px] flex-col gap-3 px-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p>Runs locally · Groq · Mistral · OpenRouter · Ollama · Pocket-TTS</p>
            <a href="https://github.com/JayDev-27/Jarvis" target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-ink hover:underline">Source on GitHub ↗</a>
          </div>
        </footer>
      </main>

      {/* ── Composer ───────────────────────────────────────────────────── */}
      <form
        onSubmit={(e) => { e.preventDefault(); submitTyped() }}
        className="fixed bottom-4 left-1/2 z-30 flex w-[min(640px,calc(100vw-24px))] -translate-x-1/2 items-center gap-2 rounded-full border border-line bg-surface/85 p-1.5 shadow-[0_24px_60px_-20px_rgba(10,10,30,0.45)] backdrop-blur-xl sm:bottom-6"
      >
        <button
          type="button"
          onClick={toggleMic}
          disabled={isThinking || !speechSupported}
          aria-label={isListening ? 'Stop listening' : 'Start listening'}
          aria-pressed={isListening}
          className={`relative isolate grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors disabled:opacity-40 ${
            isListening ? 'ripple bg-bad text-white' : 'bg-accent text-white hover:brightness-110'
          }`}
        >
          {isListening ? <StopIcon size={16} /> : <MicIcon size={18} />}
        </button>
        <input
          value={typedCommand}
          onChange={(e) => setTypedCommand(e.target.value)}
          disabled={isThinking}
          className="min-w-0 flex-1 bg-transparent px-2 text-[15px] outline-none placeholder:text-muted disabled:opacity-50"
          placeholder={isListening ? 'Listening…' : isThinking ? 'Thinking…' : 'Ask JARVIS anything…'}
          aria-label="Message JARVIS"
        />
        <button
          type="submit"
          disabled={!typedCommand.trim() || isThinking}
          aria-label="Send"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-bg transition-opacity disabled:opacity-25"
        >
          <ArrowUpIcon />
        </button>
      </form>

      <MenuOverlay
        open={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        items={[
          { label: 'Orb', hint: 'Talk', onSelect: () => scrollTo('top') },
          { label: 'Conversation', hint: `${history.length} turns`, onSelect: () => scrollTo('conversation') },
          { label: 'Systems', hint: 'Telemetry', onSelect: () => scrollTo('systems') },
          { label: 'Settings', hint: 'Voice · Model', onSelect: () => setIsSettingsOpen(true) },
          { label: 'Reset', hint: 'Clear memory', onSelect: clearConversation },
        ]}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        hotkey={hotkey} holdToTalk={holdToTalk} ttsEnabled={ttsEnabled}
        ttsRate={ttsRate} playVoicePrefix={playVoicePrefix}
        strictCloneMode={strictCloneMode} continuousMode={continuousMode}
        selectedProvider={selectedProvider} selectedModel={selectedModel}
        providerHealth={providerHealth} backendOnline={backendOnline}
        onClose={() => setIsSettingsOpen(false)}
        onHotkeyChange={setHotkey} onHoldToTalkChange={setHoldToTalk}
        onTtsEnabledChange={setTtsEnabled} onTtsRateChange={setTtsRate}
        onPlayVoicePrefixChange={setPlayVoicePrefix}
        onStrictCloneModeChange={setStrictCloneMode}
        onContinuousModeChange={setContinuousMode}
        onProviderChange={setSelectedProvider} onModelChange={setSelectedModel}
        onApiBaseChange={onApiBaseChange}
      />
    </>
  )
}

export default App
