'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Filter, LayoutGrid, List, ChevronLeft, ChevronRight } from 'lucide-react'

interface Column<T> {
  key: keyof T | string
  label: string
  render?: (item: T) => React.ReactNode
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
  renderCard?: (item: T) => React.ReactNode
  itemsPerPage?: number
}

export function EnhancedDataTable<T extends Record<string, any>>({
  data,
  columns,
  filters = [],
  searchKeys = [],
  renderCard,
  itemsPerPage = 10,
}: EnhancedDataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({})
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [currentPage, setCurrentPage] = useState(1)

  // Filter and search logic
  const filteredData = data.filter((item) => {
    // Search filter
    const matchesSearch = searchKeys.length === 0 || searchKeys.some((key) => {
      const value = item[key]
      return value?.toString().toLowerCase().includes(searchQuery.toLowerCase())
    })

    // Active filters
    const matchesFilters = Object.entries(activeFilters).every(([key, value]) => {
      if (!value || value === 'all') return true
      return item[key]?.toString().toLowerCase() === value.toLowerCase()
    })

    return matchesSearch && matchesFilters
  })

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage)

  const handleFilterChange = (key: string, value: string) => {
    setActiveFilters(prev => ({ ...prev, [key]: value }))
    setCurrentPage(1)
  }

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
        Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, filteredData.length)} of {filteredData.length} results
      </div>

      {/* Table or Card View */}
      {viewMode === 'table' ? (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto md:overflow-visible">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  {columns.map((column, index) => (
                    <th 
                      key={column.key.toString()} 
                      className={`px-4 py-3 text-left text-sm font-medium ${index >= 3 ? 'hidden md:table-cell' : ''}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginatedData.map((item, index) => (
                  <tr key={index} className="hover:bg-muted/50 transition-colors">
                    {columns.map((column, colIndex) => (
                      <td 
                        key={column.key.toString()} 
                        className={`px-4 py-3 text-sm ${colIndex >= 3 ? 'hidden md:table-cell' : ''}`}
                      >
                        {column.render ? column.render(item) : item[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : renderCard ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginatedData.map((item, index) => (
            <Card key={index}>{renderCard(item)}</Card>
          ))}
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
