import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/layout/page-header'

/** F&B Store is temporarily paused — drinks now issue Central Store → Main Bar. */
export default function SupplyFnbPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="F&B Store"
        description="Temporarily paused. Main Bar stock now comes straight from Central Store."
      />
      <div className="rounded-xl border bg-muted/30 px-4 py-6 space-y-3 max-w-xl">
        <p className="text-sm text-muted-foreground">
          Daily inventory and F&amp;B → Main Bar transfers are hidden for now. Issue drinks from{' '}
          <strong className="text-foreground">Central Store → Issue Out → Main Bar</strong>. Main
          Bar Take order uses that issued stock.
        </p>
        <Button asChild>
          <Link href="/supply/store?tab=issue_out">Open Central Store Issue Out</Link>
        </Button>
      </div>
    </div>
  )
}
