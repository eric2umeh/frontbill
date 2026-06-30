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

const SEEN_KEY = 'frontbill_supply_pending_seen'

function loadSeen(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    const list = raw ? (JSON.parse(raw) as string[]) : []
    return new Set(Array.isArray(list) ? list : [])
  } catch {
    return new Set()
  }
}

function persistSeen(seen: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-80)))
  } catch {
    /* ignore */
  }
}

/**
 * Toast + beep when org PO / retirement queues gain new items (cross-user on staging/prod).
 */
export function SupplyPendingAlerts() {
  const { role } = useAuth()
  const { purchaseOrders } = useSupplyChain()
  const router = useRouter()
  const seenRef = useRef<Set<string>>(loadSeen())
  const seededRef = useRef(false)
  const roleKey = canonicalRoleKey(role) ?? ''

  useEffect(() => {
    if (!seededRef.current && purchaseOrders.length >= 0) {
      for (const po of purchaseOrders) {
        seenRef.current.add(`${po.id}:${po.status}`)
      }
      seededRef.current = true
      persistSeen(seenRef.current)
      return
    }

    const canPoAccountant = canSupplyPoAccountantReview(role)
    const canPoManager = canSupplyPoManagerReview(role)
    const canRetirement = canSupplyRetirementReview(role)
    const admin = canAdminTestApproveSupplyPo(role)

    for (const po of purchaseOrders) {
      const key = `${po.id}:${po.status}`
      if (seenRef.current.has(key)) continue

      if (
        po.status === 'pending_accountant' &&
        (canPoAccountant || admin)
      ) {
        seenRef.current.add(key)
        playNotificationBeep()
        toast.info(`New purchase order — ${po.poNumber}`, {
          description: `${po.createdByName} sent a PO for accountant review.`,
          action: {
            label: 'Review',
            onClick: () => router.push('/expenses?tab=purchase_orders'),
          },
        })
        continue
      }

      if (
        po.status === 'pending_manager' &&
        (canPoManager || admin)
      ) {
        seenRef.current.add(key)
        playNotificationBeep()
        toast.info(`PO awaiting manager — ${po.poNumber}`, {
          description: 'Accountant approved — manager review needed.',
          action: {
            label: 'Review',
            onClick: () => router.push('/expenses?tab=purchase_orders'),
          },
        })
        continue
      }

      if (
        po.status === 'retirement_pending_accountant' &&
        (canRetirement || admin)
      ) {
        seenRef.current.add(key)
        playNotificationBeep()
        toast.info(`Retirement submitted — ${po.poNumber}`, {
          description: `${po.retirement?.submittedBy ?? 'Purchaser'} submitted market retirement.`,
          action: {
            label: 'Review',
            onClick: () => router.push('/expenses?tab=retirement'),
          },
        })
        continue
      }

      if (
        po.status === 'retirement_rejected' &&
        (roleKey === 'purchaser' || roleKey === 'admin' || roleKey === 'superadmin')
      ) {
        seenRef.current.add(key)
        playNotificationBeep()
        toast.warning(`Retirement rejected — ${po.poNumber}`, {
          description: po.retirementComment || 'Edit and resubmit from Purchasing.',
          action: {
            label: 'Open Purchasing',
            onClick: () => router.push('/supply/purchasing'),
          },
        })
      }
    }

    persistSeen(seenRef.current)
  }, [purchaseOrders, roleKey, router])

  return null
}
