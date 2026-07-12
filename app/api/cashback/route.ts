import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasPermission } from '@/lib/permissions'
import { fetchCashbackConfig } from '@/lib/cashback/cashback-config'

async function resolveAuthedUserId(request: Request): Promise<string | null> {
  const cookieSb = await createClient()
  const {
    data: { user },
  } = await cookieSb.auth.getUser()
  if (user?.id) return user.id
  const raw = request.headers.get('authorization')?.trim()
  const bearer = raw?.toLowerCase().startsWith('bearer ') ? raw.slice(7).trim() : null
  if (!bearer) return null
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.auth.getUser(bearer)
    if (error || !data.user?.id) return null
    return data.user.id
  } catch {
    return null
  }
}

/** GET — org cashback balances summary + recent transactions. */
export async function GET(request: Request) {
  try {
    const authed = await resolveAuthedUserId(request)
    if (!authed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('role, organization_id')
      .eq('id', authed)
      .single()

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 403 })
    }
    if (!hasPermission(profile.role, 'cashback:view')) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
    }

    const config = await fetchCashbackConfig(admin, profile.organization_id)
    const q = new URL(request.url).searchParams.get('q')?.trim() || ''

    let balanceQuery = admin
      .from('guest_cashback_balances')
      .select('guest_id, earned_total, redeemed_total, balance, guests(name, phone)')
      .eq('organization_id', profile.organization_id)
      .order('balance', { ascending: false })
      .limit(100)

    const { data: balances, error: bErr } = await balanceQuery
    if (bErr) {
      return NextResponse.json({ error: bErr.message, config }, { status: 200 })
    }

    let rows = balances ?? []
    if (q) {
      const lower = q.toLowerCase()
      rows = rows.filter((r) => {
        const g = r.guests as { name?: string; phone?: string } | null
        return (
          g?.name?.toLowerCase().includes(lower) ||
          g?.phone?.toLowerCase().includes(lower)
        )
      })
    }

    const { data: recentTxns } = await admin
      .from('cashback_transactions')
      .select('*, guests(name)')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false })
      .limit(30)

    return NextResponse.json({
      config,
      balances: rows,
      recentTransactions: recentTxns ?? [],
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to load cashback'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
