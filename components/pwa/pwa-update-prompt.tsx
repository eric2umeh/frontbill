'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

const KNOWN_VERSION_KEY = 'frontbill_pwa_version'
const SNOOZE_KEY = 'frontbill_pwa_update_snooze'
const SNOOZE_MS = 4 * 60 * 60 * 1000

function isInstalledPwa() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

async function fetchServerVersion(): Promise<string | null> {
  try {
    const res = await fetch('/api/app-version', { cache: 'no-store' })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: string }
    return data.version?.trim() || null
  } catch {
    return null
  }
}

export function PwaUpdatePrompt() {
  const [visible, setVisible] = useState(false)
  const [reloading, setReloading] = useState(false)

  const checkForUpdate = useCallback(async () => {
    if (typeof window === 'undefined') return
    if (!isInstalledPwa()) return

    const serverVersion = await fetchServerVersion()
    if (!serverVersion || serverVersion === 'dev') return

    const known = localStorage.getItem(KNOWN_VERSION_KEY)
    if (!known) {
      localStorage.setItem(KNOWN_VERSION_KEY, serverVersion)
      return
    }
    if (known === serverVersion) {
      localStorage.removeItem(SNOOZE_KEY)
      return
    }
    const snoozeUntil = Number(localStorage.getItem(SNOOZE_KEY) || 0)
    if (snoozeUntil > Date.now()) return
    setVisible(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (process.env.NODE_ENV !== 'production') return

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
    }

    void checkForUpdate()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkForUpdate()
    }
    const onFocus = () => void checkForUpdate()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    const interval = window.setInterval(() => void checkForUpdate(), 3 * 60 * 1000)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
      window.clearInterval(interval)
    }
  }, [checkForUpdate])

  const reloadApp = async () => {
    setReloading(true)
    try {
      const serverVersion = await fetchServerVersion()
      if (serverVersion) localStorage.setItem(KNOWN_VERSION_KEY, serverVersion)

      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration()
        reg?.waiting?.postMessage('SKIP_WAITING')
      }
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
    } finally {
      window.location.reload()
    }
  }

  if (!visible) return null

  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-lg rounded-xl border border-primary/30 bg-background p-3 shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-4"
    >
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">FrontBill has an update</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Reload to get the latest screens and fixes. Your login stays signed in.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" className="h-8" disabled={reloading} onClick={() => void reloadApp()}>
              {reloading ? 'Reloading…' : 'Reload now'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={reloading}
              onClick={() => {
                localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS))
                setVisible(false)
              }}
            >
              Later
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
