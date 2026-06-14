'use client'

import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { usePaginatedList, type PaginatedListFilter } from '@/lib/hooks/use-paginated-list'
import { TableListControls } from '@/components/shared/table-list-controls'

export interface Column<T> {
  header: string
  accessor: keyof T | ((row: T) => React.ReactNode)
  cell?: (value: unknown, row: T) => React.ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  pageSize?: number
  onRowClick?: (row: T) => void
  emptyMessage?: string
  className?: string
  searchKeys?: (keyof T & string)[]
  searchMatch?: (item: T, query: string) => boolean
  searchPlaceholder?: string
  filters?: PaginatedListFilter[]
  filterMatch?: (item: T, filterKey: string, filterValue: string) => boolean | undefined
  hideSearch?: boolean
  toolbarClassName?: string
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  pageSize = 15,
  onRowClick,
  emptyMessage = 'No data available',
  className,
  searchKeys = [],
  searchMatch,
  searchPlaceholder = 'Search…',
  filters = [],
  filterMatch,
  hideSearch = false,
  toolbarClassName,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('')
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})

  const { paginatedItems, page, setPage, totalPages, totalCount, startIndex } = usePaginatedList({
    items: data as T[] & Record<string, unknown>[],
    pageSize,
    search,
    searchKeys,
    searchMatch,
    activeFilters,
    filterMatch,
  })

  const showControls = !hideSearch || filters.length > 0 || data.length > pageSize

  const getCellValue = (row: T, column: Column<T>) => {
    if (typeof column.accessor === 'function') {
      return column.accessor(row)
    }
    return row[column.accessor]
  }

  return (
    <div className={cn('space-y-4', className)}>
      {showControls && (
        <TableListControls
          className={toolbarClassName}
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
      )}

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column, index) => (
                <TableHead key={index} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedItems.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              paginatedItems.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick?.(row)}
                  className={cn(onRowClick && 'cursor-pointer hover:bg-muted/50')}
                >
                  {columns.map((column, index) => {
                    const value = getCellValue(row, column)
                    return (
                      <TableCell key={index} className={column.className}>
                        {column.cell ? column.cell(value, row) : (value as React.ReactNode)}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {showControls && totalPages > 1 && (
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
