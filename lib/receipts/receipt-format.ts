import { escapeHtml } from "@/lib/utils/html-escape";

/** Stable 5–8 digit display number from folio payment / charge id */
export function receiptNumberFromId(id: string): string {
  const hex = id.replace(/-/g, "").slice(0, 16);
  if (hex.length < 8) return "1000";
  try {
    const slice = hex.slice(0, 12);
    let n = 0;
    for (let i = 0; i < slice.length; i += 1) {
      n = (n * 16 + parseInt(slice[i]!, 16)) % 99_000_000;
    }
    return String(Math.max(1000, n + 1_000_000));
  } catch {
    return String(
      Math.abs(
        id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 99_000_000,
      ) + 1000,
    );
  }
}

export function formatReceiptPaymentMethod(
  method: string | null | undefined,
): string {
  const m = String(method || "")
    .trim()
    .toLowerCase();
  const map: Record<string, string> = {
    cash: "Cash",
    pos: "POS",
    card: "Card",
    transfer: "Transfer",
    bank_transfer: "Transfer",
    pending: "Pending (hold)",
    city_ledger: "City Ledger",
    deferred: "Deferred",
    pending: "Pending",
  };
  if (map[m]) return map[m];
  if (!m) return "—";
  return m
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type PaymentReceiptBranding = {
  hotelName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type PaymentReceiptPayload = PaymentReceiptBranding & {
  guestName: string;
  roomNumber: string;
  folioNumber: string;
  receiptNumber: string;
  /** ISO or parseable date string for display */
  issuedAtIso: string;
  paymentMethodLabel: string;
  amount: number;
  amountInWords: string;
  remark: string;
  staffName: string;
  /** Folio line shown under payment (e.g. extended stay, add charge description) */
  serviceDescription?: string | null;
  /** Shown under title — default "Receipt" */
  receiptTitle?: string;
  /** Room / add-on / extension lines listed on payment receipts for guest context. */
  folioContextLines?: string[] | null;
};

export function defaultPaymentRemark(): string {
  return "ACCOMMODATION";
}

/** Map folio charge types to receipt remark / purpose line */
export function remarkFromChargeType(
  type: string | null | undefined,
  description?: string | null,
): string {
  const t = String(type || "").toLowerCase();
  if (t === "extended_stay") return "EXTENDED STAY";
  if (t === "room_charge" || t === "reservation") return "ACCOMMODATION";
  if (t === "additional_charge" && description) {
    const d = String(description).slice(0, 80).toUpperCase();
    return d || "ADD-ON CHARGE";
  }
  if (t === "charge" && description) {
    const d = String(description).slice(0, 80).toUpperCase();
    return d || "FOLIO CHARGE";
  }
  if (t === "late_checkout") return "LATE CHECKOUT";
  if (t === "payment") return "ACCOMMODATION";
  return "ACCOMMODATION";
}

function receiptBlockStyles(): string {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111; }
    .block { padding: 12px 16px 20px; max-width: 720px; margin: 0 auto; }
    .hotel { font-size: 18px; font-weight: 700; letter-spacing: 0.02em; margin-bottom: 6px; }
    .sub { font-size: 12px; line-height: 1.45; color: #222; }
    .title { text-align: center; font-size: 15px; font-weight: 700; margin: 14px 0 12px; }
    .row { display: flex; justify-content: space-between; gap: 16px; font-size: 12px; }
    .col-left { flex: 1; min-width: 0; }
    .col-right { text-align: right; flex-shrink: 0; font-size: 12px; }
    .label { color: #333; }
    .hr { border: none; border-top: 1px solid #333; margin: 10px 0; }
    .pay-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; margin: 4px 0; }
    .amt { font-weight: 600; }
    .words { font-size: 11px; margin-top: 8px; line-height: 1.4; }
    .footer { display: flex; justify-content: space-between; margin-top: 24px; font-size: 12px; align-items: flex-end; }
    .sig { min-width: 140px; text-align: right; border-top: 1px solid #333; padding-top: 4px; margin-top: 28px; font-size: 11px; }
  `;
}

function oneReceiptBlock(p: PaymentReceiptPayload): string {
  const hotel = escapeHtml(String(p.hotelName ?? "").trim() || "\u2014");
  const addr = p.address ? escapeHtml(p.address) : "";
  const phone = p.phone ? escapeHtml(p.phone) : "";
  const email = p.email ? escapeHtml(p.email) : "";
  const guest = escapeHtml((p.guestName || "Guest").toUpperCase());
  const room = escapeHtml(String(p.roomNumber || "—"));
  const folio = escapeHtml(String(p.folioNumber || "—"));
  const rno = escapeHtml(String(p.receiptNumber));
  const pm = escapeHtml(p.paymentMethodLabel);
  const words = escapeHtml(p.amountInWords);
  const remark = escapeHtml(p.remark);
  const staff = escapeHtml(p.staffName || "—");
  const dateStr = escapeHtml(formatReceiptDateTime(p.issuedAtIso));
  const amountStr = formatAmountReceipt(p.amount);
  const title = escapeHtml((p.receiptTitle || "Receipt").trim() || "Receipt");
  const svc = p.serviceDescription
    ? escapeHtml(String(p.serviceDescription).trim())
    : "";
  const ctxLines = (p.folioContextLines || [])
    .map((line) => escapeHtml(String(line).trim()))
    .filter(Boolean);
  const ctxBlock =
    ctxLines.length > 0
      ? `<div class="words" style="margin-top:8px;"><span class="label">Folio activity (room, add-on and extension charges):</span>${ctxLines.map((l) => `<div style="margin-top:3px;padding-left:8px;">• ${l}</div>`).join("")}</div>`
      : "";

  return `
    <div class="block">
      <div class="hotel">${hotel}</div>
      <div class="sub">${addr ? `${addr}<br/>` : ""}${phone ? `# ${phone}<br/>` : ""}${email ? `${email}` : ""}</div>
      <div class="title">${title}</div>
      <div class="row">
        <div class="col-left">
          <div><span class="label">Room:</span> ${room}</div>
          <div style="margin-top:4px;"><span class="label">Guest:</span> ${guest}</div>
          <div style="margin-top:4px;"><span class="label">Folio No.:</span> ${folio}</div>
        </div>
        <div class="col-right">
          <div><span class="label">No.:</span> ${rno}</div>
          <div style="margin-top:4px;"><span class="label">Date:</span> ${dateStr}</div>
        </div>
      </div>
      <div class="hr"></div>
      ${ctxBlock}
      ${svc ? `<div class="pay-row"><span class="label">Service / folio line:</span><span style="text-align:right;max-width:65%;">${svc}</span></div>` : ""}
      <div class="pay-row">
        <span class="label">Payment Info.:</span>
        <span>${pm}</span>
      </div>
      <div class="pay-row">
        <span class="label">Amount:</span>
        <span class="amt">${escapeHtml(amountStr)}</span>
      </div>
      <div class="hr"></div>
      <div class="words"><span class="label">Amount In Words:</span> ${words}</div>
      <div class="words" style="margin-top:6px;"><span class="label">Remark:</span> ${remark}</div>
      <div class="footer">
        <div><span class="label">User:</span> ${staff}</div>
        <div class="sig">Authorized Signatory</div>
      </div>
    </div>
  `;
}

export function buildPaymentReceiptHtml(p: PaymentReceiptPayload): string {
  const styles = receiptBlockStyles();
  const first = oneReceiptBlock(p);
  const second = oneReceiptBlock(p);
  const cut =
    '<div style="border-top:1px dashed #888;margin:16px 0 20px;max-width:720px;margin-left:auto;margin-right:auto;"></div>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><style>${styles}</style></head><body>${first}${cut}${second}</body></html>`;
}

export function formatReceiptDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function formatAmountReceipt(amount: number): string {
  const abs = Math.abs(Number(amount) || 0);
  const formatted = abs.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} N`;
}
