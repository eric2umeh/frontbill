'use client'

import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import { ExpandableText } from '@/components/shared/expandable-text'

export default function SupplyActivityPage() {
  const { activityLog } = useSupplyChain()
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Activity Log</h1>
      <p className="text-sm text-muted-foreground">Full audit trail — who did what and when.</p>
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
