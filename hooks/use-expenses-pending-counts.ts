'use client'

import { useMemo } from 'react'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import {
  listOrdersAwaitingAccountant,
  listOrdersAwaitingManager,
} from '@/lib/supply-chain/po-active'
import {
  canAdminTestApproveSupplyPo,
  canSupplyPoAccountantReview,
  canSupplyPoManagerReview,
  canSupplyRetirementReview,
} from '@/lib/permissions'
import { isRetirementReviewCandidate } from '@/lib/supply-chain/add-to-stock'

/** Split pending queues: PO Approvals vs Retirement review (separate nav badges). */
export type SupplyPoPendingCounts = {
  total: number
  purchaseOrders: number
  retirements: number
}

export function useSupplyPoPendingCounts(
  role: string | null | undefined,
): SupplyPoPendingCounts {
  const { purchaseOrders } = useSupplyChain()

  return useMemo(() => {
    const admin = canAdminTestApproveSupplyPo(role)
    let purchaseOrdersCount = 0
    let retirements = 0

    if (canSupplyPoAccountantReview(role) || admin) {
      purchaseOrdersCount += listOrdersAwaitingAccountant(purchaseOrders).length
    }
    if (canSupplyPoManagerReview(role) || admin) {
      purchaseOrdersCount += listOrdersAwaitingManager(purchaseOrders).length
    }

    if (canSupplyRetirementReview(role) || admin) {
      retirements = purchaseOrders.filter(
        (p) => !p.deletedAt && isRetirementReviewCandidate(p),
      ).length
    }

    return {
      total: purchaseOrdersCount + retirements,
      purchaseOrders: purchaseOrdersCount,
      retirements,
    }
  }, [purchaseOrders, role])
}

/** Purchase Orders menu only — never send users to Retirement. */
export function supplyPoHrefForPendingCounts(counts: SupplyPoPendingCounts): string {
  if (counts.purchaseOrders > 0) return '/supply/purchase-orders?tab=approvals'
  return '/supply/purchase-orders'
}

/** Retirement menu — review queue for accountant / auditor / admin / manager. */
export function supplyRetirementHrefForPendingCounts(
  counts: SupplyPoPendingCounts,
): string {
  if (counts.retirements > 0) return '/supply/purchasing?tab=retirement'
  return '/supply/purchasing'
}

/** @deprecated Use useSupplyPoPendingCounts — PO queue moved out of Expenses. */
export const useExpensesPendingCounts = useSupplyPoPendingCounts
/** @deprecated Use supplyPoHrefForPendingCounts */
export const expensesHrefForPendingCounts = supplyPoHrefForPendingCounts
export type ExpensesPendingCounts = SupplyPoPendingCounts
