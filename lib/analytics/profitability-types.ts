export type ProfitabilityAssumptions = {
  /** Total sellable rooms (for spreading fixed utilities). */
  total_rooms: number
  /** Example / target ADR for the unit-economics calculator (₦). */
  sample_room_rate: number
  breakfast_cost_per_guest: number
  /** Manual override when weekly diesel expense is not in the ledger yet. */
  diesel_weekly_amount: number
  /** Manual override when AEDC is not recorded in expenses. */
  electricity_monthly_amount: number
  laundry_cost_per_room_night: number
  cleaning_supplies_per_room_night: number
  staff_salary_monthly: number
  /** Share of monthly payroll attributed to room operations (0–100). */
  staff_allocation_to_rooms_pct: number
  marketing_monthly: number
  other_variable_per_room_night: number
  /** If true, model uses sample_room_rate; else uses achieved ADR from bookings. */
  use_sample_rate_for_unit_model: boolean
}

export const DEFAULT_PROFITABILITY_ASSUMPTIONS: ProfitabilityAssumptions = {
  total_rooms: 40,
  sample_room_rate: 100_000,
  breakfast_cost_per_guest: 7_000,
  diesel_weekly_amount: 0,
  electricity_monthly_amount: 0,
  laundry_cost_per_room_night: 3_500,
  cleaning_supplies_per_room_night: 2_000,
  staff_salary_monthly: 0,
  staff_allocation_to_rooms_pct: 65,
  marketing_monthly: 0,
  other_variable_per_room_night: 0,
  use_sample_rate_for_unit_model: false,
}

export type ProfitabilityCostLine = {
  key: string
  label: string
  amount: number
  per_room_night: number
  source: 'actual' | 'assumption' | 'blended'
  note?: string
}

export type ProfitabilityAnalysisResult = {
  period: { start: string; end: string; days: number }
  occupancy: {
    total_rooms: number
    occupied_room_nights: number
    available_room_nights: number
    occupancy_pct: number
    achieved_adr: number
  }
  revenue: {
    accommodation: number
    outlets: number
    payments_collected: number
    total: number
  }
  expenses: {
    operating_total: number
    by_category: { code: string; name: string; amount: number }[]
  }
  unit_economics: {
    revenue_per_room_night: number
    cost_per_room_night: number
    profit_per_room_night: number
    margin_pct: number
    cost_lines: ProfitabilityCostLine[]
  }
  summary: {
    gross_operating_profit: number
    net_margin_pct: number
    break_even_adr: number
    status: 'profitable' | 'break_even' | 'loss'
  }
  recommendations: string[]
  methodology: string[]
}
