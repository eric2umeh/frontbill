'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { ArrowLeft, BarChart3, Download, Loader2, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase/client'
import { canonicalRoleKey } from '@/lib/permissions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { OperationalReportSummary } from '@/lib/usage/monthly-report'
import {
  downloadCsvFile,
  downloadJsonFile,
  downloadTextFile,
  rowsToCsv,
} from '@/lib/usage/download-csv'
import { formatNaira } from '@/lib/utils/currency'

type OperationalReportPack = {
  summary: OperationalReportSummary
  readme: string
  staff_activity: Array<{
    full_name: string | null
    role: string | null
    email: string | null
    last_sign_in_at: string | null
    created_at: string | null
  }>
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
}

function defaultMonth(): string {
  return format(new Date(), 'yyyy-MM')
}

function buildSummaryText(pack: OperationalReportPack): string {
  const s = pack.summary
  return [
    'FrontBill — Monthly operational summary',
    '====================================',
    '',
    `Property: ${s.organization_name}`,
    `Organization ID: ${s.organization_id}`,
    `Reporting month: ${s.month}`,
    `Generated at: ${s.exported_at}`,
    '',
    'Staff activity',
    `- Staff accounts: ${s.staff_count}`,
    `- Signed in this month: ${s.staff_signed_in_month}`,
    `- Monthly active users: ${s.monthly_active_users}`,
    `- App installs: ${s.app_installs}`,
    `- Home-screen (standalone) users: ${s.standalone_users}`,
    '',
    'Operations',
    `- Bookings created: ${s.bookings_created}`,
    `- Booking value (NGN): ${s.booking_value.toLocaleString()}`,
    `- Night audits completed: ${s.night_audits_run}`,
    `- Payments recorded: ${s.payments_count} (${formatNaira(s.payments_total)})`,
    `- Paid transactions: ${s.transactions_count} (${formatNaira(s.transactions_total)})`,
    '',
    pack.readme,
  ].join('\n')
}

export default function OperationalReportPage() {
  const { userId, role, organizationId } = useAuth()
  const [month, setMonth] = useState(defaultMonth)
  const [loading, setLoading] = useState(false)
  const [pack, setPack] = useState<OperationalReportPack | null>(null)

  const isSuperadmin = canonicalRoleKey(role) === 'superadmin'

  const loadPack = useCallback(async () => {
    if (!userId || !isSuperadmin) return
    setLoading(true)
    try {
      const supabase = createClient()
      const headers: Record<string, string> = {}
      if (supabase) {
        const {
          data: { session },
        } = await supabase.auth.getSession()
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`
        }
      }
      const res = await fetch(`/api/operational-report?month=${encodeURIComponent(month)}`, {
        credentials: 'include',
        headers,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load report')
      setPack(json as OperationalReportPack)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to load report')
      setPack(null)
    } finally {
      setLoading(false)
    }
  }, [userId, isSuperadmin, month])

  useEffect(() => {
    if (isSuperadmin) void loadPack()
  }, [isSuperadmin, loadPack])

  const prefix = pack ? `frontbill_operational_${pack.summary.month}` : 'frontbill_operational'

  const downloadAll = () => {
    if (!pack) return
    downloadTextFile(`${prefix}_README.txt`, pack.readme)
    downloadTextFile(`${prefix}_summary.txt`, buildSummaryText(pack))
    downloadJsonFile(`${prefix}_full.json`, pack)

    downloadCsvFile(
      `${prefix}_staff_activity.csv`,
      rowsToCsv(
        ['full_name', 'role', 'email', 'last_sign_in_at', 'created_at'],
        pack.staff_activity.map((r) => [
          r.full_name,
          r.role,
          r.email,
          r.last_sign_in_at,
          r.created_at,
        ]),
      ),
    )

    downloadCsvFile(
      `${prefix}_bookings_by_month.csv`,
      rowsToCsv(
        ['month', 'bookings_created', 'booking_value'],
        pack.bookings_by_month.map((r) => [r.month, r.bookings_created, r.booking_value]),
      ),
    )

    downloadCsvFile(
      `${prefix}_night_audits.csv`,
      rowsToCsv(
        ['audit_date', 'created_at', 'created_by'],
        pack.night_audits.map((r) => [r.audit_date, r.created_at, r.created_by]),
      ),
    )

    downloadCsvFile(
      `${prefix}_payments_by_month.csv`,
      rowsToCsv(
        ['month', 'payments', 'total_collected'],
        pack.payments_by_month.map((r) => [r.month, r.payments, r.total_collected]),
      ),
    )

    downloadCsvFile(
      `${prefix}_app_usage_summary.csv`,
      rowsToCsv(
        ['signal_type', 'month', 'signal_count', 'unique_users'],
        pack.usage_by_signal.map((r) => [
          r.signal_type,
          r.month,
          r.signal_count,
          r.unique_users,
        ]),
      ),
    )

    downloadCsvFile(
      `${prefix}_app_usage_detail.csv`,
      rowsToCsv(
        ['signal_type', 'user_id', 'created_at', 'user_agent'],
        pack.usage_detail.map((r) => [r.signal_type, r.user_id, r.created_at, r.user_agent]),
      ),
    )

    toast.success('Report files downloaded')
  }

  if (!isSuperadmin) {
    return (
      <div className="max-w-lg mx-auto py-12 text-center space-y-3">
        <Shield className="h-10 w-10 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Operational reports are available to Superadmin only.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings">Back to Settings</Link>
        </Button>
      </div>
    )
  }

  const s = pack?.summary

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10">
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" asChild>
          <Link href="/settings">
            <ArrowLeft className="h-4 w-4" />
            Settings
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Operational report
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Monthly summary of staff activity, bookings, payments, night audits, and app adoption for
          your property. Export CSVs for your records or stakeholder reviews.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reporting period</CardTitle>
          <CardDescription>
            Property {organizationId.slice(0, 8)}… — exports are timestamped when generated.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="report-month">Month</Label>
            <Input
              id="report-month"
              type="month"
              className="w-[160px]"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <Button variant="outline" disabled={loading} onClick={() => void loadPack()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
          </Button>
          <Button disabled={!pack || loading} className="gap-2" onClick={downloadAll}>
            <Download className="h-4 w-4" />
            Download report pack
          </Button>
        </CardContent>
      </Card>

      {loading && !pack ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      {s ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Staff signed in</p>
                <p className="text-2xl font-bold">
                  {s.staff_signed_in_month}
                  <span className="text-sm font-normal text-muted-foreground">
                    {' '}
                    / {s.staff_count}
                  </span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Bookings (month)</p>
                <p className="text-2xl font-bold">{s.bookings_created}</p>
                <p className="text-xs text-muted-foreground">{formatNaira(s.booking_value)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Night audits</p>
                <p className="text-2xl font-bold">{s.night_audits_run}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Payments</p>
                <p className="text-2xl font-bold">{s.payments_count}</p>
                <p className="text-xs text-muted-foreground">{formatNaira(s.payments_total)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">App adoption</p>
                <p className="text-lg font-bold">
                  {s.app_installs} installs · {s.standalone_users} home-screen
                </p>
                <p className="text-xs text-muted-foreground">
                  Active users: {s.monthly_active_users}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Generated</p>
                <p className="text-sm font-medium">{s.exported_at}</p>
                <Badge variant="outline" className="mt-1 text-[10px]">
                  {s.organization_name}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Monthly export tips</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                1. Download the report pack on the same day each month so timestamps stay
                consistent.
              </p>
              <p>
                2. Keep CSVs with your finance or management records alongside Daily Book and Night
                Audit screenshots.
              </p>
              <p>
                3. App usage rows appear after{' '}
                <code className="text-xs bg-muted px-1 rounded">082_usage_logs.sql</code> is applied
                on Supabase and staff use the installed app.
              </p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
