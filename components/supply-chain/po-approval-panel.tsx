'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import type { PurchaseOrder } from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import {
  canonicalRoleKey,
  canAdminTestApproveSupplyPo,
  canSupplyPoAccountantReview,
  canSupplyPoManagerReview,
} from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Info } from 'lucide-react'
import { toast } from 'sonner'
import { PoLinesTable } from '@/components/supply-chain/po-lines-table'
import { formatPoRaisedAt } from '@/lib/supply-chain/po-format'
import { getActivePurchaseOrder } from '@/lib/supply-chain/po-active'

const WORKFLOW_STEPS = [
  'Store raises PO',
  'Accountant accepts or rejects (comment required)',
  'Manager / Admin accepts or rejects (comment required)',
  'Cash disbursed — purchaser buys at market',
  'Retirement updates central store stock',
] as const

function poStatusBadge(status: PurchaseOrder['status']) {
  const map: Record<PurchaseOrder['status'], { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
    pending_accountant: { label: 'Awaiting accountant', className: 'bg-amber-100 text-amber-900' },
    accountant_rejected: { label: 'Accountant rejected', className: 'bg-red-100 text-red-800' },
    pending_manager: { label: 'Awaiting manager', className: 'bg-blue-100 text-blue-900' },
    manager_rejected: { label: 'Manager rejected', className: 'bg-red-100 text-red-800' },
    approved: { label: 'Approved', className: 'bg-emerald-100 text-emerald-800' },
    disbursed: { label: 'Disbursed — buy at market', className: 'bg-emerald-100 text-emerald-800' },
    retirement_pending: { label: 'Retirement pending', className: 'bg-amber-100 text-amber-900' },
    retired: { label: 'Retired', className: 'bg-muted text-muted-foreground' },
  }
  const s = map[status]
  return <Badge className={s.className}>{s.label}</Badge>
}

export function PoApprovalWorkflowBanner() {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-4 flex gap-3 text-sm">
      <Info className="h-5 w-5 shrink-0 text-blue-600" />
      <div className="space-y-2">
        <p className="font-medium">Purchase order approval chain</p>
        <p className="text-muted-foreground">
          A raised PO cannot go to market until the accountant and then the manager each review it
          with a comment. During testing, an Administrator may accept or reject a raised PO directly
          from the queue below.
        </p>
        <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-0.5">
          {WORKFLOW_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>
    </div>
  )
}

function PoDecisionCard({
  po,
  stage,
  onDecide,
  testingAdmin,
}: {
  po: PurchaseOrder
  stage: 'accountant' | 'manager' | 'admin_test'
  onDecide: (approved: boolean, comment: string) => void
  testingAdmin?: boolean
}) {
  const [comment, setComment] = useState('')

  const title =
    stage === 'admin_test'
      ? 'Administrator (testing) — accept or reject with comment'
      : stage === 'accountant'
        ? 'Accountant review — accept or reject with comment'
        : 'Manager review — accept or reject with comment'

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{po.poNumber}</p>
          <p className="text-sm text-muted-foreground">
            {po.weekLabel} · {po.createdByName} · {formatNaira(po.totalAmount)}
          </p>
          <p className="text-xs text-muted-foreground">
            Raised {formatPoRaisedAt(po.createdAt)}
          </p>
          {po.accountantComment && stage === 'manager' && (
            <p className="text-xs text-muted-foreground mt-1">
              Accountant: {po.accountantComment}
            </p>
          )}
        </div>
        {poStatusBadge(po.status)}
      </div>
      {testingAdmin && (
        <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-900 border-amber-200">
          Testing — admin fast-track (skips separate accountant/manager logins)
        </Badge>
      )}
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {po.lines.length > 0 && (
        <div className="rounded-md border bg-muted/20 p-2 overflow-x-auto">
          <p className="text-[10px] font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Purchase list ({po.lines.length} items)
          </p>
          <PoLinesTable rows={po.lines.map((line) => ({ kind: 'po' as const, line }))} />
        </div>
      )}
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
          {stage === 'admin_test'
            ? 'Accept PO (release for market)'
            : stage === 'accountant'
              ? 'Accept & forward to manager'
              : 'Approve for market'}
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
          Reject
        </Button>
      </div>
    </div>
  )
}

export function PoApprovalPanel({ compact }: { compact?: boolean }) {
  const { name, role } = useAuth()
  const { purchaseOrders, accountantDecision, managerDecision, adminTestPoDecision } =
    useSupplyChain()
  const actor = { name: name ?? 'Staff', role: canonicalRoleKey(role) ?? 'staff' }

  const activePo = getActivePurchaseOrder(purchaseOrders)
  const pendingAccountant = activePo?.status === 'pending_accountant' ? [activePo] : []
  const pendingManager = activePo?.status === 'pending_manager' ? [activePo] : []
  const canAccountant = canSupplyPoAccountantReview(role)
  const canManager = canSupplyPoManagerReview(role)
  const adminTester = canAdminTestApproveSupplyPo(role)

  if (!pendingAccountant.length && !pendingManager.length) {
    if (compact) return null
    return (
      <div className="space-y-4">
        {!compact && <PoApprovalWorkflowBanner />}
        <p className="text-sm text-muted-foreground">No purchase orders awaiting approval.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!compact && <PoApprovalWorkflowBanner />}

      {pendingAccountant.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">
            Raised POs — awaiting review ({pendingAccountant.length})
          </p>
          {pendingAccountant.map((po) =>
            adminTester ? (
              <PoDecisionCard
                key={po.id}
                po={po}
                stage="admin_test"
                testingAdmin
                onDecide={(approved, comment) => {
                  adminTestPoDecision(po.id, approved, comment, actor)
                  toast.success(
                    approved
                      ? 'PO accepted — released for market purchase (admin test)'
                      : 'PO rejected (admin test)',
                  )
                }}
              />
            ) : canAccountant ? (
              <PoDecisionCard
                key={po.id}
                po={po}
                stage="accountant"
                onDecide={(approved, comment) => {
                  accountantDecision(po.id, approved, comment, actor)
                  toast.success(
                    approved ? 'Forwarded to manager for approval' : 'PO rejected by accountant',
                  )
                }}
              />
            ) : (
              <div key={po.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <div>
                    <p className="font-medium text-sm">{po.poNumber}</p>
                    <p className="text-xs text-muted-foreground">Waiting for accountant review</p>
                  </div>
                  {poStatusBadge(po.status)}
                </div>
                {po.lines.length > 0 && (
                  <PoLinesTable rows={po.lines.map((line) => ({ kind: 'po' as const, line }))} />
                )}
              </div>
            ),
          )}
        </div>
      )}

      {pendingManager.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">Manager queue ({pendingManager.length})</p>
          {pendingManager.map((po) =>
            adminTester ? (
              <PoDecisionCard
                key={po.id}
                po={po}
                stage="admin_test"
                testingAdmin
                onDecide={(approved, comment) => {
                  adminTestPoDecision(po.id, approved, comment, actor)
                  toast.success(
                    approved
                      ? 'PO accepted — released for market purchase (admin test)'
                      : 'PO rejected (admin test)',
                  )
                }}
              />
            ) : canManager ? (
              <PoDecisionCard
                key={po.id}
                po={po}
                stage="manager"
                onDecide={(approved, comment) => {
                  managerDecision(po.id, approved, comment, actor)
                  toast.success(
                    approved
                      ? 'Approved — cash released for market purchase'
                      : 'PO rejected by manager',
                  )
                }}
              />
            ) : (
              <div key={po.id} className="rounded-lg border p-3 flex justify-between items-center gap-2">
                <div>
                  <p className="font-medium text-sm">{po.poNumber}</p>
                  <p className="text-xs text-muted-foreground">Waiting for manager review</p>
                </div>
                {poStatusBadge(po.status)}
              </div>
            ),
          )}
        </div>
      )}

      {!canAccountant && !canManager && !adminTester && (
        <p className="text-xs text-muted-foreground">
          You can view pending POs here. Approvals are handled by users with accountant or manager
          permissions — open{' '}
          <Link href="/supply/purchasing" className="underline font-medium">
            Purchasing
          </Link>{' '}
          when assigned.
        </p>
      )}
    </div>
  )
}

export { poStatusBadge }
