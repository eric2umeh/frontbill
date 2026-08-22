import type { IssueOutRecord, PurchaseOrder, RetirementLine } from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { getPoApprovedAmount, getPoRetirementDelta } from '@/lib/supply-chain/po-format'
import { pendingReviewLines } from '@/lib/supply-chain/add-to-stock'

function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function isZeroPoUnitPrice(price: number | null | undefined): boolean {
  return !(Number(price) > 0)
}

export function zeroPriceRowClass(): string {
  return 'border-amber-300 bg-amber-50/90 dark:bg-amber-950/35 dark:border-amber-700'
}

export function zeroPriceTextClass(): string {
  return 'text-amber-800 dark:text-amber-200'
}

export function issuedQtyForStoreItem(
  issueOutLog: IssueOutRecord[],
  storeItemId: string,
  sinceIso?: string,
): number {
  if (!storeItemId) return 0
  const since = sinceIso ? Date.parse(sinceIso) : 0
  return issueOutLog.reduce((sum, row) => {
    if (row.storeItemId !== storeItemId) return sum
    if (since && Date.parse(row.issuedAt) < since) return sum
    return sum + (Number(row.quantity) || 0)
  }, 0)
}

export type RetirementBatchStats = {
  lineCount: number
  boughtCount: number
  notBoughtCount: number
  newlyAddedCount: number
  qtyChangedCount: number
  priceChangedCount: number
  batchSpend: number
  approvedPoAmount: number
  refundOrCredit: number
}

export function computeRetirementBatchStats(
  po: PurchaseOrder,
  lines: RetirementLine[],
): RetirementBatchStats {
  const approvedPoAmount = getPoApprovedAmount(po)
  const batchSpend = lines
    .filter((l) => !(l.notBought || l.removed))
    .reduce((s, l) => s + (Number(l.totalPaid) || 0), 0)
  let boughtCount = 0
  let notBoughtCount = 0
  let newlyAddedCount = 0
  let qtyChangedCount = 0
  let priceChangedCount = 0

  for (const line of lines) {
    if (line.notBought || line.removed) {
      notBoughtCount += 1
      continue
    }
    boughtCount += 1
    if (line.newlyAdded) newlyAddedCount += 1
    const orig = po.lines.find((l) => l.id === line.lineId)
    if (orig && Number(line.quantityBought) !== Number(orig.quantityOrdered)) {
      qtyChangedCount += 1
    }
    if (orig && Number(line.actualPrice) !== Number(orig.unitPrice)) {
      priceChangedCount += 1
    }
  }

  const probe: PurchaseOrder = {
    ...po,
    retirement: po.retirement
      ? {
          ...po.retirement,
          lines: [...(po.retirement.lines ?? []), ...lines].filter(
            (l, i, arr) =>
              arr.findIndex((x) => x.lineId === l.lineId && x.stockedAt === l.stockedAt) === i,
          ),
          actualSpent: batchSpend,
        }
      : po.retirement,
  }
  const refundOrCredit = -getPoRetirementDelta(probe)

  return {
    lineCount: lines.length,
    boughtCount,
    notBoughtCount,
    newlyAddedCount,
    qtyChangedCount,
    priceChangedCount,
    batchSpend,
    approvedPoAmount,
    refundOrCredit,
  }
}

export function listRetirementReviewHistory(pos: PurchaseOrder[]): PurchaseOrder[] {
  return pos
    .filter((po) => {
      if (po.deletedAt) return false
      if (po.status === 'retired') return true
      const batches = po.retirement?.batches ?? []
      return batches.some(
        (b) => b.status === 'accepted' || b.status === 'rejected',
      )
    })
    .sort(
      (a, b) =>
        Date.parse(b.workflowUpdatedAt || b.createdAt) -
        Date.parse(a.workflowUpdatedAt || a.createdAt),
    )
}

export function downloadRetirementReviewReport(
  po: PurchaseOrder,
  lines: RetirementLine[],
  opts: { batchLabel?: string },
) {
  const stats = computeRetirementBatchStats(po, lines)
  const header = [
    'Item',
    'Dept',
    'Ordered qty',
    'Bought qty',
    'PO price',
    'Actual price',
    'Total paid',
    'Status',
    'Notes',
  ]
  const body = lines.map((line) => {
    const orig = po.lines.find((l) => l.id === line.lineId)
    const notBought = line.notBought || line.removed
    const notes: string[] = []
    if (line.newlyAdded) notes.push('newly added')
    if (orig && Number(line.quantityBought) !== Number(orig.quantityOrdered)) {
      notes.push(`qty ${orig.quantityOrdered}→${line.quantityBought}`)
    }
    if (orig && Number(line.actualPrice) !== Number(orig.unitPrice)) {
      notes.push(`price ${orig.unitPrice}→${line.actualPrice}`)
    }
    if (line.corrections?.length) {
      notes.push(`${line.corrections.length} correction(s)`)
    }
    return [
      line.name,
      line.dept ?? orig?.dept ?? '',
      orig?.quantityOrdered ?? line.quantityOrdered,
      line.quantityBought,
      orig?.unitPrice ?? line.poPrice,
      line.actualPrice,
      notBought ? 0 : line.totalPaid,
      notBought ? 'not bought' : 'bought',
      notes.join('; '),
    ]
  })

  const summary: unknown[][] = [
    [],
    ['Summary', '', '', '', '', '', '', '', ''],
    ['PO', po.poNumber, '', '', '', '', '', '', ''],
    ['Batch spend', '', '', '', '', '', stats.batchSpend, '', ''],
    ['Approved PO', '', '', '', '', '', stats.approvedPoAmount, '', ''],
    ['Refund/credit to purchaser', '', '', '', '', '', stats.refundOrCredit, '', ''],
    ['Lines reviewed', '', stats.lineCount, '', '', '', '', '', ''],
    ['Bought / not bought', '', `${stats.boughtCount} / ${stats.notBoughtCount}`, '', '', '', '', '', ''],
    ['Qty variants', '', stats.qtyChangedCount, '', '', '', '', '', ''],
    ['Price variants', '', stats.priceChangedCount, '', '', '', '', '', ''],
  ]

  const slug = po.poNumber.replace(/[^\w-]+/g, '-').toLowerCase()
  downloadCsv(
    `frontbill-retirement-${slug}${opts.batchLabel ? `-${opts.batchLabel}` : ''}.csv`,
    [header, ...body, ...summary],
  )
}

export function pendingLinesForPo(po: PurchaseOrder): RetirementLine[] {
  return pendingReviewLines(po)
}
