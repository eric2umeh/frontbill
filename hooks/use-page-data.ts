'use client'

import { useState, useCallback, useRef } from 'react'

/**
 * usePageData — solves the "spinner on refetch" problem permanently.
 *
 * - `initialLoading` is true ONLY on the very first fetch (mounts spinner).
 * - `refreshing`     is true on every subsequent fetch (silent background refresh).
 * - Calling `refresh()` never shows the full-page spinner again.
 */
export function usePageData() {
  const hasFetchedOnce = useRef(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const startFetch = useCallback(() => {
    if (!hasFetchedOnce.current) {
      setInitialLoading(true)
    } else {
      setRefreshing(true)
    }
  }, [])

  const endFetch = useCallback(() => {
    if (!hasFetchedOnce.current) {
      hasFetchedOnce.current = true
      setInitialLoading(false)
    } else {
      setRefreshing(false)
    }
  }, [])

  return { initialLoading, refreshing, startFetch, endFetch }
}
