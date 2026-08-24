'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import {
  canonicalRoleKey,
  canAdminTestApproveSupplyPo,
  canSupplyPoAccountantReview,
  canSupplyPoManagerReview,
  canSupplyRetirementReview,
} from '@/lib/permissions'
import { playNotificationBeep } from '@/lib/utils/play-notification-beep'

const DISMISSED_KEY_PREFIX = 'frontbill_supply_pending_dismissed'

function storageKey(orgId: string | null | undefined, userId: string | null | undefined) {
  return `${DISMISSED_KEY_PREFIX}:${orgId || 'org'}:${userId || 'user'}`
}

function loadDismissed(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(key)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(Array.isArray(list) ? list : [])
  } catch {
    return new Set()
  }
}

function persistDismissed(key: string, dismissed: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...dismissed].slice(-200)))
  } catch {
    /* ignore */
  }
}

function poAlertKey(po: { id: string; status: string }) {
  return `${po.id}:${po.status}`
}

/**
 * Toast + beep when org PO / retirement queues gain new items (cross-user on staging/prod).
 * Dismissed / clicked / auto-closed toasts are stored in localStorage so they do not return.
 */
export function SupplyPendingAlerts() {
  const { role, organizationId, userId } = useAuth()
  const { purchaseOrders } = useSupplyChain()
  const router = useRouter()
  const storeKey = storageKey(organizationId, userId)
  const dismissedRef = useRef<Set<string>>(new Set())
  const storeKeyRef = useRef(storeKey)
  const prevFingerprintRef = useRef<string | null>(null)
  const mountAtRef = useRef(Date.now())
  const roleKey = canonicalRoleKey(role) ?? ''

  useEffect(() => {
    if (storeKeyRef.current !== storeKey) {
      storeKeyRef.current = storeKey
      dismissedRef.current = loadDismissed(storeKey)
      prevFingerprintRef.current = null
      mountAtRef.current = Date.now()
    } else if (dismissedRef.current.size === 0) {
      dismissedRef.current = loadDismissed(storeKey)
    }
  }, [storeKey])

  useEffect(() => {
    const fingerprint = purchaseOrders
      .map((po) => poAlertKey(po))
      .sort()
      .join('|')

    const markDismissed = (key: string) => {
      dismissedRef.current.add(key)
      persistDismissed(storeKey, dismissedRef.current)
    }

    const silentBaseline = () => {
      for (const po of purchaseOrders) {
        dismissedRef.current.add(poAlertKey(po))
      }
      persistDismissed(storeKey, dismissedRef.current)
      prevFingerprintRef.current = fingerprint
    }

    // First observation this mount — never toast existing backlog.
    if (prevFingerprintRef.current === null) {
      silentBaseline()
      return
    }

    // Empty → loaded shortly after open is hydration, not a "new" event.
    if (
      prevFingerprintRef.current === '' &&
      fingerprint !== '' &&
      Date.now() - mountAtRef.current < 8_000
    ) {
      silentBaseline()
      return
    }

    if (prevFingerprintRef.current === fingerprint) return
    prevFingerprintRef.current = fingerprint

    const canPoAccountant = canSupplyPoAccountantReview(role)
    const canPoManager = canSupplyPoManagerReview(role)
    const canRetirement = canSupplyRetirementReview(role)
    const admin = canAdminTestApproveSupplyPo(role)

    for (const po of purchaseOrders) {
      const key = poAlertKey(po)
      if (dismissedRef.current.has(key)) continue

      const dismissForever = () => markDismissed(key)

      if (po.status === 'pending_accountant' && (canPoAccountant || admin)) {
        markDismissed(key)
        playNotificationBeep()
        toast.info(`New purchase order — ${po.poNumber}`, {
          id: `supply-alert-${key}`,
          description: `${po.createdByName} sent a PO for accountant review.`,
          duration: 12_000,
          onDismiss: dismissForever,
          onAutoClose: dismissForever,
          action: {
            label: 'Review',
            onClick: () => {
              dismissForever()
              router.push('/supply/purchase-orders?tab=approvals')
            },
          },
        })
        continue
      }

      if (po.status === 'pending_manager' && (canPoManager || admin)) {
        markDismissed(key)
        playNotificationBeep()
        toast.info(`PO awaiting manager — ${po.poNumber}`, {
          id: `supply-alert-${key}`,
          description: 'Accountant approved — manager review needed.',
          duration: 12_000,
          onDismiss: dismissForever,
          onAutoClose: dismissForever,
          action: {
            label: 'Review',
            onClick: () => {
              dismissForever()
              router.push('/supply/purchase-orders?tab=approvals')
            },
          },
        })
        continue
      }

      if (
        po.status === 'retired' &&
        (canPoAccountant || canPoManager || admin || roleKey === 'accountant')
      ) {
        markDismissed(key)
        playNotificationBeep()
        toast.info(`PO retired — ${po.poNumber}`, {
          id: `supply-alert-${key}`,
          description: `${po.retirement?.submittedBy ?? 'Store'} retired this PO. Central store stock was updated.`,
          duration: 12_000,
          onDismiss: dismissForever,
          onAutoClose: dismissForever,
          action: {
            label: 'View history',
            onClick: () => {
              dismissForever()
              router.push('/supply/purchasing?tab=history')
            },
          },
        })
        continue
      }

      if (
        po.status === 'retirement_pending_accountant' &&
        (canRetirement || admin)
      ) {
        markDismissed(key)
        playNotificationBeep()
        toast.info(`Retirement submitted — ${po.poNumber}`, {
          id: `supply-alert-${key}`,
          description: `${po.retirement?.submittedBy ?? 'Purchaser'} submitted market retirement.`,
          duration: 12_000,
          onDismiss: dismissForever,
          onAutoClose: dismissForever,
          action: {
            label: 'Review',
            onClick: () => {
              dismissForever()
              router.push('/supply/purchasing?tab=retirement')
            },
          },
        })
        continue
      }

      if (
        po.status === 'retirement_rejected' &&
        (roleKey === 'purchaser' || roleKey === 'admin' || roleKey === 'superadmin')
      ) {
        markDismissed(key)
        playNotificationBeep()
        toast.warning(`Retirement rejected — ${po.poNumber}`, {
          id: `supply-alert-${key}`,
          description: po.retirementComment || 'Edit and resubmit from Retirement.',
          duration: 12_000,
          onDismiss: dismissForever,
          onAutoClose: dismissForever,
          action: {
            label: 'Open Retirement',
            onClick: () => {
              dismissForever()
              router.push('/supply/purchasing')
            },
          },
        })
      }
    }
  }, [purchaseOrders, role, roleKey, router, storeKey])

  return null
}
