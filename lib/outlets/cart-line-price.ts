/** Round money to 2 decimal places for outlet cart / order lines. */
export function roundOutletMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function menuDefaultUnitPrice(unitPrice: unknown): number {
  return roundOutletMoney(Math.max(0, Number(unitPrice) || 0))
}

export function parseOutletUnitPriceInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = parseFloat(trimmed.replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return roundOutletMoney(n)
}

export function cartLineUsesCustomPrice(unitPrice: number, menuUnitPrice: number): boolean {
  return roundOutletMoney(unitPrice) !== roundOutletMoney(menuUnitPrice)
}
