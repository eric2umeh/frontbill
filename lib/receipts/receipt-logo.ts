import { escapeHtml } from "@/lib/utils/html-escape";

export type OrgReceiptBranding = {
  hotelName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
};

/** Hotel name (left) and logo (right) on one line — used on all print receipts. */
export function receiptHotelHeaderRow(
  logoUrl?: string | null,
  hotelName?: string | null,
  opts?: {
    maxHeightPx?: number;
    maxWidthPx?: number;
    hotelFontSizePx?: number;
  },
): string {
  const name = escapeHtml(String(hotelName || "").trim() || "Hotel");
  const url = String(logoUrl || "").trim();
  const fontSize = opts?.hotelFontSizePx ?? 18;
  const h = opts?.maxHeightPx ?? 36;
  const w = opts?.maxWidthPx ?? 100;
  const alt = name;

  const logoImg = url
    ? `<img src="${escapeHtml(url)}" alt="${alt}" style="max-height:${h}px;max-width:${w}px;object-fit:contain;display:block;" />`
    : "";

  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:6px;">
    <div style="font-size:${fontSize}px;font-weight:700;letter-spacing:0.02em;flex:1;min-width:0;line-height:1.2;">${name}</div>
    ${logoImg ? `<div style="flex-shrink:0;text-align:right;">${logoImg}</div>` : ""}
  </div>`;
}

/** @deprecated Use receiptHotelHeaderRow — kept for callers that only need the image block. */
export function receiptLogoBlock(
  logoUrl?: string | null,
  hotelName?: string | null,
  opts?: { maxHeightPx?: number; maxWidthPx?: number },
): string {
  return receiptHotelHeaderRow(logoUrl, hotelName, opts);
}
