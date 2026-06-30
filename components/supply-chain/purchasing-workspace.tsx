"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSupplyChain } from "@/lib/supply-chain/supply-chain-context";
import type { PurchaseOrder, RetirementLine } from "@/lib/supply-chain/types";
import { formatNaira } from "@/lib/utils/currency";
import { canonicalRoleKey, canAddStoreItemDirect } from "@/lib/permissions";
import { SupplyHistoryClearButton } from "@/components/supply-chain/supply-history-clear-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info } from "lucide-react";
import { toast } from "sonner";
import {
  poStatusBadge,
} from "@/components/supply-chain/po-approval-panel";
import { PoDetailPanel } from "@/components/supply-chain/po-detail-card";
import { PoCommentBanner } from "@/components/supply-chain/po-comment-banner";
import { PoHistoryPanel } from "@/components/supply-chain/po-history-panel";
import {
  formatPoRaisedAt,
  isPurchasingRetireCandidate,
} from "@/lib/supply-chain/po-format";
import {
  parseQuantityValue,
  sanitizeQuantityInput,
} from "@/lib/supply-chain/measurement-units";
import { useClientMounted } from "@/hooks/use-client-mounted";
import { playNotificationBeep } from "@/lib/utils/play-notification-beep";

const RETIRE_QTY_INPUT_CLASS =
  "h-8 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

function lineNotBought(line: RetirementLine) {
  return line.notBought === true || line.removed === true;
}

function PurchasingRetireRow({
  po,
  onRetire,
}: {
  po: PurchaseOrder;
  onRetire: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-between items-center rounded-md border px-3 py-2 gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium tabular-nums">{po.poNumber}</p>
          {poStatusBadge(po.status)}
          <span className="text-sm font-semibold tabular-nums">
            {formatNaira(po.cashDisbursed)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          Raised {formatPoRaisedAt(po.createdAt)} · {po.createdByName} ·{" "}
          {po.lines.length} line{po.lines.length === 1 ? "" : "s"}
        </p>
        {po.status === "retirement_rejected" && (
          <Badge variant="outline" className="mt-1 text-red-700 border-red-200">
            Retirement rejected — adjust & resubmit
          </Badge>
        )}
      </div>
      <Button size="sm" className="shrink-0" onClick={onRetire}>
        {po.status === "retirement_rejected" ? "Edit retirement" : "Retire at market"}
      </Button>
    </div>
  );
}

export function PurchasingWorkspace() {
  const mounted = useClientMounted();
  const { name, role } = useAuth();
  const searchParams = useSearchParams();
  const poParam = searchParams.get("po");
  const { purchaseOrders, submitRetirement } = useSupplyChain();
  const [selectedId, setSelectedId] = useState<string | null>(poParam);
  const [retireLines, setRetireLines] = useState<RetirementLine[]>([]);
  const [retireQtyText, setRetireQtyText] = useState<Record<string, string>>({});
  const [retirePriceText, setRetirePriceText] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("active");

  const retireCandidates = useMemo(
    () => purchaseOrders.filter((p) => isPurchasingRetireCandidate(p.status)),
    [purchaseOrders],
  );

  const submittedForReview = useMemo(
    () => purchaseOrders.filter((p) => p.status === "retirement_pending_accountant"),
    [purchaseOrders],
  );

  const retiredCount = useMemo(
    () => purchaseOrders.filter((p) => p.status === "retired").length,
    [purchaseOrders],
  );

  const selected = purchaseOrders.find((p) => p.id === selectedId);

  const formatQtyDisplay = (n: number) =>
    Number.isFinite(n) && n > 0 ? String(n) : "";

  const initRetire = (poId: string) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    setSelectedId(poId);
    let lines: RetirementLine[];
    if (po.retirement?.lines?.length && po.status === "retirement_rejected") {
      lines = po.retirement.lines.map((l) => ({ ...l }));
    } else {
      lines = po.lines.map((l) => ({
        lineId: l.id,
        name: l.name,
        unit: l.unit,
        storeUnit: l.storeUnit,
        quantityOrdered: l.quantityOrdered,
        stockQuantityOrdered: l.stockQuantityOrdered,
        quantityBought: l.quantityOrdered,
        stockQuantityBought: l.stockQuantityOrdered,
        poPrice: l.unitPrice,
        actualPrice: l.unitPrice,
        actualStockUnitPrice: l.stockUnitPrice,
        totalPaid: l.quantityOrdered * l.unitPrice,
        notBought: false,
      }));
    }
    setRetireLines(lines);
    const qty: Record<string, string> = {};
    const price: Record<string, string> = {};
    for (const l of lines) {
      qty[l.lineId] = formatQtyDisplay(l.quantityBought);
      price[l.lineId] = formatQtyDisplay(l.actualPrice);
    }
    setRetireQtyText(qty);
    setRetirePriceText(price);
  };

  const updateRetireQty = useCallback((lineId: string, raw: string) => {
    const cleaned = sanitizeQuantityInput(raw);
    setRetireQtyText((prev) => ({ ...prev, [lineId]: cleaned }));
    const q = parseQuantityValue(cleaned);
    setRetireLines((prev) =>
      prev.map((l) => {
        if (l.lineId !== lineId) return l;
        const stockQty =
          l.stockQuantityOrdered && l.quantityOrdered > 0
            ? (q / l.quantityOrdered) * l.stockQuantityOrdered
            : q;
        return {
          ...l,
          quantityBought: q,
          stockQuantityBought: stockQty,
          actualStockUnitPrice:
            stockQty > 0 ? (q * l.actualPrice) / stockQty : l.actualPrice,
          totalPaid: q * l.actualPrice,
        };
      }),
    );
  }, []);

  const updateRetirePrice = useCallback((lineId: string, raw: string) => {
    const cleaned = sanitizeQuantityInput(raw);
    setRetirePriceText((prev) => ({ ...prev, [lineId]: cleaned }));
    const p = parseQuantityValue(cleaned);
    setRetireLines((prev) =>
      prev.map((l) =>
        l.lineId === lineId
          ? {
              ...l,
              actualPrice: p,
              actualStockUnitPrice:
                l.stockQuantityBought && l.stockQuantityBought > 0
                  ? (l.quantityBought * p) / l.stockQuantityBought
                  : p,
              totalPaid: l.quantityBought * p,
            }
          : l,
      ),
    );
  }, []);

  const actualSpent = useMemo(
    () =>
      retireLines
        .filter((l) => !lineNotBought(l))
        .reduce((s, l) => s + l.totalPaid, 0),
    [retireLines],
  );
  const notBoughtTotal = useMemo(
    () =>
      retireLines
        .filter((l) => lineNotBought(l))
        .reduce((s, l) => s + l.poPrice * l.quantityOrdered, 0),
    [retireLines],
  );
  const refund = selected ? selected.cashDisbursed - actualSpent : 0;
  const actor = {
    name: name ?? "Staff",
    role: canonicalRoleKey(role) ?? "staff",
  };
  const canClearHistory = canAddStoreItemDirect(role);

  if (
    selectedId &&
    selected &&
    ["pending_accountant", "pending_manager"].includes(selected.status)
  ) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Purchasing</h1>
          <p className="text-sm text-muted-foreground">
            PO awaiting approval — line items below
          </p>
        </div>
        <PoDetailPanel po={selected} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  if (
    selectedId &&
    selected &&
    isPurchasingRetireCandidate(selected.status)
  ) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelectedId(null)}>
          ← Back to PO list
        </Button>
        <h2 className="text-xl font-semibold">
          Retire — {selected.poNumber} ({formatPoRaisedAt(selected.createdAt)})
        </h2>

        {selected.retirementComment && selected.status === "retirement_rejected" && (
          <PoCommentBanner
            label="Accountant — retirement rejected"
            comment={selected.retirementComment}
            variant="reject"
          />
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Cash Disbursed" value={formatNaira(selected.cashDisbursed)} />
          <StatCard label="Actual Spent" value={formatNaira(actualSpent)} highlight />
          <StatCard label="Not bought (*)" value={formatNaira(notBoughtTotal)} />
          <StatCard label="Refund to Cashier" value={formatNaira(refund)} />
          <StatCard
            label="Price changes"
            value={String(
              retireLines.filter((l) => !lineNotBought(l) && l.poPrice !== l.actualPrice)
                .length,
            )}
          />
        </div>

        <div className="space-y-2">
          {retireLines.map((line) => {
            const notBought = lineNotBought(line);
            return (
              <div
                key={line.lineId}
                className={`rounded-lg border p-3 text-sm space-y-2 ${
                  notBought ? "bg-muted/40 opacity-80" : ""
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`font-medium ${notBought ? "line-through" : ""}`}>
                    {notBought ? "* " : ""}
                    {line.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`bought-${line.lineId}`} className="text-xs">
                      Bought
                    </Label>
                    <Switch
                      id={`bought-${line.lineId}`}
                      checked={!notBought}
                      onCheckedChange={(bought) =>
                        setRetireLines((prev) =>
                          prev.map((l) =>
                            l.lineId === line.lineId
                              ? { ...l, notBought: !bought, removed: !bought }
                              : l,
                          ),
                        )
                      }
                    />
                  </div>
                </div>
                {!notBought && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Ordered</p>
                      <p className="tabular-nums">
                        {line.quantityOrdered} {line.unit ?? ''}
                        {line.stockQuantityOrdered != null && line.storeUnit && line.storeUnit !== line.unit ? (
                          <span className="block text-[10px] text-muted-foreground">
                            Expected in store: {line.stockQuantityOrdered} {line.storeUnit}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Bought qty</p>
                      <Input
                        inputMode="decimal"
                        className={RETIRE_QTY_INPUT_CLASS}
                        placeholder="0"
                        value={retireQtyText[line.lineId] ?? ""}
                        onChange={(e) => updateRetireQty(line.lineId, e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Actual price</p>
                      <Input
                        inputMode="decimal"
                        className={RETIRE_QTY_INPUT_CLASS}
                        placeholder="0"
                        value={retirePriceText[line.lineId] ?? ""}
                        onChange={(e) => updateRetirePrice(line.lineId, e.target.value)}
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Total paid</p>
                      <p className="font-medium tabular-nums">{formatNaira(line.totalPaid)}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button
          onClick={() => {
            submitRetirement(selected.id, retireLines, actor);
            playNotificationBeep();
            toast.success("Retirement submitted — accountant will review in Expenses → Retirement");
            setSelectedId(null);
            setTab("active");
          }}
        >
          Submit retirement for accountant review
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Purchasing</h1>
        <p className="text-sm text-muted-foreground">
          Market purchase, retirement, and your PO history
        </p>
      </div>

      {!mounted ? (
        <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="active">
              Active
              {retireCandidates.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 tabular-nums text-[10px]">
                  {retireCandidates.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history">
              History
              {retiredCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 tabular-nums text-[10px]">
                  {retiredCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-6">
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-4 flex gap-3 text-sm">
              <Info className="h-5 w-5 shrink-0 text-blue-600" />
              <div>
                <p className="font-medium">Retirement workflow</p>
                <p className="text-muted-foreground">
                  After cash disbursement, record what was bought at market. Toggle off items not
                  purchased (*). Submit for accountant review — stock updates when accepted.
                </p>
              </div>
            </div>

            {submittedForReview.length > 0 && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/50 dark:bg-violet-950/20 p-3 text-sm text-muted-foreground">
                {submittedForReview.length} retirement
                {submittedForReview.length === 1 ? "" : "s"} submitted — awaiting accountant at{" "}
                <Link
                  href="/expenses?tab=retirement"
                  className="underline font-medium text-foreground"
                >
                  Expenses → Retirement
                </Link>
                . You can edit again if the accountant rejects.
              </div>
            )}

            <section className="space-y-3">
              <div>
                <h2 className="font-medium">Ready to retire at market</h2>
                <p className="text-xs text-muted-foreground">
                  POs with cash disbursed — record market purchase and submit retirement.
                </p>
              </div>
              {retireCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center">
                  No POs ready for retirement. Complete accountant and manager approvals first.
                </p>
              ) : (
                <div className="space-y-2">
                  {retireCandidates.map((po) => (
                    <PurchasingRetireRow
                      key={po.id}
                      po={po}
                      onRetire={() => initRetire(po.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-medium">Retired purchase orders</h2>
                <p className="text-xs text-muted-foreground">
                  Completed retirements — click a row to see what was bought, edited, or not purchased.
                </p>
              </div>
              {canClearHistory && (
                <SupplyHistoryClearButton
                  actor={actor}
                  description="Clears retired PO history, issue-out log, and supply activity log on this device."
                />
              )}
            </div>
            <PoHistoryPanel
              purchaseOrders={purchaseOrders}
              includeStatuses={["retired"]}
              emptyMessage="No retired purchase orders yet. History appears here after accountant accepts your retirement."
              searchPlaceholder="Search retired PO number, date…"
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${highlight ? "ring-2 ring-primary" : ""}`}
    >
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-base font-bold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
