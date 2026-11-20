import { useEffect, useState } from 'react'

/** useState that survives reloads. Falls back to in-memory state when storage is unavailable. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch { /* ignore */ }
  }, [key, value])

  return [value, setValue] as const
}
