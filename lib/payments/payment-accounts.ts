/** Hotel POS / bank transfer destination accounts. */

export type PaymentAccountKind = 'pos' | 'transfer' | 'both'

export type PaymentAccount = {
  id: string
  organization_id: string
  bank_name: string
  account_number: string
  account_name: string
  label: string
  kind: PaymentAccountKind
  is_active: boolean
  sort_order: number
}

export function normalizePaymentMethodKey(method: string | null | undefined): string {
  return String(method || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
}

/** POS and Transfer (incl. bank_transfer) require a destination account. */
export function paymentMethodRequiresAccount(method: string | null | undefined): boolean {
  const m = normalizePaymentMethodKey(method)
  return m === 'pos' || m === 'transfer' || m === 'bank_transfer'
}

export function formatPaymentAccountLabel(input: {
  bank_name?: string | null
  account_number?: string | null
  account_name?: string | null
  label?: string | null
}): string {
  const existing = String(input.label || '').trim()
  if (existing) return existing
  return [input.bank_name, input.account_number, input.account_name]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' ')
}

export function accountAppliesToMethod(
  account: Pick<PaymentAccount, 'kind' | 'is_active'>,
  method: string | null | undefined,
): boolean {
  if (!account.is_active) return false
  if (!paymentMethodRequiresAccount(method)) return true
  const m = normalizePaymentMethodKey(method)
  if (account.kind === 'both') return true
  if (m === 'bank_transfer') return account.kind === 'transfer'
  return account.kind === m
}

export function paymentAccountInsertFields(account: {
  id: string
  label?: string | null
  bank_name?: string | null
  account_number?: string | null
  account_name?: string | null
} | null | undefined): {
  payment_account_id: string | null
  payment_account_label: string | null
} {
  if (!account?.id) {
    return { payment_account_id: null, payment_account_label: null }
  }
  return {
    payment_account_id: account.id,
    payment_account_label: formatPaymentAccountLabel(account),
  }
}

/** Append account label into free-text notes/description for older readers. */
export function appendAccountToNotes(
  notes: string | null | undefined,
  accountLabel: string | null | undefined,
): string | null {
  const base = String(notes || '').trim()
  const label = String(accountLabel || '').trim()
  if (!label) return base || null
  if (base.toLowerCase().includes(label.toLowerCase())) return base || null
  const tag = `Account: ${label}`
  return base ? `${base} | ${tag}` : tag
}

/** Resolve display label from column or notes/description fallback. */
export function resolvePaymentAccountLabel(input: {
  payment_account_label?: string | null
  notes?: string | null
  description?: string | null
}): string {
  const direct = String(input.payment_account_label || '').trim()
  if (direct) return direct
  const text = `${input.notes || ''} ${input.description || ''}`
  const m = text.match(/Account:\s*([^|]+)/i)
  return m ? m[1].trim() : ''
}
