'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import {
  normalizeSupplyDept,
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
import { toast } from 'sonner'
import { formatPoRaisedAt } from '@/lib/supply-chain/po-format'
import { PoHistoryPanel } from '@/components/supply-chain/po-history-panel'
import { poStatusBadge } from '@/components/supply-chain/po-approval-panel'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import { poDepartmentFilterOptions } from '@/components/supply-chain/po-review-lines-panel'
import { RetirementLinesReview } from '@/components/supply-chain/retirement-lines-review'
import {
  isRetirementReviewCandidate,
  pendingReviewLines,
  poHasRemainingAddToStockLines,
} from '@/lib/supply-chain/add-to-stock'

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
  const pendingLines = useMemo(() => pendingReviewLines(po), [po])
  const pendingSpend = pendingLines.reduce(
    (s, l) => s + (Number(l.totalPaid) || 0),
    0,
  )
  const remainingOnActive = poHasRemainingAddToStockLines(po)
  const pendingBatch = po.retirement?.batches?.find(
    (b) => (b.status ?? 'pending_review') === 'pending_review',
  )
  const submittedBy =
    pendingBatch?.submittedBy ?? po.retirement?.submittedBy
  const submittedAt =
    pendingBatch?.submittedAt ?? po.retirement?.submittedAt

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="font-medium">{po.poNumber}</p>
          <p className="text-sm text-muted-foreground">
            Submitted by {submittedBy ?? 'Staff'} · This batch{' '}
            {formatNaira(pendingSpend)} · {pendingLines.length} item
            {pendingLines.length === 1 ? '' : 's'} to review
          </p>
          {submittedAt ? (
            <p className="text-xs text-muted-foreground">
              Submitted {formatPoRaisedAt(submittedAt)}
            </p>
          ) : null}
          {remainingOnActive ? (
            <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">
              Other PO lines still remain on Add to stock — Accept only closes this
              batch, not the whole PO.
            </p>
          ) : null}
        </div>
        {poStatusBadge(po)}
      </div>
      <div className="rounded-md border bg-muted/20 p-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Items added to stock (review only these) ({pendingLines.length})
        </p>
        <RetirementLinesReview
          po={po}
          lines={pendingLines}
          deptFilter={deptFilter}
          emptyMessage="No pending Add-to-stock items for this PO."
        />
      </div>
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
              disabled={!comment.trim() || pendingLines.length === 0}
              onClick={() => {
                onDecide(true, comment.trim())
                setComment('')
              }}
            >
              Accept this batch
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!comment.trim() || pendingLines.length === 0}
              onClick={() => {
                onDecide(false, comment.trim())
                setComment('')
              }}
            >
              Reject this batch (stock stays)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Accept/Reject applies only to items already submitted from Add to stock.
            Unstocked PO lines stay on Active. Reject does not undo Central Store posts.
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Waiting for accountant or manager to accept or reject this batch.
        </p>
      )}
    </div>
  )
}

export function PoRetirementPanel({
  showAcceptedSection = true,
}: {
  /** When false, only the awaiting-review queue is shown (e.g. embedded in Retirement → Active). */
  showAcceptedSection?: boolean
}) {
  const { name, role } = useAuth()
  const { purchaseOrders, accountantRetirementDecision } = useSupplyChain()
  const actor = {
    name: name ?? 'Staff',
    role: canonicalRoleKey(role) ?? 'staff',
  }

  const pending = purchaseOrders.filter((p) => isRetirementReviewCandidate(p))
  const accepted = purchaseOrders.filter((p) => p.status === 'retired')
  const canReview = canSupplyRetirementReview(role)
  const adminTester = canAdminTestApproveSupplyPo(role)

  const pendingDeptFilters = useMemo(
    () => poDepartmentFilterOptions(pending),
    [pending],
  )

  return (
    <div className="space-y-6">
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
            Review only items that store/purchaser already added to Central Store.
            Accept closes that batch; any lines not yet added stay on Active → Add to stock.
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
              return (
                pendingReviewLines(po).some(
                  (l) => normalizeSupplyDept(l.dept ?? 'kitchen') === want,
                ) || po.lines.some((l) => normalizeSupplyDept(l.dept) === want)
              )
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
                    }}
                  />
                ))}
              </div>
            )}
          </PaginatedListShell>
        )}
      </section>

      {showAcceptedSection ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Accepted retirements</h2>
            <p className="text-xs text-muted-foreground">
              Fully completed POs — every ordered line was stocked and accepted.
            </p>
          </div>
          <PoHistoryPanel
            purchaseOrders={accepted}
            includeStatuses={['retired']}
            emptyMessage="No accepted retirements yet."
            searchPlaceholder="Search retired PO number, date…"
          />
        </section>
      ) : null}
    </div>
  )
}
