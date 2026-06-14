import { useEffect, useMemo, useState } from 'react'

export interface PaginatedListFilter {
  key: string
  label: string
  options: { value: string; label: string }[]
}

export interface UsePaginatedListOptions<T> {
  items: T[]
  pageSize?: number
  search?: string
  searchKeys?: (keyof T & string)[]
  searchMatch?: (item: T, query: string) => boolean
  activeFilters?: Record<string, string>
  filterMatch?: (item: T, filterKey: string, filterValue: string) => boolean | undefined
}

export function usePaginatedList<T extends Record<string, unknown>>({
  items,
  pageSize = 15,
  search = '',
  searchKeys = [],
  searchMatch,
  activeFilters = {},
  filterMatch,
}: UsePaginatedListOptions<T>) {
  const [page, setPage] = useState(1)
  const filterKey = JSON.stringify(activeFilters)

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (q) {
        const matchesSearch = searchMatch
          ? searchMatch(item, search)
          : searchKeys.length === 0
            ? true
            : searchKeys.some((key) => String(item[key] ?? '').toLowerCase().includes(q))
        if (!matchesSearch) return false
      }
      for (const [key, value] of Object.entries(activeFilters)) {
        if (!value || value === 'all') continue
        const custom = filterMatch?.(item, key, value)
        if (custom !== undefined) {
          if (!custom) return false
          continue
        }
        if (String(item[key] ?? '').toLowerCase() !== value.toLowerCase()) return false
      }
      return true
    })
  }, [items, search, searchKeys, searchMatch, activeFilters, filterMatch])

  const totalCount = filteredItems.length
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  useEffect(() => {
    setPage(1)
  }, [search, filterKey, pageSize])

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages))
  }, [totalPages])

  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * pageSize
  const paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize)

  return {
    filteredItems,
    paginatedItems,
    page: safePage,
    setPage,
    totalPages,
    totalCount,
    startIndex,
    pageSize,
  }
}
