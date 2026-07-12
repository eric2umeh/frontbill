import { escapeHtml } from '@/lib/utils/html-escape'

export type OrgReceiptBranding = {
  hotelName: string
  address?: string | null
  phone?: string | null
  email?: string | null
  logoUrl?: string | null
}

/** Centered hotel logo for print HTML (thermal + A4). */
export function receiptLogoBlock(
  logoUrl?: string | null,
  hotelName?: string | null,
  opts?: { maxHeightPx?: number; maxWidthPx?: number },
): string {
  const url = String(logoUrl || '').trim()
  if (!url) return ''
  const h = opts?.maxHeightPx ?? 56
  const w = opts?.maxWidthPx ?? 180
  const alt = escapeHtml(String(hotelName || 'Hotel').trim() || 'Hotel')
  return `<div style="text-align:center;margin-bottom:8px;"><img src="${escapeHtml(url)}" alt="${alt}" style="max-height:${h}px;max-width:${w}px;object-fit:contain;" /></div>`
}
