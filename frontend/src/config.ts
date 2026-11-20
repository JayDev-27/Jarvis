// Central config — change once, applies everywhere.
//
// The backend always runs on the user's own machine (it controls macOS apps and files),
// so even the hosted UI talks to http://127.0.0.1:8000 by default. Users can point the
// UI at a different backend from Settings → Connection; that override lives in localStorage.

export const DEFAULT_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://127.0.0.1:8000'

const STORAGE_KEY = 'jarvis.apiBase'

function readOverride(): string | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    return v && /^https?:\/\//.test(v) ? v.replace(/\/+$/, '') : null
  } catch {
    return null
  }
}

export let API_BASE = readOverride() ?? DEFAULT_API_BASE

export function setApiBase(next: string) {
  const clean = next.trim().replace(/\/+$/, '')
  API_BASE = clean || DEFAULT_API_BASE
  try {
    if (!clean || clean === DEFAULT_API_BASE) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, clean)
  } catch { /* storage unavailable — keep in-memory value */ }
}
