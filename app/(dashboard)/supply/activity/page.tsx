'use client'

import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import { ExpandableText } from '@/components/shared/expandable-text'
import { SupplyHistoryClearButton } from '@/components/supply-chain/supply-history-clear-button'
import { canonicalRoleKey, canAddStoreItemDirect } from '@/lib/permissions'

export default function SupplyActivityPage() {
  const { name, role } = useAuth()
  const { activityLog } = useSupplyChain()
  const actor = { name: name ?? 'Staff', role: canonicalRoleKey(role) ?? 'staff' }
  const canClear = canAddStoreItemDirect(role)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Activity Log</h1>
          <p className="text-sm text-muted-foreground">Full audit trail — who did what and when.</p>
        </div>
        {canClear && (
          <SupplyHistoryClearButton
            actor={actor}
            label="Clear activity log"
            description="Removes all supply activity log entries, purchase order history, and issue-out records on this device."
          />
        )}
      </div>
      <PaginatedListShell
        items={activityLog}
        pageSize={25}
        searchPlaceholder="Search summary, action, user…"
        searchKeys={['summary', 'action', 'actorName', 'actorRole']}
        filters={[
          {
            key: 'action',
            label: 'Action',
            options: [
              { value: 'po_submitted', label: 'PO submitted' },
              { value: 'po_approved', label: 'PO approved' },
              { value: 'market_retired', label: 'Market retired' },
              { value: 'batch_opened', label: 'Batch opened' },
              { value: 'batch_closed', label: 'Batch closed' },
              { value: 'fnb_sale', label: 'F&B sale' },
            ],
          },
        ]}
        emptyMessage="No activity recorded."
      >
        {(pageLog) => (
          <ul className="space-y-3">
            {pageLog.map((a) => (
              <li key={a.id} className="rounded-lg border p-3 text-sm">
                <ExpandableText text={a.summary} maxLength={150} />
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(a.timestamp).toLocaleString()} · {a.actorName} ({a.actorRole}) ·{' '}
                  {a.action.replace(/_/g, ' ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PaginatedListShell>
    </div>
  )
}
