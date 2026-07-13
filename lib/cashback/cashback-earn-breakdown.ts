export type CashbackEarnByRateRow = {
  id: string
  ratePercent: number | null
  label: string
  earned: number
}

type TxnRow = {
  txn_type?: string | null
  amount?: unknown
  description?: string | null
  earn_rate_percent?: unknown
}

function parseRateFromDescription(description: string | null | undefined): number | null {
  const m = String(description || '').match(/Cashback\s+(\d+(?:\.\d+)?)\s*%/i)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/** Group earn transactions by the cashback % that was active when they were posted. */
export function groupEarnTransactionsByRate(
  transactions: TxnRow[],
): CashbackEarnByRateRow[] {
  const buckets = new Map<string, CashbackEarnByRateRow>()

  for (const t of transactions) {
    if (String(t.txn_type || '').toLowerCase() !== 'earn') continue
    const amt = Number(t.amount) || 0
    if (amt <= 0) continue

    const stored = t.earn_rate_percent != null ? Number(t.earn_rate_percent) : NaN
    const rate = Number.isFinite(stored) ? stored : parseRateFromDescription(t.description)
    const key =
      rate != null ? `rate:${rate}` : `unknown:${String(t.description || '').slice(0, 40)}`
    const label =
      rate != null ? `Earned at ${rate}%` : 'Earned (rate not recorded)'

    const prev = buckets.get(key)
    if (prev) {
      prev.earned += amt
    } else {
      buckets.set(key, { id: key, ratePercent: rate, label, earned: amt })
    }
  }

  return [...buckets.values()].sort((a, b) => {
    if (a.ratePercent == null && b.ratePercent == null) return 0
    if (a.ratePercent == null) return 1
    if (b.ratePercent == null) return -1
    return b.ratePercent - a.ratePercent
  })
}
