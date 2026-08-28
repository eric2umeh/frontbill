import { NextResponse } from 'next/server'
import { isUsageSignalType } from '@/lib/usage/types'
import { requireAuthenticatedOrg } from '@/lib/usage/require-superadmin'

const DAILY_DEDUP_SIGNALS = new Set(['standalone_open', 'daily_sign_in', 'return_open'])

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const signalType = String(body?.signal_type || '').trim()
    const userAgent =
      typeof body?.user_agent === 'string' ? body.user_agent.slice(0, 512) : null

    if (!isUsageSignalType(signalType)) {
      return NextResponse.json({ error: 'Invalid signal_type' }, { status: 400 })
    }

    const gate = await requireAuthenticatedOrg(request, body?.caller_id)
    if ('error' in gate) return gate.error

    const { admin, userId, organizationId } = gate

    if (DAILY_DEDUP_SIGNALS.has(signalType)) {
      const today = new Date().toISOString().slice(0, 10)
      const dayStart = `${today}T00:00:00.000Z`
      const dayEnd = `${today}T23:59:59.999Z`
      const { data: existing } = await admin
        .from('usage_logs')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .eq('signal_type', signalType)
        .gte('created_at', dayStart)
        .lte('created_at', dayEnd)
        .limit(1)
      if (existing?.length) {
        return NextResponse.json({ ok: true, deduped: true })
      }
    }

    if (signalType === 'first_open') {
      const { data: existing } = await admin
        .from('usage_logs')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .eq('signal_type', 'first_open')
        .limit(1)
      if (existing?.length) {
        return NextResponse.json({ ok: true, deduped: true })
      }
    }

    if (signalType === 'app_installed') {
      const { data: existing } = await admin
        .from('usage_logs')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', userId)
        .eq('signal_type', 'app_installed')
        .limit(1)
      if (existing?.length) {
        return NextResponse.json({ ok: true, deduped: true })
      }
    }

    const { error: insertError } = await admin.from('usage_logs').insert([
      {
        organization_id: organizationId,
        user_id: userId,
        signal_type: signalType,
        user_agent: userAgent,
        metadata: { source: 'frontbill_web' },
      },
    ])

    if (insertError) {
      if (insertError.message?.includes('usage_logs')) {
        return NextResponse.json(
          {
            error:
              'usage_logs table missing — run scripts/082_usage_logs.sql on Supabase.',
          },
          { status: 503 },
        )
      }
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to record usage'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
