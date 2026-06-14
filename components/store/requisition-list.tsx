'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import type { RequisitionStatus, StoreRequisitionRow } from '@/lib/store/requisition-types'
import { STORE_SECTION_OPTIONS } from '@/lib/store/requisition-types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import { usePaginatedList } from '@/lib/hooks/use-paginated-list'
import { TableListControls } from '@/components/shared/table-list-controls'

const statusVariant: Record<
  RequisitionStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  submitted: 'secondary',
  processing: 'default',
  fulfilled: 'outline',
  cancelled: 'destructive',
}

function sectionLabel(value: string) {
  return STORE_SECTION_OPTIONS.find((o) => o.value === value)?.label ?? value
}

export function RequisitionList({ embedded = false }: { embedded?: boolean }) {
  const { organizationId, role } = useAuth()
  const canCreate = hasPermission(role, 'store:requisition') || hasPermission(role, 'store:view')
  const [rows, setRows] = useState<StoreRequisitionRow[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const {
    paginatedItems: visibleRows,
    page,
    setPage,
    totalPages,
    totalCount,
    startIndex,
    pageSize,
  } = usePaginatedList<StoreRequisitionRow>({
    items: rows,
    pageSize: 15,
    search,
    searchMatch: (r, query) => {
      const q = query.trim().toLowerCase()
      return (
        r.reference.toLowerCase().includes(q) ||
        r.department.toLowerCase().includes(q) ||
        sectionLabel(r.store_section).toLowerCase().includes(q)
      )
    },
    activeFilters: { status: statusFilter },
    filterMatch: (r, key, value) => {
      if (key !== 'status') return undefined
      return r.status === value
    },
  })

  const load = useCallback(async () => {
    const supabase = createClient()
    if (!supabase || !organizationId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('store_requisitions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      setRows((data as StoreRequisitionRow[]) || [])

      const ids = [
        ...new Set(
          (data || [])
            .flatMap((r: { requested_by?: string | null; fulfilled_by?: string | null }) => [
              r.requested_by,
              r.fulfilled_by,
            ])
            .filter(Boolean),
        ),
      ] as string[]
      if (ids.length) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids)
        const map: Record<string, string> = {}
        ;(profs || []).forEach((p: { id: string; full_name: string | null }) => {
          map[p.id] = p.full_name?.trim() || p.id.slice(0, 8)
        })
        setNames(map)
      } else {
        setNames({})
      }
    } catch (e: unknown) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to load requisitions')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [organizationId])

  useEffect(() => {
    load()
  }, [load])

  const resolveName = (id: string | null | undefined) => {
    if (!id) return '—'
    return names[id] || `${id.slice(0, 8)}…`
  }

  if (!canCreate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Store requisitions</CardTitle>
          <CardDescription>You don&apos;t have permission to view store requisitions.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Store requisitions</h1>
            <p className="text-sm text-muted-foreground">
              Department requests for store issues — same flow as the paper form, with multiple line items.
            </p>
          </div>
          <Button asChild>
            <Link href="/store/requisitions/new">
              <Plus className="mr-2 h-4 w-4" />
              New requisition
            </Link>
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent requests</CardTitle>
          <CardDescription>Open a row to enter quantities issued and costs (store team).</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No requisitions yet.</p>
          ) : (
            <div className="space-y-3">
              <TableListControls
                section="toolbar"
                search={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search reference, department…"
                filters={[
                  {
                    key: 'status',
                    label: 'Status',
                    options: [
                      { value: 'submitted', label: 'Submitted' },
                      { value: 'processing', label: 'Processing' },
                      { value: 'fulfilled', label: 'Fulfilled' },
                      { value: 'cancelled', label: 'Cancelled' },
                    ],
                  },
                ]}
                activeFilters={{ status: statusFilter }}
                onFilterChange={(_, value) => setStatusFilter(value)}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                startIndex={startIndex}
                pageSize={pageSize}
                totalCount={totalCount}
              />
              <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Store section</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested by</TableHead>
                    <TableHead className="w-[100px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium whitespace-nowrap">{r.reference}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(parseISO(r.request_date), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell>{r.department}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {sectionLabel(r.store_section)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant[r.status] ?? 'secondary'}>{r.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{resolveName(r.requested_by)}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/store/requisitions/${r.id}`}>Open</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
              {totalCount === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No requisitions match your filters.</p>
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
