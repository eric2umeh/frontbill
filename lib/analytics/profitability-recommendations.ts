import { formatNaira } from '@/lib/utils/currency'
import type {
  ProfitabilityAssumptions,
  ProfitabilityCostLine,
} from '@/lib/analytics/profitability-types'

export function generateProfitabilityRecommendations(ctx: {
  assumptions: ProfitabilityAssumptions
  occupancyPct: number
  achievedAdr: number
  breakEvenAdr: number
  profitPerRoomNight: number
  marginPct: number
  grossOperatingProfit: number
  netMarginPct: number
  outletRevenue: number
  accommodationRevenue: number
  operatingTotal: number
  costLines: ProfitabilityCostLine[]
  summaryStatus: 'profitable' | 'break_even' | 'loss'
}): string[] {
  const items: string[] = []

  if (ctx.summaryStatus === 'loss') {
    items.push(
      `Operating loss of ${formatNaira(Math.abs(ctx.grossOperatingProfit))} in this period — avoid broad rate cuts until largest cost drivers are reviewed.`,
    )
  } else if (ctx.summaryStatus === 'profitable') {
    items.push(
      `GOP margin ${ctx.netMarginPct}% — hotel is profitable on paper; validate cash collected (${formatNaira(ctx.grossOperatingProfit)} GOP) against bank deposits.`,
    )
  } else {
    items.push('Near break-even — small changes in occupancy or ADR will swing results materially.')
  }

  if (ctx.achievedAdr > 0 && ctx.breakEvenAdr > 0) {
    const gap = ctx.achievedAdr - ctx.breakEvenAdr
    if (gap < 0) {
      items.push(
        `Achieved ADR ${formatNaira(ctx.achievedAdr)} is below break-even ${formatNaira(ctx.breakEvenAdr)} — raise rates, reduce complimentary nights, or cut variable costs per room night.`,
      )
    } else if (gap < ctx.breakEvenAdr * 0.15) {
      items.push(
        `ADR cushion is thin (${formatNaira(gap)} above break-even) — monitor diesel and power costs; consider modest rate increases on high-demand dates.`,
      )
    } else if (ctx.occupancyPct >= 75 && gap > ctx.breakEvenAdr * 0.2) {
      items.push(
        `Strong occupancy (${ctx.occupancyPct}%) with healthy ADR gap — test +5–10% on premium room types and packages rather than discounting.`,
      )
    }
  }

  if (ctx.occupancyPct < 45) {
    items.push(
      `Low occupancy (${ctx.occupancyPct}%) — prioritize marketing, corporate contracts, and OTA conversion before raising rack rates.`,
    )
  } else if (ctx.occupancyPct >= 80 && ctx.marginPct < 15) {
    items.push(
      'High occupancy but weak unit margin — costs are eating revenue; audit breakfast inclusion, laundry outsourcing, and staffing rosters.',
    )
  }

  const diesel = ctx.costLines.find((l) => l.key === 'diesel')
  const elec = ctx.costLines.find((l) => l.key === 'electricity')
  if (diesel && diesel.per_room_night > ctx.profitPerRoomNight * 0.25 && ctx.profitPerRoomNight > 0) {
    items.push(
      'Diesel/generator is a large share of cost per room night — log weekly fuel in Expenses, consider solar/Hybrid or generator scheduling by occupancy.',
    )
  }
  if (elec && elec.per_room_night > ctx.achievedAdr * 0.12 && ctx.achievedAdr > 0) {
    items.push(
      'Electricity cost is elevated relative to ADR — review AEDC billing, AC policy, and vacant-room energy use.',
    )
  }

  if (ctx.outletRevenue > 0 && ctx.accommodationRevenue > 0) {
    const fbShare = ctx.outletRevenue / (ctx.accommodationRevenue + ctx.outletRevenue)
    if (fbShare < 0.12) {
      items.push(
        `F&B/outlet revenue is ${Math.round(fbShare * 100)}% of total — grow restaurant, bar, and laundry sales to improve GOP without relying only on room rate increases.`,
      )
    } else if (fbShare >= 0.25) {
      items.push(
        'Outlets contribute a solid revenue mix — protect margin on kitchen/bar purchases (track in Expenses categories).',
      )
    }
  }

  const breakfast = ctx.costLines.find((l) => l.key === 'breakfast')
  if (
    breakfast &&
    ctx.assumptions.breakfast_cost_per_guest >= 5000 &&
    ctx.marginPct < 20
  ) {
    items.push(
      `Breakfast allowance ${formatNaira(ctx.assumptions.breakfast_cost_per_guest)}/guest — offer breakfast as optional paid add-on or tighten menu cost if rate includes breakfast.`,
    )
  }

  if (ctx.operatingTotal > 0 && ctx.accommodationRevenue > 0) {
    const expenseRatio = ctx.operatingTotal / ctx.accommodationRevenue
    if (expenseRatio > 0.85) {
      items.push(
        'Operating expenses exceed ~85% of room revenue — align monthly budgets in Expenses and challenge top 3 categories.',
      )
    }
  }

  if (items.length < 4) {
    items.push(
      'Record diesel, AEDC, and salary consistently in Operating Expenses so the model uses actuals instead of assumptions.',
    )
    items.push(
      'Re-run this analysis monthly; compare break-even ADR to inflation and competitor pricing in your city.',
    )
  }

  return items.slice(0, 8)
}
