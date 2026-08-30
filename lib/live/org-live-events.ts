/** Cross-user live refresh signals (Supabase Realtime + fallback poll). */

export const ORG_LIVE_SUPPLY = 'frontbill:org-live-supply'
export const ORG_LIVE_OUTLET_MENU = 'frontbill:org-live-outlet-menu'
export const ORG_LIVE_BOOKINGS = 'frontbill:org-live-bookings'
export const ORG_LIVE_CATALOG = 'frontbill:org-live-catalog'

export function dispatchOrgLiveEvent(name: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(name))
}
