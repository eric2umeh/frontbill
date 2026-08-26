'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calculateGuestBalance } from '@/lib/balance'
import { formatNaira } from '@/lib/utils/currency'
import { cn } from '@/lib/utils'

export type PartyOwingAlertProps = {
  open: boolean
  hotelOrganizationId?: string | null
  guestId?: string | null
  guestName?: string | null
  /** City ledger / org account currently selected for payment. */
  ledgerAccountId?: string | null
  ledgerAccountName?: string | null
  /** When known from the picker list (avoids an extra round-trip). */
  ledgerBalanceHint?: number | null
  className?: string
}

type OwingLine = {
  key: string
  label: string
  amount: number
}

/**
 * Non-blocking warning when the selected guest or organization already owes money.
 * Booking / reservation can still proceed.
 */
export function PartyOwingAlert({
  open,
  hotelOrganizationId,
  guestId,
  guestName,
  ledgerAccountId,
  ledgerAccountName,
  ledgerBalanceHint,
  className,
}: PartyOwingAlertProps) {
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState<OwingLine[]>([])

  useEffect(() => {
    if (!open) {
      setLines([])
      setLoading(false)
      return
    }

    const orgId = (hotelOrganizationId || '').trim()
    const gId = (guestId || '').trim()
    const ledgerId = (ledgerAccountId || '').trim()

    if (!orgId || (!gId && !ledgerId)) {
      setLines([])
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const next: OwingLine[] = []
        const supabase = createClient()

        if (gId) {
          const bal = await calculateGuestBalance(gId, orgId)
          if (!cancelled && bal > 0.005) {
            next.push({
              key: `guest-${gId}`,
              label: guestName?.trim() || 'This guest',
              amount: bal,
            })
          }
        }

        if (ledgerId && !cancelled) {
          let owing =
            ledgerBalanceHint != null && Number.isFinite(Number(ledgerBalanceHint))
              ? Number(ledgerBalanceHint)
              : NaN
          let label = ledgerAccountName?.trim() || ''

          if (!Number.isFinite(owing) && supabase) {
            const { data } = await supabase
              .from('city_ledger_accounts')
              .select('balance, account_name, account_type')
              .eq('id', ledgerId)
              .eq('organization_id', orgId)
              .maybeSingle()
            if (cancelled) return
            owing = Number(data?.balance || 0)
            if (!label) label = String(data?.account_name || '').trim()
            const type = String(data?.account_type || '')
            if (!label) {
              label =
                type === 'organization' || type === 'corporate'
                  ? 'This organization'
                  : 'This ledger account'
            }
          }

          if (Number.isFinite(owing) && owing > 0.005) {
            next.push({
              key: `ledger-${ledgerId}`,
              label: label || 'This ledger account',
              amount: owing,
            })
          }
        }

        if (cancelled) return

        const deduped: OwingLine[] = []
        for (const line of next) {
          const dup = deduped.find(
            (d) =>
              Math.abs(d.amount - line.amount) < 0.01 &&
              d.label.trim().toLowerCase() === line.label.trim().toLowerCase(),
          )
          if (!dup) deduped.push(line)
        }
        setLines(deduped)
      } catch (e) {
        console.warn('[PartyOwingAlert]', e)
        if (!cancelled) setLines([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    open,
    hotelOrganizationId,
    guestId,
    guestName,
    ledgerAccountId,
    ledgerAccountName,
    ledgerBalanceHint,
  ])

  if (!open) return null
  if (!loading && lines.length === 0) return null

  return (
    <div
      role="status"
      className={cn(
        'rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-950',
        className,
      )}
    >
      <div className="flex gap-2">
        {loading ? (
          <Loader2 className="h-4 w-4 mt-0.5 shrink-0 animate-spin text-amber-700" />
        ) : (
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-700" />
        )}
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">Outstanding balance</p>
          {loading ? (
            <p className="text-xs text-amber-800/90">Checking guest / organization debt…</p>
          ) : (
            <>
              <ul className="space-y-0.5 text-xs sm:text-sm">
                {lines.map((line) => (
                  <li key={line.key}>
                    <span className="font-medium">{line.label}</span> currently owes{' '}
                    <span className="font-semibold tabular-nums text-amber-900">
                      {formatNaira(line.amount)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-800/90 pt-0.5">
                You can still complete this booking or reservation. Collect payment or post to city
                ledger as needed.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
