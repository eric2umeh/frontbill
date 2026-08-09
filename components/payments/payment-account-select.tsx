'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePaymentAccounts } from '@/hooks/use-payment-accounts'
import {
  paymentMethodRequiresAccount,
  type PaymentAccount,
} from '@/lib/payments/payment-accounts'

type Props = {
  paymentMethod: string
  value: string
  onChange: (accountId: string, account: PaymentAccount | null) => void
  disabled?: boolean
  /** When true (default), shows required asterisk and empty option. */
  required?: boolean
  className?: string
}

/**
 * Destination account picker for POS / Transfer.
 * Returns null for cash, city ledger, pending, etc.
 */
export function PaymentAccountSelect({
  paymentMethod,
  value,
  onChange,
  disabled,
  required = true,
  className,
}: Props) {
  const needs = paymentMethodRequiresAccount(paymentMethod)
  const { accounts, loading, dbAvailable } = usePaymentAccounts({
    method: paymentMethod,
    enabled: needs,
  })

  if (!needs) return null

  const selected = accounts.find((a) => a.id === value) || null

  return (
    <div className={className || 'space-y-2'}>
      <Label>
        Account details{required ? ' *' : ''}
      </Label>
      <Select
        value={value || undefined}
        onValueChange={(id) => {
          const acc = accounts.find((a) => a.id === id) || null
          onChange(id, acc)
        }}
        disabled={disabled || loading || !dbAvailable || accounts.length === 0}
      >
        <SelectTrigger>
          <SelectValue
            placeholder={
              !dbAvailable
                ? 'Run SQL 076 first (Settings)'
                : loading
                  ? 'Loading accounts…'
                  : accounts.length === 0
                    ? 'No accounts — add in Settings'
                    : 'Select bank / POS account'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {accounts.map((a) => (
            <SelectItem key={a.id} value={a.id}>
              {a.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!dbAvailable ? (
        <p className="text-xs text-amber-700">
          Payment accounts table missing. Superadmin: run scripts/076_payment_accounts.sql in Supabase.
        </p>
      ) : accounts.length === 0 && !loading ? (
        <p className="text-xs text-amber-700">
          Add at least one account under Settings → Payment accounts before taking POS or Transfer.
        </p>
      ) : selected ? (
        <p className="text-xs text-muted-foreground">{selected.label}</p>
      ) : null}
    </div>
  )
}
