import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateCashbackEarnAmount,
  fetchCashbackConfig,
  paymentMethodEarnsCashback,
} from "@/lib/cashback/cashback-config";
import {
  cashbackVoidSourceType,
  groupEarnAmountsByGuest,
  nextCashbackTotalsAfterEarnVoid,
  shouldReverseCashbackEarns,
} from "@/lib/cashback/reverse-cashback-earn";

export type GuestCashbackBalance = {
  guestId: string;
  earnedTotal: number;
  redeemedTotal: number;
  balance: number;
};

export type CashbackTxnType = "earn" | "redeem" | "adjust";

function isCashbackTableError(err: { message?: string } | null): boolean {
  const m = (err?.message || "").toLowerCase();
  return (
    m.includes("guest_cashback_balances") ||
    m.includes("cashback_transactions") ||
    (m.includes("does not exist") && m.includes("cashback"))
  );
}

async function ensureBalanceRow(
  admin: SupabaseClient,
  organizationId: string,
  guestId: string,
): Promise<{ earned: number; redeemed: number; balance: number } | null> {
  const { data: existing, error: selErr } = await admin
    .from("guest_cashback_balances")
    .select("earned_total, redeemed_total, balance")
    .eq("organization_id", organizationId)
    .eq("guest_id", guestId)
    .maybeSingle();

  if (selErr) {
    if (isCashbackTableError(selErr)) return null;
    throw new Error(selErr.message);
  }

  if (existing) {
    return {
      earned: Number(existing.earned_total || 0),
      redeemed: Number(existing.redeemed_total || 0),
      balance: Number(existing.balance || 0),
    };
  }

  const { data: inserted, error: insErr } = await admin
    .from("guest_cashback_balances")
    .insert({
      organization_id: organizationId,
      guest_id: guestId,
      earned_total: 0,
      redeemed_total: 0,
      balance: 0,
    })
    .select("earned_total, redeemed_total, balance")
    .single();

  if (insErr) {
    if (isCashbackTableError(insErr)) return null;
    throw new Error(insErr.message);
  }

  return {
    earned: Number(inserted.earned_total || 0),
    redeemed: Number(inserted.redeemed_total || 0),
    balance: Number(inserted.balance || 0),
  };
}

export async function getGuestCashbackBalance(
  admin: SupabaseClient,
  organizationId: string,
  guestId: string,
): Promise<GuestCashbackBalance | null> {
  const row = await ensureBalanceRow(admin, organizationId, guestId);
  if (!row) return null;
  return {
    guestId,
    earnedTotal: row.earned,
    redeemedTotal: row.redeemed,
    balance: row.balance,
  };
}

export async function recordCashbackEarn(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    guestId: string;
    paymentAmount: number;
    paymentMethod: string;
    userId?: string | null;
    sourceType?: string;
    sourceId?: string;
    description?: string;
  },
): Promise<{ earned: number } | null> {
  if (!paymentMethodEarnsCashback(input.paymentMethod)) return { earned: 0 };

  const config = await fetchCashbackConfig(admin, input.organizationId);
  if (!config.enabled) return { earned: 0 };

  const earnAmount = calculateCashbackEarnAmount(
    input.paymentAmount,
    config.percent,
  );
  if (earnAmount <= 0) return { earned: 0 };

  const current = await ensureBalanceRow(
    admin,
    input.organizationId,
    input.guestId,
  );
  if (!current) return null;

  const newEarned = current.earned + earnAmount;
  const newBalance = current.balance + earnAmount;

  const { error: upErr } = await admin
    .from("guest_cashback_balances")
    .update({
      earned_total: newEarned,
      balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId)
    .eq("guest_id", input.guestId);

  if (upErr) throw new Error(upErr.message);

  const { error: txnErr } = await admin.from("cashback_transactions").insert({
    organization_id: input.organizationId,
    guest_id: input.guestId,
    txn_type: "earn",
    amount: earnAmount,
    balance_after: newBalance,
    source_type: input.sourceType || "payment",
    source_id: input.sourceId || null,
    description:
      input.description ||
      `Cashback ${config.percent}% on ${input.paymentMethod.replace(/_/g, " ")} payment`,
    payment_method: input.paymentMethod,
    earn_rate_percent: config.percent,
    created_by: input.userId || null,
  });

  if (txnErr) {
    const m = (txnErr.message || "").toLowerCase();
    if (m.includes("earn_rate_percent")) {
      const { error: retryErr } = await admin
        .from("cashback_transactions")
        .insert({
          organization_id: input.organizationId,
          guest_id: input.guestId,
          txn_type: "earn",
          amount: earnAmount,
          balance_after: newBalance,
          source_type: input.sourceType || "payment",
          source_id: input.sourceId || null,
          description:
            input.description ||
            `Cashback ${config.percent}% on ${input.paymentMethod.replace(/_/g, " ")} payment`,
          payment_method: input.paymentMethod,
          created_by: input.userId || null,
        });
      if (retryErr) throw new Error(retryErr.message);
    } else {
      throw new Error(txnErr.message);
    }
  }

  return { earned: earnAmount };
}

export async function recordCashbackRedeem(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    guestId: string;
    amount: number;
    userId?: string | null;
    sourceType?: string;
    sourceId?: string;
    description?: string;
  },
): Promise<{ redeemed: number; balanceAfter: number }> {
  const redeemAmount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(redeemAmount) || redeemAmount <= 0) {
    throw new Error("Invalid cashback redemption amount");
  }

  const current = await ensureBalanceRow(
    admin,
    input.organizationId,
    input.guestId,
  );
  if (!current)
    throw new Error("Cashback is not available (run migration 074)");

  if (redeemAmount > current.balance + 0.001) {
    throw new Error(
      `Insufficient cashback balance (available ₦${current.balance.toLocaleString()})`,
    );
  }

  const newRedeemed = current.redeemed + redeemAmount;
  const newBalance = Math.max(0, current.balance - redeemAmount);

  const { error: upErr } = await admin
    .from("guest_cashback_balances")
    .update({
      redeemed_total: newRedeemed,
      balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId)
    .eq("guest_id", input.guestId);

  if (upErr) throw new Error(upErr.message);

  const { error: txnErr } = await admin.from("cashback_transactions").insert({
    organization_id: input.organizationId,
    guest_id: input.guestId,
    txn_type: "redeem",
    amount: redeemAmount,
    balance_after: newBalance,
    source_type: input.sourceType || "redemption",
    source_id: input.sourceId || null,
    description: input.description || "Cashback redeemed as payment",
    payment_method: "cashback",
    created_by: input.userId || null,
  });

  if (txnErr) throw new Error(txnErr.message);

  return { redeemed: redeemAmount, balanceAfter: newBalance };
}

export async function recordCashbackAdjust(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    guestId: string;
    /** Positive adds balance; negative deducts. */
    delta: number;
    userId?: string | null;
    description?: string;
  },
): Promise<{ balanceAfter: number }> {
  const delta = Math.round(Number(input.delta) * 100) / 100;
  if (!Number.isFinite(delta) || delta === 0) {
    throw new Error("Adjustment amount must be non-zero");
  }

  const current = await ensureBalanceRow(
    admin,
    input.organizationId,
    input.guestId,
  );
  if (!current)
    throw new Error("Cashback is not available (run migration 074)");

  const newBalance = Math.max(0, current.balance + delta);
  const earnedDelta = delta > 0 ? delta : 0;
  const redeemedDelta = delta < 0 ? Math.abs(delta) : 0;

  const { error: upErr } = await admin
    .from("guest_cashback_balances")
    .update({
      earned_total: current.earned + earnedDelta,
      redeemed_total: current.redeemed + redeemedDelta,
      balance: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", input.organizationId)
    .eq("guest_id", input.guestId);

  if (upErr) throw new Error(upErr.message);

  const { error: txnErr } = await admin.from("cashback_transactions").insert({
    organization_id: input.organizationId,
    guest_id: input.guestId,
    txn_type: "adjust",
    amount: Math.abs(delta),
    balance_after: newBalance,
    source_type: "manual",
    description: input.description || "Manual cashback adjustment",
    created_by: input.userId || null,
  });

  if (txnErr) throw new Error(txnErr.message);

  return { balanceAfter: newBalance };
}

/**
 * Claw back cashback earned for a specific source (e.g. an outlet order).
 * Idempotent: a second call with the same source is a no-op.
 */
export async function reverseCashbackEarnForSource(
  admin: SupabaseClient,
  input: {
    organizationId: string;
    sourceType: string;
    sourceId: string;
    userId?: string | null;
    description?: string;
  },
): Promise<{ reversed: number }> {
  const sourceId = String(input.sourceId || "").trim();
  const sourceType = String(input.sourceType || "").trim();
  if (!sourceId || !sourceType) return { reversed: 0 };

  const voidSourceType = cashbackVoidSourceType(sourceType);

  const { data: existingVoid, error: voidErr } = await admin
    .from("cashback_transactions")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("source_type", voidSourceType)
    .eq("source_id", sourceId)
    .limit(1);

  if (voidErr) {
    if (isCashbackTableError(voidErr)) return { reversed: 0 };
    throw new Error(voidErr.message);
  }

  const { data: earns, error: earnErr } = await admin
    .from("cashback_transactions")
    .select("guest_id, amount")
    .eq("organization_id", input.organizationId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .eq("txn_type", "earn");

  if (earnErr) {
    if (isCashbackTableError(earnErr)) return { reversed: 0 };
    throw new Error(earnErr.message);
  }

  if (
    !shouldReverseCashbackEarns({
      earnCount: earns?.length ?? 0,
      alreadyReversed: !!(existingVoid && existingVoid.length > 0),
    })
  ) {
    return { reversed: 0 };
  }

  const grouped = groupEarnAmountsByGuest(earns ?? []);
  let reversed = 0;

  for (const { guestId, amount } of grouped) {
    const current = await ensureBalanceRow(
      admin,
      input.organizationId,
      guestId,
    );
    if (!current) continue;

    const next = nextCashbackTotalsAfterEarnVoid(current, amount);

    const { error: upErr } = await admin
      .from("guest_cashback_balances")
      .update({
        earned_total: next.earnedTotal,
        balance: next.balance,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", input.organizationId)
      .eq("guest_id", guestId);

    if (upErr) throw new Error(upErr.message);

    const { error: txnErr } = await admin.from("cashback_transactions").insert({
      organization_id: input.organizationId,
      guest_id: guestId,
      txn_type: "adjust",
      amount,
      balance_after: next.balance,
      source_type: voidSourceType,
      source_id: sourceId,
      description:
        input.description || "Cashback reversed because the sale was voided",
      created_by: input.userId || null,
    });

    if (txnErr) throw new Error(txnErr.message);
    reversed = Math.round((reversed + amount) * 100) / 100;
  }

  return { reversed };
}
