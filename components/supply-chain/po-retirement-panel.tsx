'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import {
  normalizeSupplyDept,
  type PoLine,
  type PurchaseOrder,
} from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import {
  canonicalRoleKey,
  canAdminTestApproveSupplyPo,
  canSupplyRetirementReview,
} from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Info } from 'lucide-react'
import { toast } from 'sonner'
import { formatPoRaisedAt } from '@/lib/supply-chain/po-format'
import { PoHistoryPanel } from '@/components/supply-chain/po-history-panel'
import { poStatusBadge } from '@/components/supply-chain/po-approval-panel'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import {
  PoReviewLinesPanel,
  poDepartmentFilterOptions,
} from '@/components/supply-chain/po-review-lines-panel'

function retirementLinesAsPoLines(po: PurchaseOrder): PoLine[] {
  const rLines = po.retirement?.lines ?? []
  return rLines.map((line) => {
    const poLine = po.lines.find((l) => l.id === line.lineId)
    const notBought = line.notBought ?? line.removed
    return {
      id: line.lineId,
      stockItemId: poLine?.stockItemId ?? line.lineId,
      name: notBought ? `* ${line.name}` : line.name,
      dept: normalizeSupplyDept(poLine?.dept ?? 'kitchen'),
      unit: poLine?.unit ?? '',
      quantityOrdered: notBought ? line.quantityOrdered : line.quantityBought,
      unitPrice: notBought ? line.poPrice : line.actualPrice,
      lineTotal: notBought ? 0 : line.totalPaid,
    }
  })
}

function RetirementReviewCard({
  po,
  canReview,
  onDecide,
  deptFilter = 'all',
}: {
  po: PurchaseOrder
  canReview: boolean
  onDecide: (approved: boolean, comment: string) => void
  deptFilter?: string
}) {
  const [comment, setComment] = useState('')
  const r = po.retirement
  const browseLines = useMemo(() => retirementLinesAsPoLines(po), [po])

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-medium">{po.poNumber}</p>
          <p className="text-sm text-muted-foreground">
            Submitted by {r?.submittedBy} · Est. spend {formatNaira(r?.actualSpent ?? 0)} · Refund{' '}
            {formatNaira(r?.refundToCashier ?? 0)}
          </p>
          {r?.submittedAt ? (
            <p className="text-xs text-muted-foreground">
              Submitted {formatPoRaisedAt(r.submittedAt)}
            </p>
          ) : null}
        </div>
        {poStatusBadge(po.status)}
      </div>
      {browseLines.length > 0 ? (
        <div className="rounded-md border bg-muted/20 p-3">
          <PoReviewLinesPanel
            lines={browseLines}
            pageSize={8}
            showDept
            deptFilter={deptFilter}
            title={`Retirement lines (${browseLines.length})`}
          />
        </div>
      ) : null}
      {canReview ? (
        <>
          <Textarea
            placeholder="Comment required for accept or reject…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!comment.trim()}
              onClick={() => {
                onDecide(true, comment.trim())
                setComment('')
              }}
            >
              Accept retirement & update stock
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!comment.trim()}
              onClick={() => {
                onDecide(false, comment.trim())
                setComment('')
              }}
            >
              Reject — send to Purchasing
            </Button>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Waiting for accountant review.</p>
      )}
    </div>
  )
}

export function PoRetirementPanel() {
  const { name, role } = useAuth()
  const { purchaseOrders, accountantRetirementDecision } = useSupplyChain()
  const actor = {
    name: name ?? 'Staff',
    role: canonicalRoleKey(role) ?? 'staff',
  }

  const pending = purchaseOrders.filter((p) => p.status === 'retirement_pending_accountant')
  const accepted = purchaseOrders.filter((p) => p.status === 'retired')
  const canReview = canSupplyRetirementReview(role)
  const adminTester = canAdminTestApproveSupplyPo(role)

  const pendingDeptFilters = useMemo(
    () => poDepartmentFilterOptions(pending),
    [pending],
  )

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-violet-200 bg-violet-50/50 dark:bg-violet-950/20 p-4 flex gap-3 text-sm">
        <Info className="h-5 w-5 shrink-0 text-violet-600" />
        <div className="space-y-1">
          <p className="font-medium">Market retirement review</p>
          <p className="text-muted-foreground">
            Purchasers submit retirements from{' '}
            <Link href="/supply/purchasing" className="underline font-medium text-foreground">
              Supply chain → Purchasing
            </Link>
            . Accept to update central store stock; reject sends the PO back to the purchaser.
            Accountant, store, purchaser, auditor, admin, and superadmin may also edit the
            retirement on Purchasing without rejecting first.
          </p>
        </div>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">
            Awaiting review
            {pending.length > 0 ? (
              <Badge variant="secondary" className="ml-2 tabular-nums">
                {pending.length}
              </Badge>
            ) : null}
          </h2>
          <p className="text-xs text-muted-foreground">
            Retirements submitted after market purchase — comment required to accept or reject.
          </p>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center">
            No retirements awaiting review.
          </p>
        ) : (
          <PaginatedListShell
            items={pending}
            pageSize={5}
            searchPlaceholder="Search PO number, submitter…"
            searchMatch={(po, query) => {
              const q = query.trim().toLowerCase()
              if (!q) return true
              return (
                po.poNumber.toLowerCase().includes(q) ||
                (po.retirement?.submittedBy ?? '').toLowerCase().includes(q) ||
                po.createdByName.toLowerCase().includes(q) ||
                po.lines.some((l) => l.name.toLowerCase().includes(q))
              )
            }}
            filters={
              pendingDeptFilters.length
                ? [
                    {
                      key: 'dept',
                      label: 'Department',
                      options: pendingDeptFilters,
                    },
                  ]
                : []
            }
            filterMatch={(po, key, value) => {
              if (key !== 'dept') return undefined
              if (!value || value === 'all') return true
              const want = normalizeSupplyDept(value)
              return po.lines.some((l) => normalizeSupplyDept(l.dept) === want)
            }}
            emptyMessage="No retirements match this search or filter."
          >
            {(pageItems, ctx) => (
              <div className="space-y-3">
                {pageItems.map((po) => (
                  <RetirementReviewCard
                    key={po.id}
                    po={po}
                    deptFilter={ctx.activeFilters.dept ?? 'all'}
                    canReview={canReview || adminTester}
                    onDecide={(approved, comment) => {
                      const res = accountantRetirementDecision(
                        po.id,
                        approved,
                        comment,
                        actor,
                      )
                      if ('error' in res) toast.error(res.error)
                      else
                        toast.success(
                          approved
                            ? 'Retirement approved — stock updated'
                            : 'Retirement sent back to Purchasing',
                        )
                    }}
                  />
                ))}
              </div>
            )}
          </PaginatedListShell>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Accepted retirements</h2>
          <p className="text-xs text-muted-foreground">
            Completed market retirements — stock has been updated in central store.
          </p>
        </div>
        <PoHistoryPanel
          purchaseOrders={accepted}
          includeStatuses={['retired']}
          emptyMessage="No accepted retirements yet."
          searchPlaceholder="Search retired PO number, date…"
        />
      </section>
    </div>
  )
}
