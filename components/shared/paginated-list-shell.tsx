'use client'

import { useState, type ReactNode } from 'react'
import {
  usePaginatedList,
  type PaginatedListFilter,
} from '@/lib/hooks/use-paginated-list'
import { TableListControls } from '@/components/shared/table-list-controls'

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
  children: (paginatedItems: T[]) => ReactNode
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
  children,
}: PaginatedListShellProps<T>) {
  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})

  const { paginatedItems, page, setPage, totalPages, totalCount, startIndex } = usePaginatedList({
    items,
    pageSize,
    search,
    searchKeys,
    searchMatch,
    activeFilters,
    filterMatch,
  })

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
        children(paginatedItems)
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
