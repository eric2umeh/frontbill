'use client'

import { useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { isStandalonePwa } from '@/lib/pwa/is-standalone-pwa'
import { recordOpenSignals, recordUsageSignal } from '@/lib/usage/log-session'

/** Records app opens and install activity for operational reporting (non-blocking). */
export function AppSessionLogger() {
  const { userId } = useAuth()

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return
    const host = window.location.hostname
    if (host === 'localhost' || host === '127.0.0.1') return

    void recordOpenSignals(userId)
    void recordUsageSignal(userId, 'daily_sign_in')

    if (isStandalonePwa()) {
      void recordUsageSignal(userId, 'standalone_open')
    }

    const onInstalled = () => {
      void recordUsageSignal(userId, 'app_installed', { skipDailyDedup: true })
    }
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('frontbill:pwa-installed', onInstalled)
    return () => {
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('frontbill:pwa-installed', onInstalled)
    }
  }, [userId])

  return null
}
