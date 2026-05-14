'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Search, LayoutGrid, List, ChevronLeft, ChevronRight, CalendarIcon } from 'lucide-react'
import { format, isSameDay } from 'date-fns'

/** `always`: all breakpoints (horizontal scroll). `md+` / `lg+`: hide below that breakpoint to prioritize key cols on phones. */
export type ColumnResponsive = 'always' | 'md+' | 'lg+'

export interface Column<T> {
  key: keyof T | string
  label: string
  render?: (item: T) => React.ReactNode
  responsive?: ColumnResponsive
}

interface Filter {
  key: string
  label: string
  options: { value: string; label: string }[]
}

interface EnhancedDataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  filters?: Filter[]
  searchKeys?: (keyof T)[]
  /** When set, used for search (overrides searchKeys substring logic when query non-empty). */
  searchMatch?: (item: T, query: string) => boolean
  /**
   * Controlled filter values (e.g. parent refetches when `status` changes).
   * When set, `onControlledActiveFiltersChange` must be provided to update them.
   */
  controlledActiveFilters?: Record<string, string>
  onControlledActiveFiltersChange?: (next: Record<string, string>) => void
  renderCard?: (item: T) => React.ReactNode
  itemsPerPage?: number
  dateField?: keyof T
  onDateFilterChange?: (date: Date | undefined) => void
  onRowClick?: (item: T) => void
  /** Stable row keys (defaults to row index). */
  rowKey?: (item: T, index: number) => string
  emptyState?: { title: string; description?: string }
  /** When not `undefined`, overrides default equality for that filter key + value. */
  resolveFilterMatch?: (item: T, filterKey: string, filterValue: string) => boolean | undefined
  /** Tighter cell padding (e.g. Bookings table with many actions). */
  compactTable?: boolean
}

export function EnhancedDataTable<T extends Record<string, any>>({
  data,
  columns,
  filters = [],
  searchKeys = [],
  searchMatch,
  controlledActiveFilters,
  onControlledActiveFiltersChange,
  renderCard,
  itemsPerPage = 10,
  dateField,
  onDateFilterChange,
  onRowClick,
  rowKey,
  emptyState,
  resolveFilterMatch,
  compactTable = false,
}: EnhancedDataTableProps<T>) {
  const columnResponsiveClass = (responsive?: ColumnResponsive): string => {
    switch (responsive) {
      case 'md+':
        return 'hidden md:table-cell'
      case 'lg+':
        return 'hidden lg:table-cell'
      case 'always':
      default:
        return ''
    }
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [internalFilters, setInternalFilters] = useState<Record<string, string>>({})
  const isControlled = controlledActiveFilters !== undefined && onControlledActiveFiltersChange !== undefined
  const activeFilters = isControlled ? controlledActiveFilters : internalFilters
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()

  // Filter and search logic
  const filteredData = data.filter((item) => {
    const q = searchQuery.trim().toLowerCase()
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
      const custom = resolveFilterMatch?.(item, key, value)
      if (custom !== undefined) return custom
      return String(item[key] || '').toLowerCase() === value.toLowerCase()
    })

    // Date filter
    const matchesDate = !dateField || !selectedDate 
      ? true 
      : isSameDay(new Date(item[dateField]), selectedDate)

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
    ? 'px-2 py-1.5 text-left text-xs font-medium max-md:px-1.5 max-md:py-1 max-md:text-[11px]'
    : 'px-4 py-3 text-left text-sm font-medium max-md:px-2 max-md:py-1.5 max-md:text-xs'
  const tdClass = compactTable
    ? 'px-2 py-1.5 text-sm max-md:px-1.5 max-md:py-1 max-md:text-[11px] align-top whitespace-nowrap'
    : 'px-4 py-3 text-sm max-md:px-2 max-md:py-1.5 max-md:text-xs align-top whitespace-nowrap'

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {filters.map((filter) => (
            <Select
              key={filter.key}
              value={activeFilters[filter.key] || 'all'}
              onValueChange={(value) => handleFilterChange(filter.key, value)}
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

          {dateField && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2 w-[180px]">
                  <CalendarIcon className="h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'MMM dd') : 'Select Date'}
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
        {filteredData.length === 0 ? (
          <span>No matching results</span>
        ) : (
          <span>
            Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredData.length)} of{' '}
            {filteredData.length} results
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
              '[scrollbar-gutter:stable]',
            ].join(' ')}
          >
            <table className="w-full min-w-0 border-collapse">
              <thead className="bg-muted/50">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column.key.toString()}
                      className={`${thClass} ${columnResponsiveClass(column.responsive)}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className={`${tdClass} text-center py-12 text-muted-foreground`}>
                      <p className="font-medium text-foreground">{emptyState?.title ?? 'No rows to display'}</p>
                      {emptyState?.description && (
                        <p className="text-sm mt-2 max-w-md mx-auto">{emptyState.description}</p>
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
                      {columns.map((column) => (
                        <td
                          key={column.key.toString()}
                          className={`${tdClass} ${columnResponsiveClass(column.responsive)}`}
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
              <p className="font-medium text-foreground">{emptyState?.title ?? 'No rows to display'}</p>
              {emptyState?.description && (
                <p className="text-sm mt-2 max-w-md mx-auto">{emptyState.description}</p>
              )}
            </div>
          ) : (
            paginatedData.map((item, index) => (
              <Card key={rowId(item, index)}>{renderCard(item)}</Card>
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
