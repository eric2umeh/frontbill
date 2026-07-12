'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, X } from 'lucide-react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallAppBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)
    if (sessionStorage.getItem('pwa_install_dismissed') === '1') {
      setDismissed(true)
    }

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall)
  }, [])

  if (isStandalone || dismissed || !deferred) return null

  const install = async () => {
    await deferred.prompt()
    setDeferred(null)
  }

  return (
    <div className="mx-4 mt-2 mb-0 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <Download className="h-4 w-4 shrink-0 text-primary" />
        <span>
          Install <strong>FrontBill</strong> on your device — use browser menu → <strong>Add to Home Screen</strong>.
        </span>
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" variant="default" className="h-8" onClick={() => void install()}>
          Install
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2"
          onClick={() => {
            sessionStorage.setItem('pwa_install_dismissed', '1')
            setDismissed(true)
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
