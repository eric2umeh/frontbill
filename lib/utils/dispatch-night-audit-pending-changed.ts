/** Refresh Night Audit pending badges (sidebar, tabs, header). */
export function dispatchNightAuditPendingChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('frontbill-night-audit-pending-changed'))
  window.dispatchEvent(new Event('frontbill-backdate-pending-changed'))
}
