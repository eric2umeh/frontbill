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

/** Title-case each word while typing — "jollof rice" → "Jollof Rice". */
export function titleCaseWhileTyping(value: string): string {
  return value
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part) || !part) return part
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
    })
    .join('')
}
