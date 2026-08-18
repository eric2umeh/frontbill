"use client";

import { useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSupplyChain } from "@/lib/supply-chain/supply-chain-context";
import type { PurchaseOrder, RetirementLine, SupplyDept } from "@/lib/supply-chain/types";
import {
  DEPT_LABELS,
  STORE_DEPT_PICKER_OPTIONS_SORTED,
  normalizeSupplyDept,
} from "@/lib/supply-chain/types";
import { formatNaira } from "@/lib/utils/currency";
import { canonicalRoleKey, canSupplyRetirementReview } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  poStatusBadge,
} from "@/components/supply-chain/po-approval-panel";
import { PoDetailPanel } from "@/components/supply-chain/po-detail-card";
import { PoCommentBanner } from "@/components/supply-chain/po-comment-banner";
import { PoHistoryPanel } from "@/components/supply-chain/po-history-panel";
import { PoRetirementPanel } from "@/components/supply-chain/po-retirement-panel";
import {
  formatPoRaisedAt,
  getPoApprovedAmount,
  isPurchasingRetireCandidate,
  isPurchasingRetirementInReview,
} from "@/lib/supply-chain/po-format";
import {
  parseQuantityValue,
  sanitizeQuantityInput,
} from "@/lib/supply-chain/measurement-units";
import { useClientMounted } from "@/hooks/use-client-mounted";
import { playNotificationBeep } from "@/lib/utils/play-notification-beep";
import { PaginatedListShell } from "@/components/shared/paginated-list-shell";

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
  const inReview = isPurchasingRetirementInReview(po.status);
  const rejected = po.status === "retirement_rejected";
  return (
    <div className="flex flex-wrap justify-between items-center rounded-md border px-3 py-2 gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium tabular-nums">{po.poNumber}</p>
          {poStatusBadge(po)}
          <span className="text-sm font-semibold tabular-nums">
            {formatNaira(po.cashDisbursed)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          Raised {formatPoRaisedAt(po.createdAt)} · {po.createdByName} ·{" "}
          {po.lines.length} line{po.lines.length === 1 ? "" : "s"}
        </p>
        {rejected && (
          <Badge variant="outline" className="mt-1 text-red-700 border-red-200">
            Retirement rejected — adjust & resubmit
          </Badge>
        )}
        {inReview && (
          <Badge variant="outline" className="mt-1 text-violet-800 border-violet-200">
            Awaiting accountant — retire locked
          </Badge>
        )}
      </div>
      {inReview ? (
        <Button size="sm" className="shrink-0" variant="outline" disabled>
          In review
        </Button>
      ) : (
        <Button size="sm" className="shrink-0" onClick={onRetire}>
          {rejected ? "Edit retirement" : "Retire at market"}
        </Button>
      )}
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
  const [tab, setTab] = useState(searchParams.get("tab") === "history" ? "history" : "active");
  const [confirmRetireOpen, setConfirmRetireOpen] = useState(false);

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
    if (isPurchasingRetirementInReview(po.status)) {
      toast.message("Retirement is awaiting accountant review — wait for accept or reject");
      return;
    }
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
  const canRetirementReview = canSupplyRetirementReview(role);
  if (
    selectedId &&
    selected &&
    ["pending_accountant", "pending_manager"].includes(selected.status)
  ) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Retirement</h1>
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
    isPurchasingRetirementInReview(selected.status)
  ) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setSelectedId(null)}>
          ← Back to PO list
        </Button>
        <div className="rounded-lg border border-violet-200 bg-violet-50/70 dark:bg-violet-950/30 px-3 py-2.5 space-y-1">
          <p className="text-sm font-semibold text-violet-900">
            Retirement awaiting accountant — retire locked
          </p>
          <p className="text-xs text-violet-800/90">
            You can edit again only if the accountant rejects this submission.
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
          <StatCard label="Not bought" value={formatNaira(notBoughtTotal)} />
          {refund < 0 ? (
            <StatCard
              label="Refund to Cashier"
              value={formatNaira(Math.abs(refund))}
              amountClassName="bg-red-500/15 text-red-800 dark:text-red-200"
            />
          ) : refund > 0 ? (
            <StatCard
              label="Cashier Return Cash"
              value={formatNaira(refund)}
              amountClassName="bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
            />
          ) : (
            <StatCard label="Even" value={formatNaira(0)} />
          )}
          <StatCard
            label="Price changes"
            value={String(
              retireLines.filter((l) => !lineNotBought(l) && l.poPrice !== l.actualPrice)
                .length,
            )}
          />
        </div>

        <PaginatedListShell
          items={retireLines.map((line) => {
            const poLine = selected.lines.find((l) => l.id === line.lineId);
            return {
              ...line,
              dept: normalizeSupplyDept(poLine?.dept ?? "kitchen"),
            };
          })}
          pageSize={8}
          searchPlaceholder="Search retirement items…"
          searchMatch={(line, query) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            const dept = normalizeSupplyDept(line.dept);
            return (
              line.name.toLowerCase().includes(q) ||
              (line.unit ?? "").toLowerCase().includes(q) ||
              (DEPT_LABELS[dept] ?? dept).toLowerCase().includes(q)
            );
          }}
          filters={[
            {
              key: "dept",
              label: "Department",
              options: STORE_DEPT_PICKER_OPTIONS_SORTED.filter((d) =>
                selected.lines.some((l) => normalizeSupplyDept(l.dept) === d),
              ).map((d) => ({
                value: d,
                label: DEPT_LABELS[d],
              })),
            },
          ]}
          filterMatch={(line, key, value) => {
            if (key !== "dept") return undefined;
            if (!value || value === "all") return true;
            return normalizeSupplyDept(line.dept) === normalizeSupplyDept(value);
          }}
          emptyMessage="No retirement lines match."
        >
          {(pageItems) => (
            <div className="space-y-2">
              {pageItems.map((line) => {
                const notBought = lineNotBought(line);
                return (
                  <div
                    key={line.lineId}
                    className={`rounded-lg border p-3 text-sm space-y-2 ${
                      notBought
                        ? "border-red-200 bg-red-50/70 dark:bg-red-950/20 opacity-90"
                        : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className={`font-medium ${notBought ? "line-through decoration-2 text-muted-foreground" : ""}`}>
                          {line.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {DEPT_LABELS[line.dept] ?? line.dept}
                        </p>
                        {notBought ? (
                          <Badge className="mt-1 bg-red-100 text-red-900">Not bought / removed</Badge>
                        ) : null}
                      </div>
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
                            {line.quantityOrdered} {line.unit ?? ""}
                            {line.stockQuantityOrdered != null &&
                            line.storeUnit &&
                            line.storeUnit !== line.unit ? (
                              <span className="block text-[10px] text-muted-foreground">
                                Expected in store: {line.stockQuantityOrdered}{" "}
                                {line.storeUnit}
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
                            onChange={(e) =>
                              updateRetirePrice(line.lineId, e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-0.5">Total paid</p>
                          <p className="font-medium tabular-nums">
                            {formatNaira(line.totalPaid)}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </PaginatedListShell>

        <Button onClick={() => setConfirmRetireOpen(true)}>
          Confirm & retire — add stock to store
        </Button>
        <AlertDialog open={confirmRetireOpen} onOpenChange={setConfirmRetireOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Retire {selected.poNumber}?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    This adds bought items to Central Store stock immediately. Accountant approval
                    is not required.
                  </p>
                  {(() => {
                    const approvedAmt = getPoApprovedAmount(selected)
                    const retiredAmt = retireLines
                      .filter((l) => !(l.notBought || l.removed))
                      .reduce((s, l) => s + l.totalPaid, 0)
                    const delta = Math.round((retiredAmt - approvedAmt) * 100) / 100
                    return (
                      <ul className="rounded-md border bg-muted/40 px-3 py-2 space-y-1 text-foreground">
                        <li>Approved PO: {formatNaira(approvedAmt)}</li>
                        <li>Retired total: {formatNaira(retiredAmt)}</li>
                        <li>
                          Difference:{" "}
                          {delta === 0
                            ? formatNaira(0)
                            : delta > 0
                              ? `${formatNaira(delta)} debit (spent more)`
                              : `${formatNaira(Math.abs(delta))} credit (spent less)`}
                        </li>
                      </ul>
                    )
                  })()}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  submitRetirement(selected.id, retireLines, actor);
                  playNotificationBeep();
                  toast.success("PO retired — stock added to Central Store");
                  setConfirmRetireOpen(false);
                  setSelectedId(null);
                  setTab("history");
                }}
              >
                Retire PO
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Retirement</h1>
        <p className="text-sm text-muted-foreground">
          Market purchase and retirement. Retiring a PO adds items to Central Store immediately.
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
              Retirement History
              {retiredCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 tabular-nums text-[10px]">
                  {retiredCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="mt-4 space-y-6">
            {canRetirementReview ? (
              <PoRetirementPanel showAcceptedSection={false} />
            ) : null}

            {submittedForReview.length > 0 && (
              <section className="space-y-3">
                <div className="rounded-lg border border-violet-200 bg-violet-50/50 dark:bg-violet-950/20 p-3 text-sm text-muted-foreground">
                  {submittedForReview.length} retirement
                  {submittedForReview.length === 1 ? "" : "s"} submitted — awaiting accountant review.
                  Retire at market stays locked until accept or reject.
                </div>
                <PaginatedListShell
                  items={submittedForReview}
                  pageSize={8}
                  searchPlaceholder="Search submitted retirement…"
                  searchMatch={(po, query) => {
                    const q = query.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      po.poNumber.toLowerCase().includes(q) ||
                      po.createdByName.toLowerCase().includes(q) ||
                      (po.retirement?.submittedBy ?? "").toLowerCase().includes(q)
                    );
                  }}
                  emptyMessage="No retirements awaiting accountant."
                >
                  {(pageItems) => (
                    <div className="space-y-2">
                      {pageItems.map((po) => (
                        <PurchasingRetireRow
                          key={po.id}
                          po={po}
                          onRetire={() => initRetire(po.id)}
                        />
                      ))}
                    </div>
                  )}
                </PaginatedListShell>
              </section>
            )}

            <section className="space-y-3">
              <div>
                <h2 className="font-medium">Ready to retire at market</h2>
                <p className="text-xs text-muted-foreground">
                  POs with manager approval — record market purchase and retire. Stock is added when you retire.
                </p>
              </div>
              {retireCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center">
                  No POs ready for retirement. Complete accountant and manager approvals first.
                </p>
              ) : (
                <PaginatedListShell
                  items={retireCandidates}
                  pageSize={8}
                  searchPlaceholder="Search PO number, raiser…"
                  searchMatch={(po, query) => {
                    const q = query.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      po.poNumber.toLowerCase().includes(q) ||
                      po.createdByName.toLowerCase().includes(q) ||
                      formatPoRaisedAt(po.createdAt).toLowerCase().includes(q) ||
                      po.lines.some((l) => l.name.toLowerCase().includes(q))
                    );
                  }}
                  emptyMessage="No POs ready for retirement."
                >
                  {(pageItems) => (
                    <div className="space-y-2">
                      {pageItems.map((po) => (
                        <PurchasingRetireRow
                          key={po.id}
                          po={po}
                          onRetire={() => initRetire(po.id)}
                        />
                      ))}
                    </div>
                  )}
                </PaginatedListShell>
              )}
            </section>
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            <div>
              <h2 className="font-medium">Retired purchase orders</h2>
              <p className="text-xs text-muted-foreground">
                Completed retirements — approved vs retired totals, with changed lines highlighted.
              </p>
            </div>
            <PoHistoryPanel
              purchaseOrders={purchaseOrders}
              includeStatuses={["retired"]}
              emptyMessage="No retired purchase orders yet. Retirement History appears here after you retire a PO from Active."
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
  amountClassName,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  amountClassName?: string;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${highlight ? "ring-2 ring-primary" : ""}`}
    >
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p
        className={`text-base font-bold tabular-nums mt-0.5 rounded-md px-1.5 py-0.5 inline-block ${amountClassName ?? ""}`}
      >
        {value}
      </p>
    </div>
  );
}
