"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatNaira } from "@/lib/utils/currency";
import {
  fetchGuestCashbackDetailClient,
  type GuestCashbackDetail,
} from "@/lib/cashback/cashback-client";
import { computeCashbackDiscount } from "@/lib/cashback/cashback-payment-math";
import { paymentMethodEarnsCashback } from "@/lib/cashback/cashback-config";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

type Props = {
  guestId: string | null | undefined;
  totalAmount: number;
  /** Cash/POS/transfer amount staff entered (before auto-discount display). */
  cashPaying: number;
  paymentMethod: string;
  applyCashback?: boolean;
  onApplyCashbackChange?: (apply: boolean) => void;
  showPaymentSummary?: boolean;
  /** Bulk: number of rooms in the block. */
  roomCount?: number;
  /** Bulk: average per-room stay total (for breakdown line only). */
  perRoomStayTotal?: number;
};

export function CashbackPaymentPanel({
  guestId,
  totalAmount,
  cashPaying,
  paymentMethod,
  applyCashback = false,
  onApplyCashbackChange,
  showPaymentSummary = true,
  roomCount,
  perRoomStayTotal,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<GuestCashbackDetail | null>(null);

  useEffect(() => {
    if (!guestId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const supabase = createClient();
        const d = await fetchGuestCashbackDetailClient(supabase, guestId);
        if (!cancelled) setDetail(d);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guestId]);

  if (!guestId) return null;

  const method = String(paymentMethod || "").toLowerCase();
  const discount = computeCashbackDiscount({
    totalDue: totalAmount,
    cashbackBalance: detail?.balance ?? 0,
    cashPaying,
    applyCashback,
  });

  const willEarn =
    paymentMethodEarnsCashback(method) && discount.cashToCollect > 0;

  const canApply = (detail?.balance ?? 0) > 0 && totalAmount > 0;

  const isBulkBlock = Boolean(roomCount && roomCount > 1);
  const discountLabel = isBulkBlock ? "this block" : "this stay";

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2 text-sm">
      <p className="font-semibold text-primary">Guest cashback</p>
      {loading && !detail ? (
        <p className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading cashback balance…
        </p>
      ) : (
        <>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Available balance</span>
            <span className="font-semibold">
              {formatNaira(detail?.balance ?? 0)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Lifetime earned</span>
            <span>{formatNaira(detail?.earnedTotal ?? 0)}</span>
          </div>
          {(detail?.earnByRate?.length ?? 0) > 0 && (
            <div className="pt-1 border-t border-primary/10 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Earned by program rate
              </p>
              {detail!.earnByRate.map((row) => (
                <div key={row.id} className="flex justify-between text-xs">
                  <span>{row.label}</span>
                  <span>{formatNaira(row.earned)}</span>
                </div>
              ))}
            </div>
          )}
          {canApply && onApplyCashbackChange && (
            <div className="flex items-start gap-2 pt-1 border-t border-primary/10">
              <Checkbox
                id="apply-cashback-discount"
                checked={applyCashback}
                onCheckedChange={(c) => onApplyCashbackChange(Boolean(c))}
              />
              <Label
                htmlFor="apply-cashback-discount"
                className="text-xs font-normal leading-snug cursor-pointer"
              >
                Apply cashback discount (
                {formatNaira(Math.min(detail?.balance ?? 0, totalAmount))} off{" "}
                {discountLabel})
              </Label>
            </div>
          )}
          {showPaymentSummary && totalAmount > 0 && (
            <div className="pt-2 border-t border-primary/10 space-y-1">
              {isBulkBlock ? (
                <>
                  <div className="flex justify-between font-medium">
                    <span className="text-muted-foreground">Block total</span>
                    <span>{formatNaira(totalAmount)}</span>
                  </div>
                  {perRoomStayTotal != null && perRoomStayTotal > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {roomCount} room{roomCount === 1 ? "" : "s"} ×{" "}
                      {formatNaira(perRoomStayTotal)} per room
                    </div>
                  )}
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Room / stay total</span>
                  <span>{formatNaira(totalAmount)}</span>
                </div>
              )}
              {discount.cashbackDiscount > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Cashback discount</span>
                  <span>−{formatNaira(discount.cashbackDiscount)}</span>
                </div>
              )}
              {discount.cashToCollect > 0 && (
                <div className="flex justify-between font-medium">
                  <span>Guest pays (cash / POS / transfer)</span>
                  <span>{formatNaira(discount.cashToCollect)}</span>
                </div>
              )}
              {discount.balanceRemaining > 0 && (
                <div className="flex justify-between text-orange-700 font-medium">
                  <span>Balance still due</span>
                  <span>{formatNaira(discount.balanceRemaining)}</span>
                </div>
              )}
              {willEarn && (
                <p className="text-xs text-muted-foreground">
                  Guest will earn cashback on the{" "}
                  {formatNaira(discount.cashToCollect)} cash payment (per your
                  Settings rate).
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
