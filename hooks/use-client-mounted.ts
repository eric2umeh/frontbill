'use client'

import { useEffect, useState } from 'react'

/** True after the first client paint — use to defer Radix UI that generates unstable SSR ids. */
export function useClientMounted() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}
