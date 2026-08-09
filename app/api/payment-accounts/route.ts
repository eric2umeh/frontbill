import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalRoleKey, hasPermission } from '@/lib/permissions'
import {
  formatPaymentAccountLabel,
  type PaymentAccountKind,
} from '@/lib/payments/payment-accounts'

async function resolveCaller(request: Request) {
  const cookieSb = await createClient()
  const {
    data: { user },
  } = await cookieSb.auth.getUser()

  let userId = user?.id ?? null
  const admin = createAdminClient()

  if (!userId) {
    const raw = request.headers.get('authorization')?.trim()
    const bearer = raw?.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : null
    if (!bearer) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    const { data, error } = await admin.auth.getUser(bearer)
    if (error || !data.user?.id) {
      return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    userId = data.user.id
  }

  const { data: profile, error: pe } = await admin
    .from('profiles')
    .select('role, organization_id')
    .eq('id', userId)
    .single()

  if (pe || !profile?.organization_id) {
    return { error: NextResponse.json({ error: 'Profile not found' }, { status: 403 }) }
  }

  return {
    admin,
    userId,
    organizationId: profile.organization_id as string,
    role: profile.role as string,
  }
}

function canManageAccounts(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role)
  return k === 'superadmin' || hasPermission(role, 'settings:manage')
}

function isMissingTableError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false
  const msg = String(err.message || '').toLowerCase()
  return (
    err.code === '42P01' ||
    msg.includes('payment_accounts') && (msg.includes('does not exist') || msg.includes('schema cache'))
  )
}

/** GET — list payment accounts for the caller's hotel (active by default). */
export async function GET(request: Request) {
  try {
    const caller = await resolveCaller(request)
    if ('error' in caller && caller.error) return caller.error

    const { admin, organizationId } = caller
    const { searchParams } = new URL(request.url)
    const includeInactive = searchParams.get('include_inactive') === '1'
    const method = searchParams.get('method') || ''

    let q = admin
      .from('payment_accounts')
      .select('*')
      .eq('organization_id', organizationId)
      .order('sort_order', { ascending: true })
      .order('bank_name', { ascending: true })

    if (!includeInactive) q = q.eq('is_active', true)

    const { data, error } = await q
    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ accounts: [], dbAvailable: false })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let accounts = data || []
    if (method) {
      const m = method.toLowerCase().replace(/-/g, '_')
      const want = m === 'bank_transfer' ? 'transfer' : m
      accounts = accounts.filter(
        (a: { kind?: string }) => a.kind === 'both' || a.kind === want,
      )
    }

    return NextResponse.json({ accounts, dbAvailable: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load payment accounts'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/** POST — create a payment account (superadmin / settings:manage). */
export async function POST(request: Request) {
  try {
    const caller = await resolveCaller(request)
    if ('error' in caller && caller.error) return caller.error
    const { admin, userId, organizationId, role } = caller

    if (!canManageAccounts(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const bank_name = String(body.bank_name || '').trim()
    const account_number = String(body.account_number || '').trim()
    const account_name = String(body.account_name || '').trim()
    const kind = (String(body.kind || 'both').trim() || 'both') as PaymentAccountKind
    if (!bank_name || !account_number || !account_name) {
      return NextResponse.json(
        { error: 'bank_name, account_number, and account_name are required' },
        { status: 400 },
      )
    }
    if (!['pos', 'transfer', 'both'].includes(kind)) {
      return NextResponse.json({ error: 'kind must be pos, transfer, or both' }, { status: 400 })
    }

    const label = formatPaymentAccountLabel({ bank_name, account_number, account_name })
    const { data, error } = await admin
      .from('payment_accounts')
      .insert([
        {
          organization_id: organizationId,
          bank_name,
          account_number,
          account_name,
          label,
          kind,
          is_active: true,
          created_by: userId,
        },
      ])
      .select('*')
      .single()

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          { error: 'Run SQL script 076_payment_accounts.sql in Supabase first.' },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ account: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create payment account'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
