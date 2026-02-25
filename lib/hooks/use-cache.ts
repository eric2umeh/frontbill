import { useRef, useCallback } from 'react'

interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl: number // Time to live in milliseconds
}

export function useCache<T>(ttl: number = 5 * 60 * 1000) {
  const cacheRef = useRef<Map<string, CacheEntry<T>>>(new Map())

  const get = useCallback((key: string): T | null => {
    const entry = cacheRef.current.get(key)
    if (!entry) return null

    const isExpired = Date.now() - entry.timestamp > entry.ttl
    if (isExpired) {
      cacheRef.current.delete(key)
      return null
    }

    return entry.data
  }, [])

  const set = useCallback((key: string, data: T) => {
    cacheRef.current.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })
  }, [ttl])

  const clear = useCallback((key?: string) => {
    if (key) {
      cacheRef.current.delete(key)
    } else {
      cacheRef.current.clear()
    }
  }, [])

  return { get, set, clear }
}

// Global cache for shared data across components
const globalCache = new Map<string, CacheEntry<any>>()

export function useGlobalCache<T>(ttl: number = 5 * 60 * 1000) {
  const get = useCallback((key: string): T | null => {
    const entry = globalCache.get(key)
    if (!entry) return null

    const isExpired = Date.now() - entry.timestamp > entry.ttl
    if (isExpired) {
      globalCache.delete(key)
      return null
    }

    return entry.data
  }, [])

  const set = useCallback((key: string, data: T) => {
    globalCache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    })
  }, [ttl])

  const clear = useCallback((key?: string) => {
    if (key) {
      globalCache.delete(key)
    } else {
      globalCache.clear()
    }
  }, [])

  return { get, set, clear }
}
