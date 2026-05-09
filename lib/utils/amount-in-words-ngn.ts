const BELOW_20 = [
  'ZERO',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
  'TEN',
  'ELEVEN',
  'TWELVE',
  'THIRTEEN',
  'FOURTEEN',
  'FIFTEEN',
  'SIXTEEN',
  'SEVENTEEN',
  'EIGHTEEN',
  'NINETEEN',
]

const TENS = [
  '',
  '',
  'TWENTY',
  'THIRTY',
  'FORTY',
  'FIFTY',
  'SIXTY',
  'SEVENTY',
  'EIGHTY',
  'NINETY',
]

function belowHundred(n: number): string {
  if (n < 20) return BELOW_20[n]
  const t = Math.floor(n / 10)
  const u = n % 10
  const ten = TENS[t]
  if (u === 0) return ten
  return `${ten}-${BELOW_20[u]}`
}

function belowThousand(n: number): string {
  if (n < 100) return belowHundred(n)
  const h = Math.floor(n / 100)
  const rest = n % 100
  const head = `${BELOW_20[h]} HUNDRED`
  if (rest === 0) return head
  return `${head} AND ${belowHundred(rest)}`
}

function positiveIntegerToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return 'ZERO'
  if (n === 0) return 'ZERO'

  const billion = Math.floor(n / 1_000_000_000)
  const million = Math.floor((n % 1_000_000_000) / 1_000_000)
  const thousand = Math.floor((n % 1_000_000) / 1000)
  const remainder = n % 1000

  const parts: string[] = []
  if (billion) parts.push(`${belowThousand(billion)} BILLION`)
  if (million) parts.push(`${belowThousand(million)} MILLION`)
  if (thousand) parts.push(`${belowThousand(thousand)} THOUSAND`)
  if (remainder) parts.push(belowThousand(remainder))

  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Naira amount in words, matching typical hotel receipts (whole naira + optional kobo).
 * Example: 70000 → "SEVENTY THOUSAND ONLY"
 */
export function amountInWordsNgn(amount: number): string {
  const abs = Math.abs(Number(amount) || 0)
  const intPart = Math.floor(abs + 1e-9)
  const kobo = Math.round((abs - intPart) * 100)

  const main = positiveIntegerToWords(intPart)
  if (kobo > 0) {
    const k = belowHundred(kobo)
    return `${main} NAIRA AND ${k} KOBO ONLY`
  }
  return `${main} ONLY`
}
