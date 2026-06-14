'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import type { PaginatedListFilter } from '@/lib/hooks/use-paginated-list'

type TableListControlsProps = {
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  filters?: PaginatedListFilter[]
  activeFilters?: Record<string, string>
  onFilterChange?: (key: string, value: string) => void
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  startIndex: number
  pageSize: number
  totalCount: number
  hideSearch?: boolean
  hidePagination?: boolean
  /** toolbar = search/filters/count; pagination = page buttons only; all = everything */
  section?: 'all' | 'toolbar' | 'pagination'
  className?: string
}

export function TableListControls({
  search = '',
  onSearchChange,
  searchPlaceholder = 'Search…',
  filters = [],
  activeFilters = {},
  onFilterChange,
  page,
  totalPages,
  onPageChange,
  startIndex,
  pageSize,
  totalCount,
  hideSearch = false,
  hidePagination = false,
  section = 'all',
  className,
}: TableListControlsProps) {
  const showToolbar = section !== 'pagination' && (!hideSearch || filters.length > 0)
  const showCount = section !== 'pagination'
  const showPagination =
    section !== 'toolbar' && !hidePagination && totalPages > 1

  const end = Math.min(startIndex + pageSize, totalCount)

  return (
    <div className={className ?? 'space-y-3'}>
      {showToolbar && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!hideSearch && onSearchChange && (
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
          {filters.length > 0 && onFilterChange && (
            <div className="flex flex-wrap gap-2">
              {filters.map((filter) => (
                <Select
                  key={filter.key}
                  value={activeFilters[filter.key] || 'all'}
                  onValueChange={(value) => onFilterChange(filter.key, value)}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder={filter.label} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All {filter.label}</SelectItem>
                    {filter.options.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ))}
            </div>
          )}
        </div>
      )}

      {showCount && (
        <div className="text-sm text-muted-foreground">
          {totalCount === 0 ? (
            <span>No matching results</span>
          ) : (
            <span>
              Showing {startIndex + 1}–{end} of {totalCount}
            </span>
          )}
        </div>
      )}

      {showPagination && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (p) =>
                    p === 1 || p === totalPages || Math.abs(p - page) <= 1,
                )
                .map((p, index, array) => (
                  <div key={p} className="flex items-center">
                    {index > 0 && array[index - 1] !== p - 1 && (
                      <span className="px-2 text-muted-foreground">…</span>
                    )}
                    <Button
                      variant={page === p ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => onPageChange(p)}
                      className="w-9 h-9"
                    >
                      {p}
                    </Button>
                  </div>
                ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
        </div>
      )}
    </div>
  )
}
