import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalRoleKey } from '@/lib/permissions'

export type NightAuditNotifyKind =
  | 'backdate'
  | 'room_change'
  | 'reschedule_stay'
  | 'extend_discount'

function appBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (!u) return ''
  if (u.startsWith('http')) return u.replace(/\/$/, '')
  return `https://${u.replace(/\/$/, '')}`
}

function parseExtraEmails(): string[] {
  const raw =
    process.env.NIGHT_AUDIT_NOTIFY_EXTRA_EMAILS ||
    process.env.BACKDATE_NOTIFY_EXTRA_EMAILS ||
    ''
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}

function approverRolesForKind(kind: NightAuditNotifyKind): Set<string> {
  if (kind === 'backdate') return new Set(['superadmin', 'admin'])
  return new Set(['superadmin', 'admin', 'manager'])
}

function tabForKind(kind: NightAuditNotifyKind): string {
  switch (kind) {
    case 'backdate':
      return 'backdate-requests'
    case 'room_change':
      return 'room-change-requests'
    case 'reschedule_stay':
      return 'reschedule-stay-requests'
    case 'extend_discount':
      return 'extend-discount'
  }
}

function subjectForKind(kind: NightAuditNotifyKind, orgName: string): string {
  const labels: Record<NightAuditNotifyKind, string> = {
    backdate: 'Backdate request',
    room_change: 'Room change request',
    reschedule_stay: 'Move dates request',
    extend_discount: 'Extend stay discount request',
  }
  return `[FrontBill] ${labels[kind]} pending — ${orgName}`
}

/**
 * Email approvers about a new Night Audit approval item.
 * Best-effort: failures are logged, never thrown.
 */
export async function notifyNightAuditApproversNewRequest(params: {
  organizationId: string
  kind: NightAuditNotifyKind
  requestId: string
  requestedByLabel: string
  reasonPreview: string
  detailLines: Array<{ label: string; value: string }>
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[night-audit-notify] RESEND_API_KEY not set; skipping email')
    return
  }

  try {
    const admin = createAdminClient()
    const { data: profiles, error: pErr } = await admin
      .from('profiles')
      .select('id, role')
      .eq('organization_id', params.organizationId)

    if (pErr || !profiles?.length) {
      console.warn('[night-audit-notify] No profiles for org:', pErr?.message)
      return
    }

    const allowed = approverRolesForKind(params.kind)
    const approverIds = profiles
      .filter((p: { role?: string }) => allowed.has(canonicalRoleKey(p.role) || ''))
      .map((p: { id: string }) => p.id)

    const emails = new Set<string>(parseExtraEmails())
    for (const id of approverIds) {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id)
        if (!error && data.user?.email) emails.add(data.user.email)
      } catch {
        // ignore per-user
      }
    }

    if (emails.size === 0) {
      console.warn(
        '[night-audit-notify] No approver emails resolved; set NIGHT_AUDIT_NOTIFY_EXTRA_EMAILS or BACKDATE_NOTIFY_EXTRA_EMAILS',
      )
      return
    }

    const { data: org } = await admin
      .from('organizations')
      .select('name, email')
      .eq('id', params.organizationId)
      .maybeSingle()
    const orgName = org?.name || 'Hotel'
    if (org?.email) emails.add(String(org.email).trim())

    const base = appBaseUrl()
    const tab = tabForKind(params.kind)
    const link = base ? `${base}/night-audit?tab=${tab}` : `/night-audit?tab=${tab}`
    const preview =
      params.reasonPreview.length > 220
        ? `${params.reasonPreview.slice(0, 217)}…`
        : params.reasonPreview

    const detailHtml = params.detailLines
      .map((d) => `<li><strong>${escapeHtml(d.label)}:</strong> ${escapeHtml(d.value)}</li>`)
      .join('')

    const resend = new Resend(key)
    const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'

    const html = `
      <p>A staff member submitted a request that needs <strong>Night Audit</strong> approval.</p>
      <ul>
        <li><strong>Property:</strong> ${escapeHtml(orgName)}</li>
        <li><strong>Requested by:</strong> ${escapeHtml(params.requestedByLabel)}</li>
        ${detailHtml}
      </ul>
      <p><strong>Reason:</strong> ${escapeHtml(preview)}</p>
      <p>Review in FrontBill: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
      <p style="color:#666;font-size:12px">Request id: ${escapeHtml(params.requestId)}</p>
    `

    await resend.emails.send({
      from,
      to: Array.from(emails),
      subject: subjectForKind(params.kind, orgName),
      html,
    })
  } catch (e) {
    console.error('[night-audit-notify] send failed:', e)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
