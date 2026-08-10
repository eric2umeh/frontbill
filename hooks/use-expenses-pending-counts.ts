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

export type ExpensesPendingCounts = {
  total: number
  purchaseOrders: number
  retirements: number
}

export function useExpensesPendingCounts(role: string | null | undefined): ExpensesPendingCounts {
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
        (p) => p.status === 'retirement_pending_accountant',
      ).length
    }

    return {
      total: purchaseOrdersCount + retirements,
      purchaseOrders: purchaseOrdersCount,
      retirements,
    }
  }, [purchaseOrders, role])
}

export function expensesHrefForPendingCounts(counts: ExpensesPendingCounts): string {
  if (counts.retirements > 0) return '/expenses?tab=retirement'
  if (counts.purchaseOrders > 0) return '/expenses?tab=purchase_orders'
  return '/expenses'
}
