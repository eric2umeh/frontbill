export function getUserDisplayName(profile: any, fallbackId?: string | null) {
  const name = String(profile?.full_name || '').trim()
  if (name) return name

  if (fallbackId) {
    return `User ${String(fallbackId).slice(0, 8)}`
  }

  return 'System'
}
