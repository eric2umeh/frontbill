export type SupplyNotificationAudience =
  | 'store'
  | 'accountant'
  | 'manager'
  | 'purchasing'
  | 'kitchen'
  | 'cashier'

export type SupplyNotification = {
  id: string
  audience: SupplyNotificationAudience[]
  title: string
  body: string
  href?: string
  createdAt: string
  read: boolean
}

const STORAGE_KEY = 'frontbill_supply_notifications'

export function loadSupplyNotifications(): SupplyNotification[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function persistSupplyNotifications(items: SupplyNotification[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 50)))
  } catch {
    /* ignore */
  }
}

/** Defer so Header (and other listeners) never setState during a render/updater. */
function emitSupplyNotificationsChanged() {
  if (typeof window === 'undefined') return
  queueMicrotask(() => {
    window.dispatchEvent(new CustomEvent('frontbill:supply-notifications'))
  })
}

export function pushSupplyNotification(
  input: Omit<SupplyNotification, 'id' | 'createdAt' | 'read'>,
): SupplyNotification {
  const note: SupplyNotification = {
    ...input,
    id: `sn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    read: false,
  }
  const prev = loadSupplyNotifications()
  const next = [note, ...prev]
  persistSupplyNotifications(next)
  emitSupplyNotificationsChanged()
  return note
}

export function supplyNotificationsForRole(
  roleKey: string,
): SupplyNotification[] {
  const audiences = audiencesForRole(roleKey)
  if (!audiences.length) return []
  return loadSupplyNotifications().filter((n) =>
    n.audience.some((a) => audiences.includes(a)),
  )
}

export function markSupplyNotificationRead(id: string) {
  const next = loadSupplyNotifications().map((n) =>
    n.id === id ? { ...n, read: true } : n,
  )
  persistSupplyNotifications(next)
  emitSupplyNotificationsChanged()
}

export function markAllSupplyNotificationsRead() {
  const next = loadSupplyNotifications().map((n) => ({ ...n, read: true }))
  persistSupplyNotifications(next)
  emitSupplyNotificationsChanged()
}

export function audiencesForRole(roleKey: string): SupplyNotificationAudience[] {
  switch (roleKey) {
    case 'store':
      return ['store']
    case 'accountant':
      return ['accountant']
    case 'manager':
    case 'admin':
    case 'superadmin':
      return ['manager', 'accountant', 'store', 'purchasing']
    case 'auditor':
      return ['accountant', 'manager', 'store', 'purchasing']
    case 'purchaser':
      return ['purchasing']
    case 'chef':
      return ['kitchen']
    case 'cashier':
      return ['cashier']
    default:
      return []
  }
}
