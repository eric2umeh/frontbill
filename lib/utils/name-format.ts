export function normalizeName(value: string) {
  return String(value || '').trim().replace(/\s+/g, ' ')
}

export function normalizeNameKey(value: string) {
  return normalizeName(value).toLowerCase()
}

export function formatPersonName(value: string) {
  return normalizeName(value)
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
