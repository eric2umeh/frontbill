'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DEPT_LABELS, type IssueOutCartLine, type SupplyDept } from '@/lib/supply-chain/types'
import { UnitSelect } from '@/components/supply-chain/unit-select'
import { Send, Trash2 } from 'lucide-react'
import { sanitizeQuantityInput } from '@/lib/supply-chain/measurement-units'

type Props = {
  cart: IssueOutCartLine[]
  destination: string
  receivedBy: string
  onClear: () => void
  onRemove: (storeItemId: string) => void
  onQtyChange: (storeItemId: string, qty: number) => void
  onUnitChange?: (storeItemId: string, unit: string) => void
  onCommit: () => void
  committing?: boolean
}

export function IssueOutCartSidebar({
  cart,
  destination,
  receivedBy,
  onClear,
  onRemove,
  onQtyChange,
  onUnitChange,
  onCommit,
  committing = false,
}: Props) {
  const byDept = new Map<string, IssueOutCartLine[]>()
  for (const line of cart) {
    if (!byDept.has(line.dept)) byDept.set(line.dept, [])
    byDept.get(line.dept)!.push(line)
  }

  const canCommit = cart.length > 0 && destination.trim() && receivedBy.trim()

  return (
    <div className="rounded-xl border bg-card p-4 h-fit sticky top-4 shadow-md space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold">Issue cart</h3>
          <p className="text-[11px] text-muted-foreground">
            Review items before issuing to {destination || 'destination'}
          </p>
        </div>
        {cart.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear all
          </Button>
        )}
      </div>

      {!cart.length ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Add quantities from the table — they appear here for review.
        </p>
      ) : (
        <div className="space-y-4 max-h-[420px] overflow-y-auto">
          {[...byDept.entries()].map(([dept, lines]) => (
            <div key={dept}>
              <p className="text-xs font-bold text-muted-foreground mb-1.5">
                {DEPT_LABELS[dept as SupplyDept]?.toUpperCase() ?? dept}
              </p>
              <ul className="space-y-2">
                {lines.map((l) => (
                  <li
                    key={l.storeItemId}
                    className="rounded-lg border px-2 py-2 text-sm space-y-1.5"
                  >
                    <div className="flex justify-between gap-2 items-start">
                      <span className="font-medium leading-snug">
                        {l.name}{' '}
                        <span className="text-muted-foreground font-normal">({l.unit})</span>
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive"
                        onClick={() => onRemove(l.storeItemId)}
                        aria-label={`Remove ${l.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Input
                        inputMode="decimal"
                        className="h-7 w-14 px-1 text-center text-xs"
                        value={l.quantity}
                        onChange={(e) =>
                          onQtyChange(l.storeItemId, Number(sanitizeQuantityInput(e.target.value)) || 0)
                        }
                      />
                      {onUnitChange ? (
                        <UnitSelect
                          storeUnit={l.storeUnit}
                          itemName={l.name}
                          value={l.unit}
                          onChange={(u) => onUnitChange(l.storeItemId, u)}
                          className="h-7 w-[72px] text-[10px]"
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground">{l.unit}</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      max {l.maxAvailable} {l.storeUnit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <Button
        className="w-full gap-2"
        disabled={!canCommit || committing}
        onClick={onCommit}
      >
        <Send className="h-4 w-4" />
        Issue {cart.length} item{cart.length === 1 ? '' : 's'}
      </Button>
      {!receivedBy.trim() && cart.length > 0 && (
        <p className="text-xs text-destructive">Received by is required before issuing.</p>
      )}
    </div>
  )
}
