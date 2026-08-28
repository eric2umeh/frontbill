import { NextResponse } from 'next/server'
import { buildOperationalReport } from '@/lib/usage/monthly-report'
import { requireSuperadminOrg } from '@/lib/usage/require-superadmin'

function isYmdMonth(s: string) {
  return /^\d{4}-\d{2}$/.test(s)
}

export async function GET(request: Request) {
  try {
    const gate = await requireSuperadminOrg(request)
    if ('error' in gate) return gate.error

    const { searchParams } = new URL(request.url)
    const month =
      searchParams.get('month')?.trim() ||
      new Date().toISOString().slice(0, 7)

    if (!isYmdMonth(month)) {
      return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 })
    }

    const pack = await buildOperationalReport(gate.admin, gate.organizationId, month)

    return NextResponse.json({
      ok: true,
      ...pack,
      readme: [
        `exported_at: ${pack.summary.exported_at}`,
        `source: FrontBill`,
        `org: ${pack.summary.organization_name} (${pack.summary.organization_id})`,
        `month: ${month}`,
      ].join(' | '),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Report failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
