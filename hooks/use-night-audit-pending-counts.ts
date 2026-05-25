'use client'

import { createContext, useContext } from 'react'
import type { NightAuditPendingCounts } from '@/lib/night-audit/pending-approval-counts'
import { EMPTY_NIGHT_AUDIT_PENDING_COUNTS } from '@/lib/night-audit/pending-approval-counts'

export const NightAuditPendingCountContext = createContext<NightAuditPendingCounts>(
  EMPTY_NIGHT_AUDIT_PENDING_COUNTS,
)

export function useNightAuditPendingCounts(): NightAuditPendingCounts {
  return useContext(NightAuditPendingCountContext)
}

/** @deprecated Use {@link useNightAuditPendingCounts} — returns backdate count only. */
export function useBackdatePendingCount(): number {
  return useNightAuditPendingCounts().backdate
}
