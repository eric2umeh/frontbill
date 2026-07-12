'use client'

import { useEffect } from 'react'

/**
 * @deprecated Do not use for browser tab favicon — tab stays FrontBill (`app/layout.tsx` icons).
 * Hotel logos belong on receipts and in-app shell only.
 */
export function BrandingFavicon({ href: _href }: { href: string | null | undefined }) {
  useEffect(() => {
    if (typeof document === 'undefined') return
    // Clear any legacy hotel favicon override from older builds.
    document.querySelector<HTMLLinkElement>('link[data-frontbill-brand-icon="1"]')?.remove()
  }, [])

  return null
}
