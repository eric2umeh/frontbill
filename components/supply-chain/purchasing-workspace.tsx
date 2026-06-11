"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSupplyChain } from "@/lib/supply-chain/supply-chain-context";
import type { PurchaseOrder, RetirementLine } from "@/lib/supply-chain/types";
import { formatNaira } from "@/lib/utils/currency";
import { canonicalRoleKey } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info } from "lucide-react";
import { toast } from "sonner";
import {
  PoApprovalPanel,
  poStatusBadge,
} from "@/components/supply-chain/po-approval-panel";
import { PoDetailPanel } from "@/components/supply-chain/po-detail-card";
import { PoCommentBanner } from "@/components/supply-chain/po-comment-banner";
import { PoHistoryPanel } from "@/components/supply-chain/po-history-panel";
import {
  formatPoRaisedAt,
  isPurchasingRetireCandidate,
  isPurchasingRetirementInReview,
} from "@/lib/supply-chain/po-format";
import { useClientMounted } from "@/hooks/use-client-mounted";

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
  const [tab, setTab] = useState("active");

  const retireCandidates = useMemo(
    () => purchaseOrders.filter((p) => isPurchasingRetireCandidate(p.status)),
    [purchaseOrders],
  );

  const inReview = useMemo(
    () => purchaseOrders.filter((p) => isPurchasingRetirementInReview(p.status)),
    [purchaseOrders],
  );

  const retiredCount = useMemo(
    () => purchaseOrders.filter((p) => p.status === "retired").length,
    [purchaseOrders],
  );

  const selected = purchaseOrders.find((p) => p.id === selectedId);

  const initRetire = (poId: string) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    setSelectedId(poId);
    if (po.retirement?.lines?.length && po.status === "retirement_rejected") {
      setRetireLines(po.retirement.lines.map((l) => ({ ...l })));
      return;
    }
    setRetireLines(
      po.lines.map((l) => ({
        lineId: l.id,
        name: l.name,
        quantityOrdered: l.quantityOrdered,
        quantityBought: l.quantityOrdered,
        poPrice: l.unitPrice,
        actualPrice: l.unitPrice,
        totalPaid: l.quantityOrdered * l.unitPrice,
        notBought: false,
      })),
    );
  };

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
        <PoApprovalPanel compact />
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
                      <p className="tabular-nums">{line.quantityOrdered}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Bought qty</p>
                      <Input
                        type="number"
                        className="h-8"
                        value={line.quantityBought}
                        onChange={(e) => {
                          const q = Number(e.target.value);
                          setRetireLines((prev) =>
                            prev.map((l) =>
                              l.lineId === line.lineId
                                ? { ...l, quantityBought: q, totalPaid: q * l.actualPrice }
                                : l,
                            ),
                          );
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-0.5">Actual price</p>
                      <Input
                        type="number"
                        className="h-8"
                        value={line.actualPrice}
                        onChange={(e) => {
                          const p = Number(e.target.value);
                          setRetireLines((prev) =>
                            prev.map((l) =>
                              l.lineId === line.lineId
                                ? { ...l, actualPrice: p, totalPaid: l.quantityBought * p }
                                : l,
                            ),
                          );
                        }}
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
            toast.success("Retirement submitted — awaiting accountant review");
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

      <PoApprovalPanel />

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

            {inReview.length > 0 && (
              <section className="space-y-3">
                <div>
                  <h2 className="font-medium">Awaiting accountant review</h2>
                  <p className="text-xs text-muted-foreground">
                    Retirement submitted — stock updates when the accountant accepts.
                  </p>
                </div>
                <PoHistoryPanel
                  purchaseOrders={inReview}
                  includeStatuses={["retirement_pending_accountant"]}
                  emptyMessage="No retirements awaiting review."
                  searchPlaceholder="Search submitted retirement…"
                />
              </section>
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-4 space-y-3">
            <div>
              <h2 className="font-medium">Retired purchase orders</h2>
              <p className="text-xs text-muted-foreground">
                Completed retirements — click a row to see what was bought, edited, or not purchased.
              </p>
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
