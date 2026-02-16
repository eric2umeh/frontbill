export function formatNaira(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatNairaCompact(amount: number): string {
  if (amount >= 1000000) {
    return `₦${(amount / 1000000).toFixed(1)}M`
  }
  if (amount >= 1000) {
    return `₦${(amount / 1000).toFixed(1)}K`
  }
  return formatNaira(amount)
}

export function parseNaira(value: string): number {
  const cleaned = value.replace(/[₦,\s]/g, '')
  return parseFloat(cleaned) || 0
}
