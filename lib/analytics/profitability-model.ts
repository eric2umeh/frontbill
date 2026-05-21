import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import {
  DEFAULT_PROFITABILITY_ASSUMPTIONS,
  type ProfitabilityAnalysisResult,
  type ProfitabilityAssumptions,
  type ProfitabilityCostLine,
} from '@/lib/analytics/profitability-types'
import { generateProfitabilityRecommendations } from '@/lib/analytics/profitability-recommendations'

const ACTIVE_STAY_STATUSES = new Set(['checked_in', 'confirmed', 'reserved', 'checked_out'])

/** Occupied nights in period: each night is a calendar day with check_in <= day < check_out. */
export function countOccupiedRoomNights(
  bookings: { check_in: string; check_out: string; status?: string | null }[],
  periodStart: string,
  periodEnd: string,
): number {
  let total = 0
  for (const b of bookings) {
    const st = String(b.status || '').toLowerCase()
    if (st && !ACTIVE_STAY_STATUSES.has(st)) continue
    const cin = String(b.check_in).slice(0, 10)
    const cout = String(b.check_out).slice(0, 10)
    if (cout <= periodStart || cin > periodEnd) continue
    const start = cin < periodStart ? periodStart : cin
    const endExclusive =
      cout > periodEnd
        ? format(addDays(parseISO(periodEnd), 1), 'yyyy-MM-dd')
        : cout
    const nights = differenceInCalendarDays(parseISO(endExclusive), parseISO(start))
    total += Math.max(0, nights)
  }
  return total
}

function occupiedNightsForBooking(
  checkIn: string,
  checkOut: string,
  periodStart: string,
  periodEnd: string,
): number {
  const cin = String(checkIn).slice(0, 10)
  const cout = String(checkOut).slice(0, 10)
  if (cout <= periodStart || cin > periodEnd) return 0
  const start = cin < periodStart ? periodStart : cin
  const endExclusive =
    cout > periodEnd
      ? format(addDays(parseISO(periodEnd), 1), 'yyyy-MM-dd')
      : cout
  return Math.max(0, differenceInCalendarDays(parseISO(endExclusive), parseISO(start)))
}

export function mergeAssumptions(
  raw: Record<string, unknown> | null | undefined,
): ProfitabilityAssumptions {
  const d = DEFAULT_PROFITABILITY_ASSUMPTIONS
  const r = raw || {}
  return {
    total_rooms: Math.max(1, Number(r.total_rooms ?? d.total_rooms) || d.total_rooms),
    sample_room_rate: Math.max(0, Number(r.sample_room_rate ?? d.sample_room_rate) || 0),
    breakfast_cost_per_guest: Math.max(
      0,
      Number(r.breakfast_cost_per_guest ?? d.breakfast_cost_per_guest) || 0,
    ),
    diesel_weekly_amount: Math.max(0, Number(r.diesel_weekly_amount ?? d.diesel_weekly_amount) || 0),
    electricity_monthly_amount: Math.max(
      0,
      Number(r.electricity_monthly_amount ?? d.electricity_monthly_amount) || 0,
    ),
    laundry_cost_per_room_night: Math.max(
      0,
      Number(r.laundry_cost_per_room_night ?? d.laundry_cost_per_room_night) || 0,
    ),
    cleaning_supplies_per_room_night: Math.max(
      0,
      Number(r.cleaning_supplies_per_room_night ?? d.cleaning_supplies_per_room_night) || 0,
    ),
    staff_salary_monthly: Math.max(0, Number(r.staff_salary_monthly ?? d.staff_salary_monthly) || 0),
    staff_allocation_to_rooms_pct: Math.min(
      100,
      Math.max(0, Number(r.staff_allocation_to_rooms_pct ?? d.staff_allocation_to_rooms_pct) || 0),
    ),
    marketing_monthly: Math.max(0, Number(r.marketing_monthly ?? d.marketing_monthly) || 0),
    other_variable_per_room_night: Math.max(
      0,
      Number(r.other_variable_per_room_night ?? d.other_variable_per_room_night) || 0,
    ),
    use_sample_rate_for_unit_model: Boolean(
      r.use_sample_rate_for_unit_model ?? d.use_sample_rate_for_unit_model,
    ),
  }
}

type ExpenseCat = { code: string; name: string; amount: number }

const EXPENSE_CODE_GROUPS: Record<string, string[]> = {
  diesel: ['diesel', 'fuel'],
  electricity: ['aedc', 'electricals', 'gas'],
  staff: ['salary', 'housekeepers', 'staff_welfare', 'staff_food'],
  laundry: ['laundry_maint'],
  cleaning: ['housekeepers', 'complimentary', 'plates'],
  marketing: ['marketing', 'sales_commission'],
}

function sumExpenseCodes(categories: ExpenseCat[], codes: string[]): number {
  return categories.reduce((s, c) => (codes.includes(c.code) ? s + c.amount : s), 0)
}

export function buildProfitabilityAnalysis(input: {
  periodStart: string
  periodEnd: string
  assumptions: ProfitabilityAssumptions
  bookings: {
    check_in: string
    check_out: string
    status?: string | null
    rate_per_night?: number | null
  }[]
  expenseCategories: { code: string; name: string; amount: number }[]
  paymentsTotal: number
  outletRevenue: number
  totalRoomsFromInventory?: number
}): ProfitabilityAnalysisResult {
  const { periodStart, periodEnd, assumptions } = input
  const periodDays = Math.max(
    1,
    differenceInCalendarDays(parseISO(periodEnd), parseISO(periodStart)) + 1,
  )
  const totalRooms = Math.max(
    1,
    input.totalRoomsFromInventory && input.totalRoomsFromInventory > 0
      ? input.totalRoomsFromInventory
      : assumptions.total_rooms,
  )
  const occupiedNights = countOccupiedRoomNights(input.bookings, periodStart, periodEnd)
  const availableNights = totalRooms * periodDays
  const occupancyPct =
    availableNights > 0 ? Math.round((occupiedNights / availableNights) * 1000) / 10 : 0

  let accommodationRevenue = 0
  for (const b of input.bookings) {
    const st = String(b.status || '').toLowerCase()
    if (st && !ACTIVE_STAY_STATUSES.has(st)) continue
    const nights = occupiedNightsForBooking(b.check_in, b.check_out, periodStart, periodEnd)
    accommodationRevenue += nights * (Number(b.rate_per_night) || 0)
  }

  const achievedAdr =
    occupiedNights > 0 ? Math.round(accommodationRevenue / occupiedNights) : 0
  const outletRevenue = Math.max(0, Number(input.outletRevenue) || 0)
  const paymentsCollected = Math.max(0, Number(input.paymentsTotal) || 0)
  const totalRevenue = accommodationRevenue + outletRevenue

  const expenseCats = input.expenseCategories
  const operatingTotal = expenseCats.reduce((s, c) => s + c.amount, 0)

  const dieselActual = sumExpenseCodes(expenseCats, EXPENSE_CODE_GROUPS.diesel)
  const elecActual = sumExpenseCodes(expenseCats, EXPENSE_CODE_GROUPS.electricity)
  const staffActual = sumExpenseCodes(expenseCats, EXPENSE_CODE_GROUPS.staff)
  const laundryActual = sumExpenseCodes(expenseCats, EXPENSE_CODE_GROUPS.laundry)
  const marketingActual = sumExpenseCodes(expenseCats, EXPENSE_CODE_GROUPS.marketing)

  const dieselWeekly =
    dieselActual > 0
      ? (dieselActual / periodDays) * 7
      : assumptions.diesel_weekly_amount
  const elecMonthly =
    elecActual > 0
      ? (elecActual / periodDays) * 30
      : assumptions.electricity_monthly_amount
  const staffMonthly =
    staffActual > 0 ? (staffActual / periodDays) * 30 : assumptions.staff_salary_monthly
  const marketingMonthly =
    marketingActual > 0
      ? (marketingActual / periodDays) * 30
      : assumptions.marketing_monthly

  const orns = Math.max(occupiedNights, 1)
  const rooms = Math.max(totalRooms, 1)

  const costLines: ProfitabilityCostLine[] = []

  const dieselDaily = dieselWeekly / 7
  const dieselPerOrn = dieselDaily / rooms
  costLines.push({
    key: 'diesel',
    label: 'Diesel / generator',
    amount: dieselDaily * periodDays,
    per_room_night: dieselPerOrn,
    source: dieselActual > 0 ? 'actual' : assumptions.diesel_weekly_amount > 0 ? 'assumption' : 'blended',
    note: 'Weekly spend ÷ 7, spread across all rooms (fixed plant).',
  })

  const elecDaily = elecMonthly / 30
  const elecPerOrn = elecDaily / rooms
  costLines.push({
    key: 'electricity',
    label: 'Electricity (AEDC / power)',
    amount: elecDaily * periodDays,
    per_room_night: elecPerOrn,
    source: elecActual > 0 ? 'actual' : assumptions.electricity_monthly_amount > 0 ? 'assumption' : 'blended',
    note: 'Monthly bill ÷ 30, spread across all rooms.',
  })

  const breakfastPerOrn = assumptions.breakfast_cost_per_guest
  costLines.push({
    key: 'breakfast',
    label: 'Breakfast (incl. in rate)',
    amount: breakfastPerOrn * occupiedNights,
    per_room_night: breakfastPerOrn,
    source: 'assumption',
    note: 'Direct variable cost per occupied night.',
  })

  const staffRoomMonthly = staffMonthly * (assumptions.staff_allocation_to_rooms_pct / 100)
  const staffDailyForPeriod = (staffRoomMonthly / 30) * periodDays
  costLines.push({
    key: 'staff',
    label: 'Staff payroll (rooms share)',
    amount: staffDailyForPeriod,
    per_room_night: staffRoomMonthly / 30 / orns,
    source: staffActual > 0 ? 'actual' : assumptions.staff_salary_monthly > 0 ? 'assumption' : 'blended',
    note: `${assumptions.staff_allocation_to_rooms_pct}% of payroll allocated to room operations.`,
  })

  const laundryPerOrn =
    laundryActual > 0
      ? laundryActual / orns
      : assumptions.laundry_cost_per_room_night
  costLines.push({
    key: 'laundry',
    label: 'Laundry (linen)',
    amount: laundryPerOrn * occupiedNights,
    per_room_night: laundryPerOrn,
    source: laundryActual > 0 ? 'actual' : 'assumption',
  })

  const cleaningPerOrn = assumptions.cleaning_supplies_per_room_night
  costLines.push({
    key: 'cleaning',
    label: 'Cleaning & amenities',
    amount: cleaningPerOrn * occupiedNights,
    per_room_night: cleaningPerOrn,
    source: 'assumption',
  })

  costLines.push({
    key: 'marketing',
    label: 'Marketing / sales',
    amount: (marketingMonthly / 30) * periodDays,
    per_room_night: marketingMonthly / 30 / orns,
    source: marketingActual > 0 ? 'actual' : assumptions.marketing_monthly > 0 ? 'assumption' : 'blended',
  })

  if (assumptions.other_variable_per_room_night > 0) {
    costLines.push({
      key: 'other',
      label: 'Other variable',
      amount: assumptions.other_variable_per_room_night * occupiedNights,
      per_room_night: assumptions.other_variable_per_room_night,
      source: 'assumption',
    })
  }

  const unallocatedOperating = Math.max(
    0,
    operatingTotal -
      dieselActual -
      elecActual -
      staffActual -
      laundryActual -
      marketingActual,
  )
  if (unallocatedOperating > 0) {
    costLines.push({
      key: 'other_opex',
      label: 'Other operating expenses (ledger)',
      amount: unallocatedOperating,
      per_room_night: unallocatedOperating / orns,
      source: 'actual',
      note: 'Remaining expense categories not mapped above.',
    })
  }

  const unitRevenueRate = assumptions.use_sample_rate_for_unit_model
    ? assumptions.sample_room_rate
    : achievedAdr || assumptions.sample_room_rate

  const costPerRoomNight = costLines.reduce((s, l) => s + l.per_room_night, 0)
  const profitPerRoomNight = unitRevenueRate - costPerRoomNight
  const marginPct =
    unitRevenueRate > 0
      ? Math.round((profitPerRoomNight / unitRevenueRate) * 1000) / 10
      : 0

  const grossOperatingProfit = totalRevenue - operatingTotal
  const netMarginPct =
    totalRevenue > 0
      ? Math.round((grossOperatingProfit / totalRevenue) * 1000) / 10
      : 0

  const breakEvenAdr = Math.ceil(costPerRoomNight)

  const summaryStatus: ProfitabilityAnalysisResult['summary']['status'] =
    grossOperatingProfit > totalRevenue * 0.05
      ? 'profitable'
      : grossOperatingProfit >= 0
        ? 'break_even'
        : 'loss'

  const methodology = [
    'USALI-style GOP: total earned revenue (rooms + outlets) minus operating expenses recorded in Expenses.',
    'Unit economics: variable costs per occupied room night (ORN); fixed utilities spread across total rooms.',
    'Diesel: average weekly payment ÷ 7 ÷ room count. Electricity: monthly AEDC ÷ 30 ÷ room count.',
    'Payroll: monthly salary × rooms allocation % ÷ 30 ÷ occupied nights in period.',
    'Use Operating Expenses daily entries to replace assumptions when amounts exist for the period.',
    'Compare achieved ADR vs break-even ADR before changing rack rates or F&B/laundry prices.',
  ]

  const recommendations = generateProfitabilityRecommendations({
    assumptions,
    occupancyPct,
    achievedAdr,
    breakEvenAdr,
    profitPerRoomNight,
    marginPct,
    grossOperatingProfit,
    netMarginPct,
    outletRevenue,
    accommodationRevenue,
    operatingTotal,
    costLines,
    summaryStatus,
  })

  return {
    period: { start: periodStart, end: periodEnd, days: periodDays },
    occupancy: {
      total_rooms: totalRooms,
      occupied_room_nights: occupiedNights,
      available_room_nights: availableNights,
      occupancy_pct: occupancyPct,
      achieved_adr: achievedAdr,
    },
    revenue: {
      accommodation: accommodationRevenue,
      outlets: outletRevenue,
      payments_collected: paymentsCollected,
      total: totalRevenue,
    },
    expenses: {
      operating_total: operatingTotal,
      by_category: expenseCats.filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount),
    },
    unit_economics: {
      revenue_per_room_night: unitRevenueRate,
      cost_per_room_night: Math.round(costPerRoomNight),
      profit_per_room_night: Math.round(profitPerRoomNight),
      margin_pct: marginPct,
      cost_lines: costLines,
    },
    summary: {
      gross_operating_profit: grossOperatingProfit,
      net_margin_pct: netMarginPct,
      break_even_adr: breakEvenAdr,
      status: summaryStatus,
    },
    recommendations,
    methodology,
  }
}
