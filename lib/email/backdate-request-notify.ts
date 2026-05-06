import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/admin'
import { canonicalRoleKey } from '@/lib/permissions'

function isBackdateApproverRole(role: string | null | undefined): boolean {
  const k = canonicalRoleKey(role)
  return k === 'admin' || k === 'superadmin'
}

function appBaseUrl(): string {
  const u = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
  if (!u) return ''
  if (u.startsWith('http')) return u.replace(/\/$/, '')
  return `https://${u.replace(/\/$/, '')}`
}

function parseExtraEmails(): string[] {
  const raw = process.env.BACKDATE_NOTIFY_EXTRA_EMAILS || ''
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}

/**
 * Email Superadmin / Administrator users in the org about a new pending backdate request.
 * Best-effort: failures are logged, never thrown.
 */
export async function notifyApproversNewBackdateRequest(params: {
  organizationId: string
  requestId: string
  requestType: string
  requestedCheckIn: string
  requestedByLabel: string
  reasonPreview: string
}): Promise<void> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('[backdate-notify] RESEND_API_KEY not set; skipping email')
    return
  }

  try {
    const admin = createAdminClient()
    const { data: profiles, error: pErr } = await admin
      .from('profiles')
      .select('id, role')
      .eq('organization_id', params.organizationId)

    if (pErr || !profiles?.length) {
      console.warn('[backdate-notify] No profiles for org:', pErr?.message)
      return
    }

    const approverIds = profiles.filter((p: { role?: string }) => isBackdateApproverRole(p.role)).map((p: { id: string }) => p.id)
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
      console.warn('[backdate-notify] No approver emails resolved; set BACKDATE_NOTIFY_EXTRA_EMAILS or ensure admins have auth emails')
      return
    }

    const { data: org } = await admin.from('organizations').select('name, email').eq('id', params.organizationId).maybeSingle()
    const orgName = org?.name || 'Hotel'
    if (org?.email) emails.add(String(org.email).trim())

    const base = appBaseUrl()
    const link = base ? `${base}/night-audit?tab=backdate-requests` : '/night-audit?tab=backdate-requests'
    const resend = new Resend(key)
    const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
    const typeLabel = String(params.requestType).replace(/_/g, ' ')
    const preview = params.reasonPreview.length > 220 ? `${params.reasonPreview.slice(0, 217)}…` : params.reasonPreview

    const subject = `[FrontBill] Backdate request pending — ${orgName}`
    const html = `
      <p>A staff member submitted a <strong>backdate request</strong> that needs Night Audit approval.</p>
      <ul>
        <li><strong>Property:</strong> ${escapeHtml(orgName)}</li>
        <li><strong>Type:</strong> ${escapeHtml(typeLabel)}</li>
        <li><strong>Requested check-in:</strong> ${escapeHtml(params.requestedCheckIn)}</li>
        <li><strong>Requested by:</strong> ${escapeHtml(params.requestedByLabel)}</li>
      </ul>
      <p><strong>Reason:</strong> ${escapeHtml(preview)}</p>
      <p>Open <strong>Night Audit</strong> → <strong>Backdate Requests</strong> in FrontBill: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
      <p style="color:#666;font-size:12px">Request id: ${escapeHtml(params.requestId)}</p>
    `

    await resend.emails.send({
      from,
      to: Array.from(emails),
      subject,
      html,
    })
  } catch (e) {
    console.error('[backdate-notify] send failed:', e)
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
