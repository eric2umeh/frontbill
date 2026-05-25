import type { SupabaseClient } from '@supabase/supabase-js'
import {
  notifyNightAuditApproversNewRequest,
  type NightAuditNotifyKind,
} from '@/lib/email/night-audit-request-notify'

export async function notifyNightAuditRequestCreated(
  admin: SupabaseClient,
  params: {
    organizationId: string
    callerId: string
    kind: NightAuditNotifyKind
    requestId: string
    reason: string
    detailLines: Array<{ label: string; value: string }>
  },
): Promise<void> {
  try {
    const { data: requesterProf } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', params.callerId)
      .maybeSingle()
    const requesterLabel =
      requesterProf?.full_name?.trim() || `User ${String(params.callerId).slice(0, 8)}`
    await notifyNightAuditApproversNewRequest({
      organizationId: params.organizationId,
      kind: params.kind,
      requestId: params.requestId,
      requestedByLabel: requesterLabel,
      reasonPreview: params.reason,
      detailLines: params.detailLines,
    })
  } catch (e) {
    console.error(`[night-audit-notify] ${params.kind} after insert:`, e)
  }
}
