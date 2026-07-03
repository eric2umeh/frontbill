import type { ReactNode } from 'react'

/** Compact check-in → check-out for mobile table rows. */
export function formatShortStayDates(checkIn: string, checkOut: string): string {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
  return `${fmt(checkIn)} – ${fmt(checkOut)}`
}

/** Extra context shown under the primary cell on phones only (hidden md+). */
export function MobileTableSubdetail({ children }: { children: ReactNode }) {
  return (
    <div className="mt-1 space-y-0.5 text-[11px] leading-snug text-muted-foreground md:hidden">
      {children}
    </div>
  )
}
