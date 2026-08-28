import type { SupabaseClient } from '@supabase/supabase-js'

export type OperationalStaffRow = {
  full_name: string | null
  role: string | null
  email: string | null
  last_sign_in_at: string | null
  created_at: string | null
}

export type OperationalReportSummary = {
  month: string
  organization_id: string
  organization_name: string
  exported_at: string
  staff_count: number
  staff_signed_in_month: number
  bookings_created: number
  booking_value: number
  night_audits_run: number
  payments_count: number
  payments_total: number
  transactions_count: number
  transactions_total: number
  app_installs: number
  standalone_users: number
  daily_sign_in_users: number
  monthly_active_users: number
  first_opens: number
  return_opens: number
}

function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) {
    const now = new Date()
    const yy = now.getUTCFullYear()
    const mm = now.getUTCMonth() + 1
    const start = new Date(Date.UTC(yy, mm - 1, 1))
    const end = new Date(Date.UTC(yy, mm, 0, 23, 59, 59, 999))
    return { start: start.toISOString(), end: end.toISOString() }
  }
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999))
  return { start: start.toISOString(), end: end.toISOString() }
}

async function loadStaffWithAuth(
  admin: SupabaseClient,
  organizationId: string,
): Promise<OperationalStaffRow[]> {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, role')
    .eq('organization_id', organizationId)

  const rows: OperationalStaffRow[] = []
  for (const p of profiles || []) {
    const id = (p as { id: string }).id
    let email: string | null = null
    let lastSignIn: string | null = null
    let createdAt: string | null = null
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(id)
      email = authUser.user?.email ?? null
      lastSignIn = authUser.user?.last_sign_in_at ?? null
      createdAt = authUser.user?.created_at ?? null
    } catch {
      /* skip */
    }
    rows.push({
      full_name: (p as { full_name?: string | null }).full_name ?? null,
      role: (p as { role?: string | null }).role ?? null,
      email,
      last_sign_in_at: lastSignIn,
      created_at: createdAt,
    })
  }
  return rows.sort((a, b) => {
    const ta = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
    const tb = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
    return tb - ta
  })
}

export async function buildOperationalReport(
  admin: SupabaseClient,
  organizationId: string,
  month: string,
): Promise<{
  summary: OperationalReportSummary
  staff_activity: OperationalStaffRow[]
  bookings_by_month: Array<{ month: string; bookings_created: number; booking_value: number }>
  night_audits: Array<{ audit_date: string; created_at: string; created_by: string | null }>
  payments_by_month: Array<{ month: string; payments: number; total_collected: number }>
  usage_by_signal: Array<{
    signal_type: string
    month: string
    signal_count: number
    unique_users: number
  }>
  usage_detail: Array<{
    signal_type: string
    user_id: string | null
    created_at: string
    user_agent: string | null
  }>
}> {
  const { start, end } = monthRange(month)
  const exportedAt = new Date().toISOString()

  const { data: org } = await admin
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .maybeSingle()

  const staff_activity = await loadStaffWithAuth(admin, organizationId)
  const staffSignedInMonth = staff_activity.filter((s) => {
    if (!s.last_sign_in_at) return false
    const t = new Date(s.last_sign_in_at).getTime()
    return t >= new Date(start).getTime() && t <= new Date(end).getTime()
  }).length

  const { data: bookingsMonth } = await admin
    .from('bookings')
    .select('id, total_amount, created_at')
    .eq('organization_id', organizationId)
    .gte('created_at', start)
    .lte('created_at', end)
    .not('status', 'eq', 'cancelled')

  const bookingsCreated = bookingsMonth?.length ?? 0
  const bookingValue = (bookingsMonth || []).reduce(
    (s, b) => s + Number((b as { total_amount?: number }).total_amount || 0),
    0,
  )

  const { data: bookingsAll } = await admin
    .from('bookings')
    .select('created_at, total_amount')
    .eq('organization_id', organizationId)
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: true })

  const bookingsByMonthMap = new Map<string, { count: number; value: number }>()
  for (const b of bookingsAll || []) {
    const created = String((b as { created_at?: string }).created_at || '')
    const key = created.slice(0, 7)
    if (!key || key.length < 7) continue
    const cur = bookingsByMonthMap.get(key) || { count: 0, value: 0 }
    cur.count += 1
    cur.value += Number((b as { total_amount?: number }).total_amount || 0)
    bookingsByMonthMap.set(key, cur)
  }
  const bookings_by_month = [...bookingsByMonthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, v]) => ({
      month: m,
      bookings_created: v.count,
      booking_value: Math.round(v.value * 100) / 100,
    }))

  const { data: nightAudits } = await admin
    .from('night_audits')
    .select('audit_date, created_at, created_by')
    .eq('organization_id', organizationId)
    .gte('audit_date', start.slice(0, 10))
    .lte('audit_date', end.slice(0, 10))
    .order('audit_date', { ascending: false })

  const night_audits = (nightAudits || []).map((n) => ({
    audit_date: String((n as { audit_date: string }).audit_date),
    created_at: String((n as { created_at: string }).created_at),
    created_by: ((n as { created_by?: string | null }).created_by ?? null) as string | null,
  }))

  const { data: paymentsMonth } = await admin
    .from('payments')
    .select('amount, payment_date')
    .eq('organization_id', organizationId)
    .gte('payment_date', start)
    .lte('payment_date', end)

  const paymentsCount = paymentsMonth?.length ?? 0
  const paymentsTotal = (paymentsMonth || []).reduce(
    (s, p) => s + Number((p as { amount?: number }).amount || 0),
    0,
  )

  const { data: paymentsAll } = await admin
    .from('payments')
    .select('amount, payment_date')
    .eq('organization_id', organizationId)
    .order('payment_date', { ascending: true })

  const paymentsByMonthMap = new Map<string, { count: number; total: number }>()
  for (const p of paymentsAll || []) {
    const pd = String((p as { payment_date?: string }).payment_date || '')
    const key = pd.slice(0, 7)
    if (!key || key.length < 7) continue
    const cur = paymentsByMonthMap.get(key) || { count: 0, total: 0 }
    cur.count += 1
    cur.total += Number((p as { amount?: number }).amount || 0)
    paymentsByMonthMap.set(key, cur)
  }
  const payments_by_month = [...paymentsByMonthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, v]) => ({
      month: m,
      payments: v.count,
      total_collected: Math.round(v.total * 100) / 100,
    }))

  const { data: txMonth } = await admin
    .from('transactions')
    .select('amount, status')
    .eq('organization_id', organizationId)
    .gte('created_at', start)
    .lte('created_at', end)

  const paidTx = (txMonth || []).filter(
    (t) => String((t as { status?: string }).status || '').toLowerCase() === 'paid',
  )
  const transactionsCount = paidTx.length
  const transactionsTotal = paidTx.reduce(
    (s, t) => s + Number((t as { amount?: number }).amount || 0),
    0,
  )

  let usage_detail: Array<{
    signal_type: string
    user_id: string | null
    created_at: string
    user_agent: string | null
  }> = []
  let usage_by_signal: Array<{
    signal_type: string
    month: string
    signal_count: number
    unique_users: number
  }> = []
  let appInstalls = 0
  let standaloneUsers = 0
  let signInUsers = 0
  let mau = 0
  let firstOpens = 0
  let returnOpens = 0

  const { data: logs, error: logsError } = await admin
    .from('usage_logs')
    .select('signal_type, user_id, created_at, user_agent')
    .eq('organization_id', organizationId)
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (!logsError && logs) {
    usage_detail = logs.map((e) => ({
      signal_type: String((e as { signal_type: string }).signal_type),
      user_id: ((e as { user_id?: string | null }).user_id ?? null) as string | null,
      created_at: String((e as { created_at: string }).created_at),
      user_agent: ((e as { user_agent?: string | null }).user_agent ?? null) as string | null,
    }))

    const bySignal = new Map<string, { count: number; users: Set<string> }>()
    const allUsers = new Set<string>()
    for (const e of logs) {
      const st = String((e as { signal_type: string }).signal_type)
      const uid = (e as { user_id?: string | null }).user_id
      if (!bySignal.has(st)) bySignal.set(st, { count: 0, users: new Set() })
      const bucket = bySignal.get(st)!
      bucket.count += 1
      if (uid) {
        bucket.users.add(uid)
        allUsers.add(uid)
      }
      if (st === 'app_installed') appInstalls += 1
      if (st === 'first_open') firstOpens += 1
      if (st === 'return_open') returnOpens += 1
    }
    standaloneUsers = bySignal.get('standalone_open')?.users.size ?? 0
    signInUsers = bySignal.get('daily_sign_in')?.users.size ?? 0
    mau = allUsers.size

    usage_by_signal = [...bySignal.entries()].map(([signal_type, v]) => ({
      signal_type,
      month,
      signal_count: v.count,
      unique_users: v.users.size,
    }))
  }

  const summary: OperationalReportSummary = {
    month,
    organization_id: organizationId,
    organization_name: String(org?.name || 'Hotel'),
    exported_at: exportedAt,
    staff_count: staff_activity.length,
    staff_signed_in_month: staffSignedInMonth,
    bookings_created: bookingsCreated,
    booking_value: Math.round(bookingValue * 100) / 100,
    night_audits_run: night_audits.length,
    payments_count: paymentsCount,
    payments_total: Math.round(paymentsTotal * 100) / 100,
    transactions_count: transactionsCount,
    transactions_total: Math.round(transactionsTotal * 100) / 100,
    app_installs: appInstalls,
    standalone_users: standaloneUsers,
    daily_sign_in_users: signInUsers,
    monthly_active_users: mau,
    first_opens: firstOpens,
    return_opens: returnOpens,
  }

  return {
    summary,
    staff_activity,
    bookings_by_month,
    night_audits,
    payments_by_month,
    usage_by_signal,
    usage_detail,
  }
}
