"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
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
import {
  canonicalRoleKey,
  canSupplyRetirementReview,
  canAddPurchasedToStock,
} from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { poStatusBadge } from "@/components/supply-chain/po-approval-panel";
import { PoDetailPanel } from "@/components/supply-chain/po-detail-card";
import { PoCommentBanner } from "@/components/supply-chain/po-comment-banner";
import { PoHistoryPanel } from "@/components/supply-chain/po-history-panel";
import { PoRetirementPanel } from "@/components/supply-chain/po-retirement-panel";
import {
  AddExtraStockItemsModal,
  type ExtraStockPick,
} from "@/components/supply-chain/add-extra-stock-items-modal";
import {
  formatPoRaisedAt,
  getPoApprovedAmount,
  isPurchasingRetirementInReview,
} from "@/lib/supply-chain/po-format";
import {
  isAddToStockCandidate,
  isRetirementReviewCandidate,
  remainingQtyForPoLine,
  stockedQtyForPoLine,
} from "@/lib/supply-chain/add-to-stock";
import {
  parseQuantityValue,
  sanitizeQuantityInput,
} from "@/lib/supply-chain/measurement-units";
import { useClientMounted } from "@/hooks/use-client-mounted";
import { playNotificationBeep } from "@/lib/utils/play-notification-beep";
import { PaginatedListShell } from "@/components/shared/paginated-list-shell";
import { PackagePlus } from "lucide-react";
import { cn } from "@/lib/utils";

const QTY_INPUT_CLASS =
  "h-8 tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

type WorkLine = RetirementLine & {
  dept: Exclude<SupplyDept, "all">;
  alreadyStocked: boolean;
  remainingCap: number | null;
};

function PurchasingRetireRow({
  po,
  onOpen,
  canAct = true,
  actionLabel = "Add to stock",
}: {
  po: PurchaseOrder;
  onOpen: () => void;
  canAct?: boolean;
  actionLabel?: string;
}) {
  const inReview = isPurchasingRetirementInReview(po.status);
  const rejected = po.status === "retirement_rejected";
  const stockedCount = (po.retirement?.lines ?? []).filter(
    (l) => l.stockedAt && !(l.notBought || l.removed),
  ).length;
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
          {stockedCount > 0 ? ` · ${stockedCount} already in stock` : ""}
        </p>
        {rejected && (
          <Badge variant="outline" className="mt-1 text-red-700 border-red-200">
            Retirement rejected — continue Add to stock
          </Badge>
        )}
        {inReview && (
          <Badge variant="outline" className="mt-1 text-violet-800 border-violet-200">
            Awaiting retirement review
          </Badge>
        )}
      </div>
      {canAct ? (
        <Button size="sm" className="shrink-0" onClick={onOpen}>
          {actionLabel}
        </Button>
      ) : (
        <Badge variant="outline" className="shrink-0 text-muted-foreground">
          View only
        </Badge>
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
    <div className={`rounded-xl border p-3 ${highlight ? "ring-2 ring-primary" : ""}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p
        className={`text-base font-bold tabular-nums mt-0.5 rounded-md px-1.5 py-0.5 inline-block ${amountClassName ?? ""}`}
      >
        {value}
      </p>
    </div>
  );
}

export function PurchasingWorkspace() {
  const mounted = useClientMounted();
  const { name, role } = useAuth();
  const searchParams = useSearchParams();
  const poParam = searchParams.get("po");
  const { purchaseOrders, storeItems, submitAddToStock } = useSupplyChain();
  const [selectedId, setSelectedId] = useState<string | null>(poParam);
  const [workLines, setWorkLines] = useState<WorkLine[]>([]);
  const [qtyText, setQtyText] = useState<Record<string, string>>({});
  const [priceText, setPriceText] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState(() => {
    const t = searchParams.get("tab");
    if (t === "history" || t === "retirement" || t === "active") return t;
    return "active";
  });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "history" || t === "retirement" || t === "active") setTab(t);
  }, [searchParams]);

  const actor = {
    name: name ?? "Staff",
    role: canonicalRoleKey(role) ?? "staff",
  };
  const canAddStock = canAddPurchasedToStock(role);
  const canRetirementReview = canSupplyRetirementReview(role);

  const activeCandidates = useMemo(
    () =>
      purchaseOrders.filter(
        (p) => !p.deletedAt && isAddToStockCandidate(p.status) && p.status !== "retired",
      ),
    [purchaseOrders],
  );

  const retirementQueue = useMemo(
    () =>
      purchaseOrders.filter(
        (p) => !p.deletedAt && isRetirementReviewCandidate(p.status),
      ),
    [purchaseOrders],
  );

  const retiredCount = useMemo(
    () => purchaseOrders.filter((p) => p.status === "retired").length,
    [purchaseOrders],
  );

  const selected = purchaseOrders.find((p) => p.id === selectedId);

  const formatQtyDisplay = (n: number) =>
    Number.isFinite(n) && n > 0 ? String(n) : "";

  const initAddToStock = (poId: string) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    setSelectedId(poId);

    const lines: WorkLine[] = [];
    for (const l of po.lines) {
      const remaining = remainingQtyForPoLine(po, l.id);
      const already = stockedQtyForPoLine(po, l.id);
      if (remaining <= 0 && already > 0) {
        lines.push({
          lineId: l.id,
          name: l.name,
          unit: l.unit,
          storeUnit: l.storeUnit,
          quantityOrdered: l.quantityOrdered,
          stockQuantityOrdered: l.stockQuantityOrdered,
          quantityBought: already,
          stockQuantityBought: l.stockQuantityOrdered,
          poPrice: l.unitPrice,
          actualPrice: l.unitPrice,
          actualStockUnitPrice: l.stockUnitPrice,
          totalPaid: already * l.unitPrice,
          notBought: false,
          stockItemId: l.stockItemId,
          dept: normalizeSupplyDept(l.dept),
          alreadyStocked: true,
          remainingCap: 0,
          stockedAt: po.retirement?.lines.find((r) => r.lineId === l.id)?.stockedAt,
        });
        continue;
      }
      if (remaining <= 0) continue;
      lines.push({
        lineId: l.id,
        name: l.name,
        unit: l.unit,
        storeUnit: l.storeUnit,
        quantityOrdered: l.quantityOrdered,
        stockQuantityOrdered: l.stockQuantityOrdered,
        quantityBought: remaining,
        stockQuantityBought:
          l.stockQuantityOrdered && l.quantityOrdered > 0
            ? (remaining / l.quantityOrdered) * l.stockQuantityOrdered
            : remaining,
        poPrice: l.unitPrice,
        actualPrice: l.unitPrice,
        actualStockUnitPrice: l.stockUnitPrice,
        totalPaid: remaining * l.unitPrice,
        notBought: false,
        stockItemId: l.stockItemId,
        dept: normalizeSupplyDept(l.dept),
        alreadyStocked: false,
        remainingCap: remaining,
      });
    }

    // Carry newly-added draft rows that were not yet stocked (shouldn't exist in retirement yet)
    // Plus show already-stocked newly added as read-only
    for (const rl of po.retirement?.lines ?? []) {
      if (!rl.newlyAdded) continue;
      if (lines.some((x) => x.lineId === rl.lineId)) continue;
      lines.push({
        ...rl,
        dept: normalizeSupplyDept(rl.dept ?? "restaurant"),
        alreadyStocked: Boolean(rl.stockedAt),
        remainingCap: rl.stockedAt ? 0 : null,
      });
    }

    setWorkLines(lines);
    const qty: Record<string, string> = {};
    const price: Record<string, string> = {};
    const sel: Record<string, boolean> = {};
    for (const l of lines) {
      if (l.alreadyStocked) continue;
      qty[l.lineId] = formatQtyDisplay(l.quantityBought);
      price[l.lineId] = formatQtyDisplay(l.actualPrice);
    }
    setQtyText(qty);
    setPriceText(price);
    setSelectedIds(sel);
  };

  const updateQty = useCallback((lineId: string, raw: string) => {
    const cleaned = sanitizeQuantityInput(raw);
    setQtyText((prev) => ({ ...prev, [lineId]: cleaned }));
    const q = parseQuantityValue(cleaned);
    setWorkLines((prev) =>
      prev.map((l) => {
        if (l.lineId !== lineId || l.alreadyStocked) return l;
        const capped =
          l.remainingCap != null ? Math.min(q, l.remainingCap) : q;
        const stockQty =
          l.stockQuantityOrdered && l.quantityOrdered > 0
            ? (capped / l.quantityOrdered) * l.stockQuantityOrdered
            : capped;
        return {
          ...l,
          quantityBought: capped,
          stockQuantityBought: stockQty,
          actualStockUnitPrice:
            stockQty > 0 ? (capped * l.actualPrice) / stockQty : l.actualPrice,
          totalPaid: capped * l.actualPrice,
        };
      }),
    );
  }, []);

  const updatePrice = useCallback((lineId: string, raw: string) => {
    const cleaned = sanitizeQuantityInput(raw);
    setPriceText((prev) => ({ ...prev, [lineId]: cleaned }));
    const p = parseQuantityValue(cleaned);
    setWorkLines((prev) =>
      prev.map((l) =>
        l.lineId === lineId && !l.alreadyStocked
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

  const selectedWorkLines = useMemo(
    () =>
      workLines.filter(
        (l) => selectedIds[l.lineId] && !l.alreadyStocked && l.quantityBought > 0,
      ),
    [workLines, selectedIds],
  );

  const selectedSpend = useMemo(
    () => selectedWorkLines.reduce((s, l) => s + l.totalPaid, 0),
    [selectedWorkLines],
  );

  const refundPreview = selected
    ? selected.cashDisbursed -
      ((selected.retirement?.actualSpent ?? 0) + selectedSpend)
    : 0;

  const handleExtraPicks = (picks: ExtraStockPick[]) => {
    const additions: WorkLine[] = picks.map((p) => {
      const lineId = `new-${p.stockItemId}-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 5)}`;
      return {
        lineId,
        name: p.name,
        unit: p.unit,
        storeUnit: p.storeUnit,
        quantityOrdered: p.qty,
        stockQuantityOrdered: p.qty,
        quantityBought: p.qty,
        stockQuantityBought: p.qty,
        poPrice: p.unitPrice,
        actualPrice: p.unitPrice,
        actualStockUnitPrice: p.unitPrice,
        totalPaid: p.qty * p.unitPrice,
        notBought: false,
        newlyAdded: true,
        stockItemId: p.stockItemId,
        dept: p.dept,
        alreadyStocked: false,
        remainingCap: null,
      };
    });
    setWorkLines((prev) => [...additions, ...prev]);
    setQtyText((prev) => {
      const next = { ...prev };
      for (const a of additions) next[a.lineId] = formatQtyDisplay(a.quantityBought);
      return next;
    });
    setPriceText((prev) => {
      const next = { ...prev };
      for (const a of additions) next[a.lineId] = formatQtyDisplay(a.actualPrice);
      return next;
    });
    setSelectedIds((prev) => {
      const next = { ...prev };
      for (const a of additions) next[a.lineId] = true;
      return next;
    });
    toast.success(
      `${additions.length} newly added item${additions.length === 1 ? "" : "s"} ready — submit when selected`,
    );
  };

  const submitSelected = () => {
    if (!selected || !canAddStock) return;
    if (!selectedWorkLines.length) {
      toast.error("Select at least one item to add to stock");
      return;
    }
    const payload: RetirementLine[] = selectedWorkLines.map((l) => ({
      lineId: l.lineId,
      name: l.name,
      unit: l.unit,
      storeUnit: l.storeUnit,
      quantityOrdered: l.quantityOrdered,
      stockQuantityOrdered: l.stockQuantityOrdered,
      quantityBought: l.quantityBought,
      stockQuantityBought: l.stockQuantityBought,
      poPrice: l.poPrice,
      actualPrice: l.actualPrice,
      actualStockUnitPrice: l.actualStockUnitPrice,
      totalPaid: l.totalPaid,
      notBought: false,
      newlyAdded: l.newlyAdded,
      stockItemId: l.stockItemId,
      dept: l.dept,
    }));
    const res = submitAddToStock(selected.id, payload, actor);
    if (res && "error" in res) {
      toast.error(res.error);
      return;
    }
    playNotificationBeep();
    if (res && "posted" in res) {
      toast.success(
        res.posted > 0
          ? `${res.posted} item(s) added to Central Store — sent to Retirement review`
          : "Submitted for retirement review",
      );
    }
    setConfirmOpen(false);
    setSelectedId(null);
    setTab("retirement");
  };

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
    canAddStock &&
    selectedId &&
    selected &&
    isAddToStockCandidate(selected.status)
  ) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <Button variant="ghost" className="-ml-2" onClick={() => setSelectedId(null)}>
              ← Back to list
            </Button>
            <h2 className="text-xl font-semibold">
              Add to Store — {selected.poNumber} (
              {formatPoRaisedAt(selected.createdAt)})
            </h2>
            <p className="text-sm text-muted-foreground">
              Select items ready today, adjust qty/price, then submit. Remaining lines can be
              added later — they accumulate on the same Retirement row.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-1.5 shrink-0"
            onClick={() => setExtraOpen(true)}
          >
            <PackagePlus className="h-4 w-4" />
            Add items not on PO
          </Button>
        </div>

        {selected.retirementComment && selected.status === "retirement_rejected" && (
          <PoCommentBanner
            label="Retirement rejected"
            comment={selected.retirementComment}
            variant="reject"
          />
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Cash Disbursed" value={formatNaira(selected.cashDisbursed)} />
          <StatCard
            label="Already stocked spend"
            value={formatNaira(selected.retirement?.actualSpent ?? 0)}
          />
          <StatCard
            label="This selection"
            value={formatNaira(selectedSpend)}
            highlight
          />
          {refundPreview < 0 ? (
            <StatCard
              label="Refund Purchaser"
              value={formatNaira(Math.abs(refundPreview))}
              amountClassName="bg-red-500/15 text-red-800 dark:text-red-200"
            />
          ) : refundPreview > 0 ? (
            <StatCard
              label="Return Excess Cash"
              value={formatNaira(refundPreview)}
              amountClassName="bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
            />
          ) : (
            <StatCard label="Cash even" value={formatNaira(0)} />
          )}
        </div>

        <PaginatedListShell
          items={workLines}
          pageSize={10}
          searchPlaceholder="Search items…"
          searchMatch={(line, query) => {
            const q = query.trim().toLowerCase();
            if (!q) return true;
            return (
              line.name.toLowerCase().includes(q) ||
              (line.unit ?? "").toLowerCase().includes(q) ||
              (DEPT_LABELS[line.dept] ?? line.dept).toLowerCase().includes(q)
            );
          }}
          filters={[
            {
              key: "dept",
              label: "Department",
              options: STORE_DEPT_PICKER_OPTIONS_SORTED.filter((d) =>
                workLines.some((l) => l.dept === d),
              ).map((d) => ({ value: d, label: DEPT_LABELS[d] })),
            },
          ]}
          filterMatch={(line, key, value) => {
            if (key !== "dept") return undefined;
            if (!value || value === "all") return true;
            return line.dept === normalizeSupplyDept(value);
          }}
          emptyMessage="No lines left to add — all original items are already in stock."
        >
          {(pageItems) => (
            <div className="space-y-2">
              {pageItems.map((line) => {
                const checked = Boolean(selectedIds[line.lineId]);
                return (
                  <div
                    key={line.lineId}
                    className={cn(
                      "rounded-lg border p-3 text-sm space-y-2",
                      line.newlyAdded &&
                        "border-emerald-400 bg-emerald-50/70 dark:bg-emerald-950/25",
                      line.alreadyStocked && "opacity-70 bg-muted/30",
                      checked && !line.alreadyStocked && "ring-1 ring-primary/40",
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        {!line.alreadyStocked ? (
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) =>
                              setSelectedIds((m) => ({
                                ...m,
                                [line.lineId]: v === true,
                              }))
                            }
                            className="mt-1"
                          />
                        ) : (
                          <div className="w-4" />
                        )}
                        <div className="min-w-0">
                          <p className="font-medium">{line.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {DEPT_LABELS[line.dept] ?? line.dept}
                            {line.remainingCap != null && !line.alreadyStocked
                              ? ` · remaining ${line.remainingCap} ${line.unit ?? ""}`
                              : ""}
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {line.newlyAdded ? (
                              <Badge className="bg-emerald-600 text-white text-[10px]">
                                Newly added item
                              </Badge>
                            ) : null}
                            {line.alreadyStocked ? (
                              <Badge variant="secondary" className="text-[10px]">
                                Already in stock
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      {!line.alreadyStocked ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => {
                            if (line.newlyAdded) {
                              setWorkLines((prev) =>
                                prev.filter((l) => l.lineId !== line.lineId),
                              )
                              setSelectedIds((m) => {
                                const next = { ...m }
                                delete next[line.lineId]
                                return next
                              })
                            } else {
                              setSelectedIds((m) => ({
                                ...m,
                                [line.lineId]: false,
                              }))
                            }
                          }}
                        >
                          {line.newlyAdded ? "Remove" : "Deselect"}
                        </Button>
                      ) : null}
                    </div>

                    {!line.alreadyStocked && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end pl-6">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-0.5">
                            {line.newlyAdded ? "Qty" : "Ordered"}
                          </p>
                          <p className="tabular-nums">
                            {line.quantityOrdered} {line.unit ?? ""}
                          </p>
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">
                            Add qty
                          </Label>
                          <Input
                            inputMode="decimal"
                            className={QTY_INPUT_CLASS}
                            value={qtyText[line.lineId] ?? ""}
                            onChange={(e) => updateQty(line.lineId, e.target.value)}
                            onFocus={() =>
                              setSelectedIds((m) => ({ ...m, [line.lineId]: true }))
                            }
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">
                            Actual price
                          </Label>
                          <Input
                            inputMode="decimal"
                            className={QTY_INPUT_CLASS}
                            value={priceText[line.lineId] ?? ""}
                            onChange={(e) => updatePrice(line.lineId, e.target.value)}
                            onFocus={() =>
                              setSelectedIds((m) => ({ ...m, [line.lineId]: true }))
                            }
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-0.5">
                            Line total
                          </p>
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

        {selectedWorkLines.length > 0 ? (
          <div className="sticky bottom-3 z-10 rounded-xl border bg-background/95 backdrop-blur p-3 shadow-lg flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-semibold">{selectedWorkLines.length}</span> selected ·{" "}
              {formatNaira(selectedSpend)}
            </p>
            <Button onClick={() => setConfirmOpen(true)}>
              Submit selected items
            </Button>
          </div>
        ) : null}

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Add {selectedWorkLines.length} item(s) to stock?
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    Selected items go into Central Store now and appear under the Retirement tab
                    for review. You can add more lines from this PO later.
                  </p>
                  <ul className="rounded-md border bg-muted/40 px-3 py-2 space-y-1 text-foreground">
                    <li>Approved PO: {formatNaira(getPoApprovedAmount(selected))}</li>
                    <li>This batch: {formatNaira(selectedSpend)}</li>
                  </ul>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={submitSelected}>
                Add to stock
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AddExtraStockItemsModal
          open={extraOpen}
          onOpenChange={setExtraOpen}
          storeItems={storeItems}
          onAdd={handleExtraPicks}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Retirement</h1>
        <p className="text-sm text-muted-foreground">
          Active: add purchased items to Central Store (partial OK). Retirement: review those
          adds. History: completed POs.
        </p>
      </div>

      {!mounted ? (
        <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex h-auto flex-wrap justify-center gap-1 mx-auto w-full max-w-3xl">
            <TabsTrigger value="active">
              Active
              {activeCandidates.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 tabular-nums text-[10px]">
                  {activeCandidates.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="retirement">
              Retirement
              {retirementQueue.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 tabular-nums text-[10px]">
                  {retirementQueue.length}
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
            <section className="space-y-3">
              <div>
                <h2 className="font-medium">Ready to add to stock</h2>
                <p className="text-xs text-muted-foreground">
                  Approved POs — select items as they arrive from market and post them to Central
                  Store without waiting for final retirement.
                </p>
              </div>
              {activeCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center">
                  No POs ready. Complete accountant and manager approvals first.
                </p>
              ) : (
                <PaginatedListShell
                  items={activeCandidates}
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
                  emptyMessage="No POs ready for Add to stock."
                >
                  {(pageItems) => (
                    <div className="space-y-2">
                      {pageItems.map((po) => (
                        <PurchasingRetireRow
                          key={po.id}
                          po={po}
                          canAct={canAddStock}
                          actionLabel="Add to stock"
                          onOpen={() => initAddToStock(po.id)}
                        />
                      ))}
                    </div>
                  )}
                </PaginatedListShell>
              )}
            </section>
          </TabsContent>

          <TabsContent value="retirement" className="mt-4 space-y-4">
            <div>
              <h2 className="font-medium">Retirement review</h2>
              <p className="text-xs text-muted-foreground">
                Review Add-to-stock submissions. Accept moves the PO to History. Stock was already
                updated when items were submitted from Active.
              </p>
            </div>
            {canRetirementReview ? (
              <PoRetirementPanel showAcceptedSection={false} />
            ) : retirementQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center">
                No retirements awaiting review.
              </p>
            ) : (
              <PaginatedListShell
                items={retirementQueue}
                pageSize={8}
                searchPlaceholder="Search PO…"
                searchMatch={(po, query) => {
                  const q = query.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    po.poNumber.toLowerCase().includes(q) ||
                    (po.retirement?.submittedBy ?? "").toLowerCase().includes(q)
                  );
                }}
                emptyMessage="No retirements awaiting review."
              >
                {(pageItems) => (
                  <div className="space-y-2">
                    {pageItems.map((po) => (
                      <PurchasingRetireRow
                        key={po.id}
                        po={po}
                        canAct={canAddStock}
                        actionLabel="Continue Add to stock"
                        onOpen={() => initAddToStock(po.id)}
                      />
                    ))}
                  </div>
                )}
              </PaginatedListShell>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            <div>
              <h2 className="font-medium">History</h2>
              <p className="text-xs text-muted-foreground">
                Completed retirements — final record after review.
              </p>
            </div>
            <PoHistoryPanel
              purchaseOrders={purchaseOrders}
              includeStatuses={["retired"]}
              emptyMessage="No retired purchase orders yet. History appears after Retirement is accepted."
              searchPlaceholder="Search retired PO number, date…"
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
