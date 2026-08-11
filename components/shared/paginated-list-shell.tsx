'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  usePaginatedList,
  type PaginatedListFilter,
} from '@/lib/hooks/use-paginated-list'
import { TableListControls } from '@/components/shared/table-list-controls'

export type PaginatedListShellContext = {
  search: string
  activeFilters: Record<string, string>
}

type PaginatedListShellProps<T extends object> = {
  items: T[]
  pageSize?: number
  searchPlaceholder?: string
  searchKeys?: (keyof T & string)[]
  searchMatch?: (item: T, query: string) => boolean
  filters?: PaginatedListFilter[]
  filterMatch?: (item: T, filterKey: string, filterValue: string) => boolean | undefined
  hideSearch?: boolean
  emptyMessage?: string
  /** When set, replaces the search box value (e.g. deep-link to an item). */
  seedSearch?: string
  /**
   * When this value changes (e.g. department pill), jump to page 1 without
   * remounting row inputs (remount + blur was wiping the draft basket).
   */
  resetKey?: string | number
  children: (paginatedItems: T[], ctx: PaginatedListShellContext) => ReactNode
}

export function PaginatedListShell<T extends object>({
  items,
  pageSize = 15,
  searchPlaceholder = 'Search…',
  searchKeys = [],
  searchMatch,
  filters = [],
  filterMatch,
  hideSearch = false,
  emptyMessage = 'No matching results',
  seedSearch,
  resetKey,
  children,
}: PaginatedListShellProps<T>) {
  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})

  useEffect(() => {
    if (seedSearch == null) return
    setSearch(seedSearch)
  }, [seedSearch])

  const { paginatedItems, page, setPage, totalPages, totalCount, startIndex } = usePaginatedList({
    items,
    pageSize,
    search,
    searchKeys,
    searchMatch,
    activeFilters,
    filterMatch,
  })

  useEffect(() => {
    if (resetKey === undefined) return
    setPage(1)
  }, [resetKey, setPage])

  return (
    <div className="space-y-3">
      <TableListControls
        section="toolbar"
        search={search}
        onSearchChange={hideSearch ? undefined : setSearch}
        searchPlaceholder={searchPlaceholder}
        hideSearch={hideSearch}
        filters={filters}
        activeFilters={activeFilters}
        onFilterChange={(key, value) =>
          setActiveFilters((prev) => ({ ...prev, [key]: value }))
        }
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        startIndex={startIndex}
        pageSize={pageSize}
        totalCount={totalCount}
      />
      {paginatedItems.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        children(paginatedItems, { search, activeFilters })
      )}
      {totalPages > 1 && (
        <TableListControls
          section="pagination"
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          startIndex={startIndex}
          pageSize={pageSize}
          totalCount={totalCount}
        />
      )}
    </div>
  )
}
