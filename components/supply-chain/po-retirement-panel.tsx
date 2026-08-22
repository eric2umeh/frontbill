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
  computeRetirementBatchStats,
  downloadRetirementReviewReport,
} from '@/lib/supply-chain/retirement-review-utils'
import {
  isRetirementReviewCandidate,
  pendingReviewLines,
  poHasRemainingAddToStockLines,
} from '@/lib/supply-chain/add-to-stock'
import { Download } from 'lucide-react'

function RetirementReviewCard({
  po,
  canReview,
  onDecide,
  onCorrectQty,
  onCorrectPrice,
  deptFilter = 'all',
}: {
  po: PurchaseOrder
  canReview: boolean
  onDecide: (approved: boolean, comment: string) => void
  onCorrectQty: (lineId: string, qty: number) => void
  onCorrectPrice: (lineId: string, price: number) => void
  deptFilter?: string
}) {
  const [comment, setComment] = useState('')
  const pendingLines = useMemo(() => pendingReviewLines(po), [po])
  const stats = useMemo(
    () => computeRetirementBatchStats(po, pendingLines),
    [po, pendingLines],
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
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm">{po.poNumber}</p>
          <p className="text-xs text-muted-foreground">
            {submittedBy ?? 'Staff'}
            {submittedAt ? ` · ${formatPoRaisedAt(submittedAt)}` : ''}
            {' · '}
            {pendingLines.length} item{pendingLines.length === 1 ? '' : 's'}
          </p>
          {remainingOnActive ? (
            <p className="text-[11px] text-amber-800 dark:text-amber-200 mt-0.5">
              Other lines still on Active — Accept closes this batch only.
            </p>
          ) : null}
        </div>
        {poStatusBadge(po)}
      </div>

      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-md border px-2 py-1.5 bg-muted/20">
          <p className="text-[10px] uppercase text-muted-foreground">Batch spend</p>
          <p className="text-sm font-semibold tabular-nums">{formatNaira(stats.batchSpend)}</p>
        </div>
        <div className="rounded-md border px-2 py-1.5 bg-muted/20">
          <p className="text-[10px] uppercase text-muted-foreground">Qty / price Δ</p>
          <p className="text-sm font-semibold tabular-nums">
            {stats.qtyChangedCount} / {stats.priceChangedCount}
          </p>
        </div>
        <div className="rounded-md border px-2 py-1.5 bg-muted/20">
          <p className="text-[10px] uppercase text-muted-foreground">Bought / skipped</p>
          <p className="text-sm font-semibold tabular-nums">
            {stats.boughtCount} / {stats.notBoughtCount}
          </p>
        </div>
        <div className="rounded-md border px-2 py-1.5 bg-primary/5">
          <p className="text-[10px] uppercase text-muted-foreground">Refund / credit</p>
          <p className="text-sm font-semibold tabular-nums">
            {formatNaira(Math.abs(stats.refundOrCredit))}
            {stats.refundOrCredit !== 0 ? (
              <span className="text-[10px] font-normal ml-1">
                {stats.refundOrCredit > 0 ? 'credit' : 'debit'}
              </span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-muted/20 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Items in this batch
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={!pendingLines.length}
            onClick={() => {
              downloadRetirementReviewReport(po, pendingLines, {})
              toast.success('Downloaded retirement review report')
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
        <RetirementLinesReview
          po={po}
          lines={pendingLines}
          deptFilter={deptFilter}
          compact
          editable={canReview}
          onQtyCorrect={canReview ? onCorrectQty : undefined}
          onPriceCorrect={canReview ? onCorrectPrice : undefined}
          emptyMessage="No pending Add-to-stock items for this PO."
        />
      </div>
      {canReview ? (
        <>
          <Textarea
            placeholder="Optional comment for accept or reject…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            className="text-sm min-h-[52px]"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pendingLines.length === 0}
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
              disabled={pendingLines.length === 0}
              onClick={() => {
                onDecide(false, comment.trim())
                setComment('')
              }}
            >
              Reject this batch
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Reviewers may correct qty or price inline — store/purchaser get an alert. Accept/Reject
            is stored in History.
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
  showAcceptedSection?: boolean
}) {
  const { name, role } = useAuth()
  const {
    purchaseOrders,
    accountantRetirementDecision,
    correctRetirementLineDuringReview,
  } = useSupplyChain()
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

  const handleCorrect =
    (poId: string, field: 'qty' | 'price') => (lineId: string, value: number) => {
      const res = correctRetirementLineDuringReview(
        poId,
        lineId,
        field === 'qty' ? { quantityBought: value } : { actualPrice: value },
        actor,
      )
      if ('error' in res) toast.error(res.error)
      else {
        toast.success('Updated stock from correction')
        if (res.warning) toast.warning(res.warning)
      }
    }

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
            Review Add-to-stock submissions. Correct qty/price if store made mistakes — stock updates
            immediately and store/purchaser are notified.
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
                    onCorrectQty={handleCorrect(po.id, 'qty')}
                    onCorrectPrice={handleCorrect(po.id, 'price')}
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
