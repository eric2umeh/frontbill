'use client'

import { useState, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Search, LayoutGrid, List, ChevronLeft, ChevronRight, CalendarIcon } from 'lucide-react'
import { format, isSameDay } from 'date-fns'
import { LoadingSpinner } from '@/components/loading-screen'
import {
  calendarPickerYmd,
  isOccupyingHotelNight,
} from '@/lib/utils/booking-in-house-dates'

/** `always`: all breakpoints (horizontal scroll). `md+` / `lg+`: hide below that breakpoint to prioritize key cols on phones. */
export type ColumnResponsive = 'always' | 'md+' | 'lg+' | 'xl+'

export interface Column<T> {
  key: keyof T | string
  label: string
  render?: (item: T) => ReactNode
  responsive?: ColumnResponsive
  /** Keep visible when scrolling wide tables on phones (e.g. Actions). */
  stickyOnMobile?: boolean
  /** Optional column width for table-fixed layouts (e.g. `18%`, `8rem`). */
  width?: string
}

interface Filter {
  key: string
  label: string
  options: { value: string; label: string }[]
}

interface EnhancedDataTableProps<T> {
  /** Full catalog used when the user searches (and when `listWhenSearchEmpty` is not set). */
  data: T[]
  columns: Column<T>[]
  filters?: Filter[]
  searchKeys?: (keyof T)[]
  /** When set, used for search (overrides searchKeys substring logic when query non-empty). */
  searchMatch?: (item: T, query: string) => boolean
  /**
   * Default list when search is empty (e.g. in-house today). Non-empty search uses full `data`.
   */
  listWhenSearchEmpty?: T[]
  onSearchQueryChange?: (query: string) => void
  searchPlaceholder?: string
  /** Filter keys skipped while search is non-empty (e.g. keep Status on "in house" but search all folios). */
  filterKeysIgnoredWhileSearching?: string[]
  /**
   * Controlled filter values (e.g. parent refetches when `status` changes).
   * When set, `onControlledActiveFiltersChange` must be provided to update them.
   */
  controlledActiveFilters?: Record<string, string>
  onControlledActiveFiltersChange?: (next: Record<string, string>) => void
  renderCard?: (item: T) => ReactNode
  itemsPerPage?: number
  dateField?: keyof T
  /**
   * `field` (default): row[dateField] same calendar day as picker.
   * `stay_overlap`: in-house hotel night — check_in ≤ day < check_out (stayovers included).
   */
  dateMatchMode?: 'field' | 'stay_overlap'
  /** Required when dateMatchMode is stay_overlap (usually `check_out`). */
  checkOutField?: keyof T
  /** Label on the date picker button when no date selected. */
  datePickerPlaceholder?: string
  onDateFilterChange?: (date: Date | undefined) => void
  onRowClick?: (item: T) => void
  /** Stable row keys (defaults to row index). */
  rowKey?: (item: T, index: number) => string
  emptyState?: { title: string; description?: string }
  /** When true, empty results show a spinner instead of the empty-state copy (e.g. async catalog fetch). */
  loading?: boolean
  /** When not `undefined`, overrides default equality for that filter key + value. */
  resolveFilterMatch?: (item: T, filterKey: string, filterValue: string) => boolean | undefined
  /** Tighter cell padding (e.g. Bookings table with many actions). */
  compactTable?: boolean
  /** Prefix table with a # column (respects pagination). */
  showRowNumbers?: boolean
  /** Larger date picker button (bookings / reservations toolbar). */
  prominentDateFilter?: boolean
  /** Center search + filter row (bookings / reservations). */
  centerToolbar?: boolean
}

export function EnhancedDataTable<T extends Record<string, any>>({
  data,
  columns,
  filters = [],
  searchKeys = [],
  searchMatch,
  listWhenSearchEmpty,
  onSearchQueryChange,
  searchPlaceholder = 'Search…',
  filterKeysIgnoredWhileSearching = [],
  controlledActiveFilters,
  onControlledActiveFiltersChange,
  renderCard,
  itemsPerPage = 15,
  dateField,
  dateMatchMode = 'field',
  checkOutField,
  datePickerPlaceholder = 'Select Date',
  onDateFilterChange,
  onRowClick,
  rowKey,
  emptyState,
  loading = false,
  resolveFilterMatch,
  compactTable = false,
  showRowNumbers = false,
  prominentDateFilter = false,
  centerToolbar = false,
}: EnhancedDataTableProps<T>) {
  const columnResponsiveClass = (responsive?: ColumnResponsive): string => {
    switch (responsive) {
      case 'md+':
        return 'hidden md:table-cell'
      case 'lg+':
        return 'hidden lg:table-cell'
      case 'xl+':
        return 'hidden xl:table-cell'
      case 'always':
      default:
        return ''
    }
  }

  const columnStickyClass = (stickyOnMobile?: boolean): string =>
    stickyOnMobile
      ? 'max-md:sticky max-md:right-0 max-md:z-10 max-md:bg-background max-md:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.12)]'
      : ''

  const [searchQuery, setSearchQuery] = useState('')
  const [internalFilters, setInternalFilters] = useState<Record<string, string>>({})
  const isControlled = controlledActiveFilters !== undefined && onControlledActiveFiltersChange !== undefined
  const activeFilters = isControlled ? controlledActiveFilters : internalFilters
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()

  const qTrim = searchQuery.trim()
  const searchingFullCatalog = Boolean(
    qTrim && (listWhenSearchEmpty || filterKeysIgnoredWhileSearching.length > 0),
  )
  const baseList =
    listWhenSearchEmpty && !qTrim ? listWhenSearchEmpty : data

  // Filter and search logic
  const filteredData = baseList.filter((item) => {
    const q = qTrim.toLowerCase()
    const matchesSearch =
      !q ||
      (searchMatch
        ? searchMatch(item, searchQuery)
        : searchKeys.length === 0
          ? true
          : searchKeys.some((key) => {
              const value = item[key]
              return String(value || '').toLowerCase().includes(q)
            }))

    // Active filters
    const matchesFilters = Object.entries(activeFilters).every(([key, value]) => {
      if (!value || value === 'all') return true
      if (qTrim && filterKeysIgnoredWhileSearching.includes(key)) return true
      const custom = resolveFilterMatch?.(item, key, value)
      if (custom !== undefined) return custom
      return String(item[key] || '').toLowerCase() === value.toLowerCase()
    })

    // Date filter
    let matchesDate = true
    if (dateField && selectedDate) {
      if (dateMatchMode === 'stay_overlap' && checkOutField) {
        const dayYmd = calendarPickerYmd(selectedDate)
        const members = Array.isArray(item.bulk_members) ? item.bulk_members : null
        if (members?.length) {
          matchesDate = members.some((m: Record<string, unknown>) =>
            isOccupyingHotelNight(
              m[String(dateField)] as string,
              m[String(checkOutField)] as string,
              dayYmd,
            ),
          )
        } else {
          matchesDate = isOccupyingHotelNight(
            item[dateField],
            item[checkOutField],
            dayYmd,
          )
        }
      } else {
        matchesDate = isSameDay(new Date(item[dateField]), selectedDate)
      }
    }

    return matchesSearch && matchesFilters && matchesDate
  })

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage)
  const rowId = (item: T, index: number) => (rowKey ? rowKey(item, index) : String(index))

  const handleFilterChange = (key: string, value: string) => {
    if (isControlled) {
      onControlledActiveFiltersChange?.({ ...controlledActiveFilters!, [key]: value })
    } else {
      setInternalFilters((prev) => ({ ...prev, [key]: value }))
    }
    setCurrentPage(1)
  }

  const handleDateChange = (date: Date | undefined) => {
    setSelectedDate(date)
    setCurrentPage(1)
    onDateFilterChange?.(date)
  }

  const thClass = compactTable
    ? 'px-1 py-1 text-left text-[11px] font-medium whitespace-nowrap max-md:px-1.5 max-md:py-1'
    : 'px-4 py-2 text-left text-sm font-medium whitespace-nowrap max-md:px-2 max-md:py-1.5 max-md:text-xs'
  const tdClass = compactTable
    ? 'px-1 py-1 text-[11px] align-middle max-md:px-1.5 max-md:py-1 max-md:text-[11px] max-md:whitespace-normal'
    : 'px-4 py-2 text-sm align-middle whitespace-nowrap max-md:px-2 max-md:py-1.5 max-md:text-xs max-md:whitespace-normal'

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div
        className={
          centerToolbar
            ? 'flex flex-col gap-4 items-center'
            : 'flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'
        }
      >
        {!centerToolbar && (
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => {
              const next = e.target.value
              setSearchQuery(next)
              setCurrentPage(1)
              onSearchQueryChange?.(next)
            }}
            className="pl-9"
          />
        </div>
        )}

        <div className={`flex items-center gap-2 flex-wrap ${centerToolbar ? 'justify-center' : ''}`}>
          {centerToolbar && (
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => {
                  const next = e.target.value
                  setSearchQuery(next)
                  setCurrentPage(1)
                  onSearchQueryChange?.(next)
                }}
                className="pl-9"
              />
            </div>
          )}
          {filters.map((filter) => (
            <Select
              key={filter.key}
              value={activeFilters[filter.key] || 'all'}
              onValueChange={(value) => handleFilterChange(filter.key, value)}
            >
              <SelectTrigger className="w-[150px] max-md:w-full max-md:min-w-0">
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

          {dateField && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={
                    prominentDateFilter
                      ? 'gap-2 h-11 px-5 text-base font-medium min-w-[200px] justify-center'
                      : 'gap-2 w-[180px]'
                  }
                >
                  <CalendarIcon className={prominentDateFilter ? 'h-5 w-5' : 'h-4 w-4'} />
                  {selectedDate ? format(selectedDate, prominentDateFilter ? 'MMM dd, yyyy' : 'MMM dd') : datePickerPlaceholder}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleDateChange}
                />
                {selectedDate && (
                  <div className="p-3 border-t">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="w-full"
                      onClick={() => handleDateChange(undefined)}
                    >
                      Clear filter
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          )}

          {renderCard && (
            <div className="flex items-center gap-1 border rounded-md">
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className="h-9"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('card')}
                className="h-9"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <LoadingSpinner size="sm" />
            Loading…
          </span>
        ) : filteredData.length === 0 ? (
          <span>No matching results</span>
        ) : (
          <span>
            Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredData.length)} of{' '}
            {filteredData.length} results
            {searchingFullCatalog ? (
              <span className="text-muted-foreground/80"> · searching full list</span>
            ) : null}
          </span>
        )}
      </div>

      {/* Table or Card View */}
      {viewMode === 'table' ? (
        <div className="border rounded-lg overflow-hidden max-w-full">
          <div
            className={[
              'w-full max-w-full overflow-x-auto',
              '[scrollbar-width:thin]',
            ].join(' ')}
          >
            <table className={`w-full border-collapse ${compactTable ? 'table-auto' : 'min-w-0 table-fixed'}`}>
              <thead className="bg-muted/50">
                <tr>
                  {showRowNumbers && (
                    <th className={`${thClass} w-10 text-center tabular-nums`}>#</th>
                  )}
                  {columns.map((column) => (
                    <th
                      key={column.key.toString()}
                      className={`${thClass} ${columnResponsiveClass(column.responsive)} ${columnStickyClass(column.stickyOnMobile)}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + (showRowNumbers ? 1 : 0)} className={`${tdClass} text-center py-12 text-muted-foreground`}>
                      {loading ? (
                        <div
                          className="flex flex-col items-center justify-center gap-3 py-4"
                          role="status"
                          aria-busy="true"
                          aria-label="Loading"
                        >
                          <LoadingSpinner size="lg" />
                          <p className="text-sm text-muted-foreground">Loading…</p>
                        </div>
                      ) : (
                        <>
                          <p className="font-medium text-foreground">{emptyState?.title ?? 'No rows to display'}</p>
                          {emptyState?.description && (
                            <p className="text-sm mt-2 max-w-md mx-auto">{emptyState.description}</p>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item, index) => (
                    <tr
                      key={rowId(item, index)}
                      className={`hover:bg-muted/50 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                      onClick={() => onRowClick?.(item)}
                    >
                      {showRowNumbers && (
                        <td className={`${tdClass} w-10 text-center tabular-nums text-muted-foreground`}>
                          {startIndex + index + 1}
                        </td>
                      )}
                      {columns.map((column) => (
                        <td
                          key={column.key.toString()}
                          className={`${tdClass} ${columnResponsiveClass(column.responsive)} ${columnStickyClass(column.stickyOnMobile)}`}
                        >
                          {column.render ? column.render(item) : item[column.key]}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : renderCard ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedData.length === 0 ? (
            <div className="col-span-full border rounded-lg p-10 text-center text-muted-foreground">
              {loading ? (
                <div
                  className="flex flex-col items-center justify-center gap-3"
                  role="status"
                  aria-busy="true"
                  aria-label="Loading"
                >
                  <LoadingSpinner size="lg" />
                  <p className="text-sm text-muted-foreground">Loading…</p>
                </div>
              ) : (
                <>
                  <p className="font-medium text-foreground">{emptyState?.title ?? 'No rows to display'}</p>
                  {emptyState?.description && (
                    <p className="text-sm mt-2 max-w-md mx-auto">{emptyState.description}</p>
                  )}
                </>
              )}
            </div>
          ) : (
            paginatedData.map((item, index) => (
              <Card
                key={rowId(item, index)}
                className={onRowClick ? 'cursor-pointer transition-colors hover:bg-muted/40 hover:border-primary/30' : undefined}
                onClick={() => onRowClick?.(item)}
                role={onRowClick ? 'link' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={(e) => {
                  if (!onRowClick) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onRowClick(item)
                  }
                }}
              >
                {renderCard(item)}
              </Card>
            ))
          )}
        </div>
      ) : null}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  // Show first page, last page, current page, and 2 pages around current
                  return (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                  )
                })
                .map((page, index, array) => (
                  <div key={page} className="flex items-center">
                    {index > 0 && array[index - 1] !== page - 1 && (
                      <span className="px-2 text-muted-foreground">...</span>
                    )}
                    <Button
                      variant={currentPage === page ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="w-9 h-9"
                    >
                      {page}
                    </Button>
                  </div>
                ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
        </div>
      )}
    </div>
  )
}
