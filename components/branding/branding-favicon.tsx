'use client'

import { useEffect } from 'react'

/**
 * Sets document favicon to the hotel logo when a URL is available.
 * Removes the injected link when cleared so the default app icon applies again.
 */
export function BrandingFavicon({ href }: { href: string | null | undefined }) {
  useEffect(() => {
    if (typeof document === 'undefined') return

    const existing = document.querySelector<HTMLLinkElement>('link[data-frontbill-brand-icon="1"]')
    const safe = typeof href === 'string' && (href.startsWith('https://') || href.startsWith('http://'))

    if (!safe) {
      existing?.remove()
      return
    }

    let link = existing
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      link.setAttribute('data-frontbill-brand-icon', '1')
      document.head.appendChild(link)
    }
    link.href = href
  }, [href])

  return null
}
