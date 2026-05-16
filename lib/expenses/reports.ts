import { eachDayOfInterval, format, parseISO } from 'date-fns'

export type ExpenseCategoryRow = {
  id: string
  code: string
  name: string
  sort_order: number
}

export type ExpenseEntryRow = {
  expense_date: string
  category_id: string
  amount: number
  description?: string | null
}

export type ExpenseDayNoteRow = {
  expense_date: string
  description: string | null
}

export function buildDailyExpenditurePayload(
  categories: ExpenseCategoryRow[],
  entries: ExpenseEntryRow[],
  dayNotes: ExpenseDayNoteRow[],
  startD: Date,
  endD: Date,
) {
  const noteMap = new Map(dayNotes.map((n) => [n.expense_date, n.description || '']))
  const days = eachDayOfInterval({ start: startD, end: endD })

  const categoryTotals: Record<string, number> = {}
  for (const c of categories) categoryTotals[c.id] = 0

  const byDay = days.map((day) => {
    const d = format(day, 'yyyy-MM-dd')
    const amounts: Record<string, number> = {}
    let dayTotal = 0
    for (const c of categories) {
      amounts[c.id] = 0
    }
    for (const e of entries) {
      if (e.expense_date !== d) continue
      const amt = Number(e.amount) || 0
      amounts[e.category_id] = (amounts[e.category_id] || 0) + amt
      categoryTotals[e.category_id] = (categoryTotals[e.category_id] || 0) + amt
      dayTotal += amt
    }
    return {
      date: d,
      description: noteMap.get(d) || '',
      amounts,
      dayTotal,
    }
  })

  const grandTotal = Object.values(categoryTotals).reduce((s, v) => s + v, 0)

  return {
    report: 'daily_expenditure' as const,
    categories: categories.map((c) => ({ id: c.id, code: c.code, name: c.name })),
    byDay,
    categoryTotals,
    grandTotal,
  }
}

export function buildProfitAndLossPayload(
  revenueSubtotal: number,
  revenueVat: number,
  revenueWithVat: number,
  salesCollectionNet: number,
  expenseGrandTotal: number,
  categoryBreakdown: { id: string; name: string; amount: number; budget?: number | null }[],
  budgetAlerts: { category_id: string; name: string; spent: number; budget: number; percent: number }[],
) {
  const netOperating = revenueSubtotal - expenseGrandTotal
  const marginPercent =
    revenueSubtotal > 0 ? Number(((netOperating / revenueSubtotal) * 100).toFixed(2)) : 0
  const cashSurplus = salesCollectionNet - expenseGrandTotal

  return {
    report: 'profit_and_loss' as const,
    revenue: {
      earnedSubtotal: revenueSubtotal,
      vat: revenueVat,
      earnedWithVat: revenueWithVat,
    },
    expenses: {
      operatingTotal: expenseGrandTotal,
      byCategory: categoryBreakdown,
    },
    netOperating,
    marginPercent,
    salesCollectionNet,
    cashSurplus,
    budgetAlerts,
  }
}
