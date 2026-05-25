import type { SupabaseClient } from '@supabase/supabase-js'
import type { RevenueDepartment } from '@/lib/reports/revenue-category'
import { getOutletDepartment } from '@/lib/outlets/departments'

export const OUTLET_TRANSACTION_ID_PREFIX = 'OUT-'

export function outletTransactionId(orderNumber: string): string {
  return `${OUTLET_TRANSACTION_ID_PREFIX}${orderNumber}`
}

export function isOutletTransactionId(transactionId: string | null | undefined): boolean {
  return String(transactionId || '').startsWith(OUTLET_TRANSACTION_ID_PREFIX)
}

/** Matches outlet order numbers such as RES-20260523-2GIB */
export const OUTLET_ORDER_NUMBER_RE = /\b([A-Z]{2,}-\d{8}-[A-Z0-9]{4})\b/i

export function extractOutletOrderNumberFromNotes(notes: string | null | undefined): string | null {
  const m = String(notes || '').match(OUTLET_ORDER_NUMBER_RE)
  return m ? m[1].toUpperCase() : null
}

export function outletOrderNumberFromTransactionId(
  transactionId: string | null | undefined,
): string | null {
  const id = String(transactionId || '')
  if (!isOutletTransactionId(id)) return null
  return id.slice(OUTLET_TRANSACTION_ID_PREFIX.length)
}

/** OUT-* rows in transactions paired with payments — hide the payment duplicate in lists. */
export function collectOutletPaidTransactionOrderNumbers(
  transactions: Array<{ transaction_id?: string | null; status?: string | null }>,
): Set<string> {
  const set = new Set<string>()
  for (const t of transactions) {
    const orderNo = outletOrderNumberFromTransactionId(t.transaction_id)
    if (!orderNo) continue
    const st = String(t.status || '').toLowerCase()
    if (['paid', 'completed'].includes(st)) set.add(orderNo)
  }
  return set
}

export function shouldHideOutletPaymentDuplicate(
  paymentNotes: string | null | undefined,
  outletTransactionOrderNumbers: Set<string>,
): boolean {
  const orderNo = extractOutletOrderNumberFromNotes(paymentNotes)
  return !!orderNo && outletTransactionOrderNumbers.has(orderNo)
}

export function buildOutletSettlementNotes(
  departmentLabel: string,
  orderNumber: string,
  lineDetail: string,
): string {
  return `${departmentLabel} ${orderNumber} — ${lineDetail}`.slice(0, 500)
}

export function outletDepartmentRevenueCategory(department: string): RevenueDepartment {
  return getOutletDepartment(department)?.revenueCategory ?? 'other'
}

/** Immediate collections (cash/POS/transfer) — not city ledger or complimentary. */
export function isOutletImmediatePaymentMethod(method: string | null | undefined): boolean {
  const m = String(method || '').toLowerCase()
  return m !== 'city_ledger' && m !== 'room_charge' && m !== 'complimentary' && m !== 'pending'
}

export type SettledOutletOrderRow = {
  id: string
  department: string
  order_number: string
  subtotal: number
  payment_method: string | null
  status: string
  settled_at: string | null
  created_at: string
  booking_id: string | null
  guest_name: string | null
  room_number: string | null
  is_complimentary?: boolean | null
}

export async function fetchSettledOutletOrdersInRange(
  admin: SupabaseClient,
  organizationId: string,
  startIso: string,
  endIso: string,
): Promise<SettledOutletOrderRow[]> {
  const { data, error } = await admin
    .from('outlet_orders')
    .select(
      'id, department, order_number, subtotal, payment_method, status, settled_at, created_at, booking_id, guest_name, room_number, is_complimentary',
    )
    .eq('organization_id', organizationId)
    .eq('status', 'settled')
    .gte('settled_at', startIso)
    .lte('settled_at', endIso)

  if (error) throw new Error(error.message)
  return (data || []) as SettledOutletOrderRow[]
}

export function outletOrderAmount(order: SettledOutletOrderRow): number {
  if (order.is_complimentary) return 0
  return Math.max(0, Number(order.subtotal) || 0)
}

/** Folio/city-ledger outlet charges are already in folio_charges — only add immediate/walk-in sales here. */
export function outletOrderCountsAsWalkInRevenue(order: SettledOutletOrderRow): boolean {
  if (order.is_complimentary) return false
  const method = String(order.payment_method || '').toLowerCase()
  return method !== 'city_ledger' && method !== 'room_charge'
}

export function addOutletOrdersToRevenueBuckets(
  orders: SettledOutletOrderRow[],
  buckets: Record<RevenueDepartment, number>,
  departmentFilter: string,
  startYmd: string,
  endYmd: string,
): void {
  for (const o of orders) {
    if (!outletOrderCountsAsWalkInRevenue(o)) continue
    const amt = outletOrderAmount(o)
    if (amt <= 0) continue
    const instant = o.settled_at || o.created_at
    const day = String(instant).slice(0, 10)
    if (day < startYmd || day > endYmd) continue
    const cat = outletDepartmentRevenueCategory(o.department)
    if (departmentFilter !== 'all' && departmentFilter !== cat) continue
    buckets[cat] += amt
  }
}

/** Avoid double-counting in sales collection when both payments + OUT-* paid tx exist. */
export function skipOutletTxnInSalesCollection(row: {
  transaction_id?: string | null
  status?: string | null
  payment_method?: string | null
}): boolean {
  if (!isOutletTransactionId(row.transaction_id)) return false
  const st = String(row.status || '').toLowerCase()
  if (st === 'pending') return true
  const method = String(row.payment_method || '').toLowerCase()
  if (method === 'city_ledger') return true
  return st === 'paid' || st === 'completed'
}

export function isOutletPaymentNotes(notes: string | null | undefined): boolean {
  return extractOutletOrderNumberFromNotes(notes) !== null
}

/** Order numbers voided in the org — used to exclude stale payments from sales collection. */
export async function fetchVoidedOutletOrderNumbers(
  admin: SupabaseClient,
  organizationId: string,
): Promise<Set<string>> {
  const { data, error } = await admin
    .from('outlet_orders')
    .select('order_number')
    .eq('organization_id', organizationId)
    .eq('status', 'void')

  if (error) throw new Error(error.message)
  return new Set(
    (data || []).map((r) => String((r as { order_number: string }).order_number).toUpperCase()),
  )
}

export function isPaymentForVoidedOutletOrder(
  notes: string | null | undefined,
  voidedOrderNumbers: Set<string>,
): boolean {
  const orderNo = extractOutletOrderNumberFromNotes(notes)
  return !!orderNo && voidedOrderNumbers.has(orderNo)
}

export type RecordOutletImmediatePaymentInput = {
  organizationId: string
  userId: string
  orderId: string
  orderNumber: string
  department: string
  departmentLabel: string
  amount: number
  paymentMethod: string
  lineDetail: string
  bookingId?: string | null
  guestName?: string | null
  roomNumber?: string | null
}

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return err.code === '23505' || /duplicate key|already exists/i.test(err.message || '')
}

async function findExistingOutletPayment(
  admin: SupabaseClient,
  input: RecordOutletImmediatePaymentInput,
  notes: string,
): Promise<string | null> {
  let query = admin
    .from('payments')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('amount', input.amount)
    .eq('payment_method', input.paymentMethod)
    .eq('notes', notes)
    .order('created_at', { ascending: false })
    .limit(1)

  query = input.bookingId ? query.eq('booking_id', input.bookingId) : query.is('booking_id', null)

  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data?.id ?? null
}

export async function recordOutletImmediatePayment(
  admin: SupabaseClient,
  input: RecordOutletImmediatePaymentInput,
): Promise<{ paymentId: string | null }> {
  if (input.amount <= 0) return { paymentId: null }

  let guestId: string | null = null
  let guestName = input.guestName?.trim() || ''
  let room = input.roomNumber?.trim() || null

  if (input.bookingId) {
    const { data: bk } = await admin
      .from('bookings')
      .select('guest_id, guests(name), rooms(room_number)')
      .eq('id', input.bookingId)
      .maybeSingle()
    if (bk) {
      guestId = bk.guest_id ?? null
      const g = bk.guests as { name?: string } | null
      if (g?.name) guestName = g.name
      const rm = bk.rooms as { room_number?: string } | null
      if (rm?.room_number) room = rm.room_number
    }
  }

  const notes = buildOutletSettlementNotes(
    input.departmentLabel,
    input.orderNumber,
    input.lineDetail,
  )
  const txDescription = `${input.departmentLabel} — ${input.orderNumber} — ${input.lineDetail}`.slice(
    0,
    500,
  )
  const now = new Date().toISOString()
  const transactionId = outletTransactionId(input.orderNumber)

  const { data: existingTx, error: existingTxErr } = await admin
    .from('transactions')
    .select('id')
    .eq('organization_id', input.organizationId)
    .eq('transaction_id', transactionId)
    .maybeSingle()

  if (existingTxErr) throw new Error(existingTxErr.message)

  let paymentId = await findExistingOutletPayment(admin, input, notes)

  if (!paymentId && !existingTx) {
    const { data: payment, error: payErr } = await admin
      .from('payments')
      .insert({
        organization_id: input.organizationId,
        booking_id: input.bookingId || null,
        guest_id: guestId,
        amount: input.amount,
        payment_method: input.paymentMethod,
        payment_date: now,
        notes,
        received_by: input.userId,
      })
      .select('id')
      .single()

    if (payErr) throw new Error(payErr.message)
    paymentId = payment?.id ?? null
  }

  if (!existingTx) {
    const { error: txErr } = await admin.from('transactions').insert({
      organization_id: input.organizationId,
      booking_id: input.bookingId || null,
      transaction_id: transactionId,
      guest_name: guestName || 'Walk-in',
      room,
      amount: input.amount,
      payment_method: input.paymentMethod,
      status: 'paid',
      description: txDescription,
      received_by: input.userId,
    })

    if (txErr && !isUniqueViolation(txErr)) throw new Error(txErr.message)
  }

  if (paymentId) {
    await admin
      .from('outlet_orders')
      .update({ payment_id: paymentId })
      .eq('id', input.orderId)
  }

  return { paymentId }
}

type DailyRevenueDayRow = {
  date: string
  folioChargesRecognized: number
  subtotal: number
  vatAmount: number
  totalWithVat: number
  chargeCategories: Record<string, number>
}

type DailyRevenuePayload = {
  byDay: DailyRevenueDayRow[]
  periodTotals: {
    subtotal: number
    vat: number
    withVat: number
    charges: number
  }
}

/** Add walk-in / immediate outlet settlements into daily revenue rows (avoids duplicating folio city-ledger lines). */
export function mergeOutletOrdersIntoDailyRevenue(
  payload: DailyRevenuePayload,
  orders: SettledOutletOrderRow[],
  department: string,
  vatRate = 0.075,
): DailyRevenuePayload {
  const dep = department === 'all' ? 'all' : department
  const byDate = new Map(payload.byDay.map((row) => [row.date, { ...row, chargeCategories: { ...row.chargeCategories } }]))

  for (const o of orders) {
    if (!outletOrderCountsAsWalkInRevenue(o)) continue
    const amt = outletOrderAmount(o)
    if (amt <= 0) continue
    const day = String(o.settled_at || o.created_at).slice(0, 10)
    const cat = outletDepartmentRevenueCategory(o.department)
    if (dep !== 'all' && dep !== cat) continue

    const row = byDate.get(day)
    if (!row) continue
    row.folioChargesRecognized += amt
    row.subtotal += amt
    row.vatAmount = row.subtotal * vatRate
    row.totalWithVat = row.subtotal + row.vatAmount
    row.chargeCategories[cat] = (row.chargeCategories[cat] || 0) + amt
  }

  const byDay = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
  const periodTotals = byDay.reduce(
    (acc, row) => {
      acc.subtotal += row.subtotal
      acc.vat += row.vatAmount
      acc.withVat += row.totalWithVat
      acc.charges += row.folioChargesRecognized
      return acc
    },
    { subtotal: 0, vat: 0, withVat: 0, charges: 0 },
  )

  return { ...payload, byDay, periodTotals }
}
