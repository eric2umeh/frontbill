import {
  folioPositiveOutstandingSum,
  type FolioLineForBalance,
} from '@/lib/utils/booking-bill-balance'

const STAY_CHARGE_TYPES = new Set(['room_charge', 'reservation', 'extended_stay'])

export type StayFolioCharge = {
  id: string
  amount?: unknown
  charge_type?: string | null
  payment_status?: string | null
  payment_method?: string | null
  ledger_account_id?: string | null
  ledger_account_type?: string | null
}

export type StayFolioAmountUpdate = {
  id: string
  amount: number
}

export type StayFolioInsert = {
  amount: number
  charge_type: 'room_charge'
  payment_status: 'pending' | 'city_ledger'
  payment_method: string | null
  ledger_account_id: string | null
  ledger_account_type: string | null
  description: string
}

export type StayLedgerDelta = {
  ledgerAccountId: string
  accountType: string | null
  delta: number
}

export type StayFolioTotalEditPlan = {
  updates: StayFolioAmountUpdate[]
  insert: StayFolioInsert | null
  ledgerDeltas: StayLedgerDelta[]
  /** Folio lines after this edit, used to recompute what the guest still owes. */
  projected: FolioLineForBalance[]
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function norm(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function isStayCharge(charge: StayFolioCharge): boolean {
  return STAY_CHARGE_TYPES.has(norm(charge.charge_type))
}

function isGuestUnpaidStay(charge: StayFolioCharge): boolean {
  const status = norm(charge.payment_status)
  if (status === 'paid' || status === 'posted_to_ledger') return false
  return (
    status === '' ||
    status === 'pending' ||
    status === 'unpaid' ||
    status === 'partial' ||
    status === 'city_ledger' ||
    norm(charge.payment_method) === 'city_ledger'
  )
}

function isCompanyStay(charge: StayFolioCharge): boolean {
  const status = norm(charge.payment_status)
  const method = norm(charge.payment_method)
  return status === 'city_ledger' || status === 'posted_to_ledger' || method === 'city_ledger'
}

function stayRank(charge: StayFolioCharge): number {
  const type = norm(charge.charge_type)
  if (type === 'room_charge' || type === 'reservation') return 0
  return 1
}

function companyAccount(charge: StayFolioCharge): { id: string; accountType: string | null } | null {
  const id = String(charge.ledger_account_id || '').trim()
  if (!id) return null
  return {
    id,
    accountType: charge.ledger_account_type ? String(charge.ledger_account_type) : null,
  }
}

/**
 * Move folio stay lines (room / reservation / extension) to the edited stay total.
 * Extras such as minibar and outlet charges are left as they are.
 * A paid room line is not reopened; an increase becomes a new unpaid line so the
 * amount already collected is not billed again.
 */
export function planStayFolioAfterTotalEdit(input: {
  nextTotal: number
  charges: StayFolioCharge[]
}): StayFolioTotalEditPlan | null {
  const nextTotal = roundMoney(Math.max(0, Number(input.nextTotal) || 0))
  const charges = input.charges || []
  if (charges.length === 0) return null

  const stay = charges.filter(isStayCharge)
  const staySum = roundMoney(stay.reduce((sum, charge) => sum + (Number(charge.amount) || 0), 0))
  const delta = roundMoney(nextTotal - staySum)
  if (Math.abs(delta) < 0.005) return null

  const working = stay.map((charge) => ({
    ...charge,
    amount: roundMoney(Number(charge.amount) || 0),
  }))
  const updates: StayFolioAmountUpdate[] = []
  let insert: StayFolioInsert | null = null
  const ledgerDeltas: StayLedgerDelta[] = []

  const pushLedger = (charge: StayFolioCharge, amountDelta: number) => {
    if (!isCompanyStay(charge) || Math.abs(amountDelta) < 0.005) return
    const account = companyAccount(charge)
    if (!account) return
    const existing = ledgerDeltas.find((row) => row.ledgerAccountId === account.id)
    if (existing) {
      existing.delta = roundMoney(existing.delta + amountDelta)
      return
    }
    ledgerDeltas.push({
      ledgerAccountId: account.id,
      accountType: account.accountType,
      delta: roundMoney(amountDelta),
    })
  }

  if (delta > 0) {
    const target = [...working].sort((a, b) => stayRank(a) - stayRank(b)).find(isGuestUnpaidStay)
    if (target) {
      const nextAmount = roundMoney(target.amount + delta)
      target.amount = nextAmount
      updates.push({ id: target.id, amount: nextAmount })
      pushLedger(target, delta)
    } else {
      const company = [...working].sort((a, b) => stayRank(a) - stayRank(b)).find(isCompanyStay)
      const account = company ? companyAccount(company) : null
      const asCompany = Boolean(company)
      insert = {
        amount: delta,
        charge_type: 'room_charge',
        payment_status: asCompany ? 'city_ledger' : 'pending',
        payment_method: asCompany ? 'city_ledger' : null,
        ledger_account_id: account?.id ?? null,
        ledger_account_type: account?.accountType ?? null,
        description: 'Stay total adjusted',
      }
      if (account) {
        ledgerDeltas.push({
          ledgerAccountId: account.id,
          accountType: account.accountType,
          delta,
        })
      }
    }
  } else {
    let remaining = roundMoney(-delta)
    const ordered = [...working].sort((a, b) => {
      const unpaidA = isGuestUnpaidStay(a) ? 0 : 1
      const unpaidB = isGuestUnpaidStay(b) ? 0 : 1
      if (unpaidA !== unpaidB) return unpaidA - unpaidB
      return stayRank(a) - stayRank(b)
    })
    for (const line of ordered) {
      if (remaining < 0.005) break
      const cut = roundMoney(Math.min(line.amount, remaining))
      if (cut < 0.005) continue
      const nextAmount = roundMoney(line.amount - cut)
      line.amount = nextAmount
      remaining = roundMoney(remaining - cut)
      updates.push({ id: line.id, amount: nextAmount })
      pushLedger(line, -cut)
    }
  }

  if (updates.length === 0 && !insert) return null

  const amountById = new Map(updates.map((row) => [row.id, row.amount]))
  const projected: FolioLineForBalance[] = charges.map((charge) => ({
    amount: amountById.has(charge.id) ? amountById.get(charge.id) : Number(charge.amount) || 0,
    charge_type: charge.charge_type,
    payment_status: charge.payment_status,
    payment_method: charge.payment_method,
  }))
  if (insert) {
    projected.push({
      amount: insert.amount,
      charge_type: insert.charge_type,
      payment_status: insert.payment_status,
      payment_method: insert.payment_method,
    })
  }

  return { updates, insert, ledgerDeltas, projected }
}

export function bookingCollectionFromFolio(charges: FolioLineForBalance[]): {
  balance: number
  payment_status: 'paid' | 'partial' | 'pending' | 'city_ledger'
} {
  const balance = roundMoney(folioPositiveOutstandingSum(charges))
  if (balance <= 0.005) return { balance: 0, payment_status: 'paid' }

  const hasCityLedger = charges.some((charge) => {
    const status = norm(charge.payment_status ?? charge.paymentStatus)
    const method = norm(charge.payment_method ?? charge.paymentMethod)
    if (status === 'paid' || status === 'posted_to_ledger') return false
    return status === 'city_ledger' || method === 'city_ledger'
  })
  if (hasCityLedger) return { balance, payment_status: 'city_ledger' }

  const hasPayment = charges.some((charge) => {
    const amount = Number(charge.amount ?? 0)
    const type = norm(charge.charge_type ?? charge.type)
    const status = norm(charge.payment_status ?? charge.paymentStatus)
    if (!(type === 'payment' || amount < 0)) return false
    return status === 'paid' || status === 'posted_to_ledger'
  })
  if (hasPayment) return { balance, payment_status: 'partial' }
  return { balance, payment_status: 'pending' }
}
