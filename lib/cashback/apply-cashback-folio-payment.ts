import type { SupabaseClient } from "@supabase/supabase-js";
import { insertFolioCharges } from "@/lib/utils/insert-folio-charges";
import { redeemCashbackClient } from "@/lib/cashback/cashback-client";

export type ApplyCashbackFolioPaymentInput = {
  guestId: string;
  bookingId: string;
  organizationId: string;
  cashbackDiscount: number;
  cashAmount: number;
  cashPaymentMethod: string;
  createdBy?: string | null;
  sourceType: string;
  sourceId: string;
  cashDescription?: string;
};

/** Redeem cashback discount + post folio payment lines (discount + cash/POS/transfer). */
export async function applyCashbackDiscountAndFolioPayments(
  supabase: SupabaseClient,
  input: ApplyCashbackFolioPaymentInput,
): Promise<void> {
  const discount = Math.round(Number(input.cashbackDiscount) * 100) / 100;
  const cash = Math.round(Number(input.cashAmount) * 100) / 100;
  if (discount <= 0 && cash <= 0) return;

  if (discount > 0) {
    await redeemCashbackClient(supabase, {
      guestId: input.guestId,
      amount: discount,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      description: `Cashback discount applied — ${input.sourceId}`,
    });
  }

  const rows: Record<string, unknown>[] = [];

  if (discount > 0) {
    rows.push({
      booking_id: input.bookingId,
      organization_id: input.organizationId,
      description: "Cashback discount applied",
      amount: -discount,
      charge_type: "payment",
      payment_method: "cashback",
      payment_status: "paid",
      created_by: input.createdBy ?? null,
    });
  }

  if (cash > 0) {
    const method = String(input.cashPaymentMethod || "pos").replace(/_/g, " ");
    rows.push({
      booking_id: input.bookingId,
      organization_id: input.organizationId,
      description: input.cashDescription || `Payment received - ${method}`,
      amount: -cash,
      charge_type: "payment",
      payment_method: input.cashPaymentMethod,
      payment_status: "paid",
      created_by: input.createdBy ?? null,
    });
  }

  if (rows.length > 0) {
    const { error } = await insertFolioCharges(supabase, rows);
    if (error) throw error;
  }
}
