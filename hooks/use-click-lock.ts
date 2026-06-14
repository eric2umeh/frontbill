'use client'

import { useCallback, useRef, useState } from 'react'

function isPromiseLike(v: unknown): v is PromiseLike<unknown> {
  return v != null && typeof v === 'object' && 'then' in v && typeof (v as PromiseLike<unknown>).then === 'function'
}

/** Prevents double-submit until async work finishes (plus optional cooldown). */
export function useClickLock(cooldownMs = 600) {
  const lockedRef = useRef(false)
  const [locked, setLocked] = useState(false)

  const run = useCallback(
    async (fn: () => void | Promise<void>) => {
      if (lockedRef.current) return false
      lockedRef.current = true
      setLocked(true)
      try {
        await fn()
      } finally {
        window.setTimeout(() => {
          lockedRef.current = false
          setLocked(false)
        }, cooldownMs)
      }
      return true
    },
    [cooldownMs],
  )

  return { locked, run, isPromiseLike }
}
