"use client";

import { useMemo, useState } from "react";
import { normalizeSupplyDept, type PurchaseOrder } from "@/lib/supply-chain/types";
import { formatNaira } from "@/lib/utils/currency";
import {
  formatPoRaisedAt,
  getPoApprovedAmount,
  getPoHistoryLines,
  getPoRetiredAmount,
  getPoRetirementDelta,
  isPurchaseOrderHistoryStatus,
  retirementLineChanged,
} from "@/lib/supply-chain/po-format";
import { poStatusBadge } from "@/components/supply-chain/po-approval-panel";
import { PaginatedListShell } from "@/components/shared/paginated-list-shell";
import {
  PoReviewLinesPanel,
  poDepartmentFilterOptions,
} from "@/components/supply-chain/po-review-lines-panel";
import { RetirementLinesReview } from "@/components/supply-chain/retirement-lines-review";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PoHistoryPanel({
  purchaseOrders,
  includeStatuses,
  emptyMessage: emptyMessageProp,
  searchPlaceholder: searchPlaceholderProp,
  forceOrderLines = false,
}: {
  purchaseOrders: PurchaseOrder[];
  /** When set, only these statuses are shown (overrides default store history filter). */
  includeStatuses?: PurchaseOrder["status"][];
  emptyMessage?: string;
  searchPlaceholder?: string;
  /** Central Store History: always the manager-approved PO, never retirement edits. */
  forceOrderLines?: boolean;
}) {
  const history = purchaseOrders.filter((po) =>
    !po.deletedAt &&
    (includeStatuses
      ? includeStatuses.includes(po.status)
      : isPurchaseOrderHistoryStatus(po.status)),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const deptFilterOptions = useMemo(
    () => poDepartmentFilterOptions(history),
    [history],
  );

  const statusOptions = useMemo(() => {
    const present = new Set(history.map((p) => p.status));
    const all = [
      { value: "approved", label: "Approved" },
      { value: "disbursed", label: "Approved — buy at market" },
      { value: "retirement_pending", label: "Retirement pending" },
      {
        value: "retirement_pending_accountant",
        label: "Retirement review",
      },
      { value: "retirement_rejected", label: "Retirement rejected" },
      { value: "retired", label: "Retired" },
      { value: "accountant_rejected", label: "Accountant rejected" },
      { value: "manager_rejected", label: "Manager rejected" },
    ];
    return all.filter((o) => present.has(o.value as PurchaseOrder["status"]));
  }, [history]);

  return (
    <PaginatedListShell
      items={history}
      pageSize={8}
      searchPlaceholder={
        searchPlaceholderProp ?? "Search PO number, raised date, store…"
      }
      searchMatch={(po, query) => {
        const q = query.trim().toLowerCase();
        return (
          po.poNumber.toLowerCase().includes(q) ||
          po.weekLabel.toLowerCase().includes(q) ||
          po.createdByName.toLowerCase().includes(q) ||
          formatPoRaisedAt(po.createdAt).toLowerCase().includes(q) ||
          po.lines.some((l) => l.name.toLowerCase().includes(q))
        );
      }}
      filters={[
        ...(statusOptions.length
          ? [
              {
                key: "status",
                label: "Status",
                options: statusOptions,
              },
            ]
          : []),
        ...(deptFilterOptions.length
          ? [
              {
                key: "dept",
                label: "Department",
                options: deptFilterOptions,
              },
            ]
          : []),
      ]}
      filterMatch={(po, key, value) => {
        if (key === "status") {
          if (!value || value === "all") return true;
          return po.status === value;
        }
        if (key === "dept") {
          if (!value || value === "all") return true;
          const want = normalizeSupplyDept(value);
          return po.lines.some((l) => normalizeSupplyDept(l.dept) === want);
        }
        return undefined;
      }}
      emptyMessage={
        emptyMessageProp ??
        "No purchase orders in history yet. POs appear here after manager approval (read-only). Retired POs also show here after market retirement."
      }
    >
      {(pagePos, ctx) => (
        <div className="space-y-1.5">
          {pagePos.map((po) => {
            const open = expandedId === po.id;
            const { mode, lines } = getPoHistoryLines(po, { forceOrderLines });
            const boughtCount = lines.filter((l) => !l.notBought).length;
            const deptFilter = ctx.activeFilters.dept ?? "all";
            const showRetirement = !forceOrderLines && mode === "retirement";

            return (
              <div key={po.id} className="rounded-md border overflow-hidden">
                <button
                  type="button"
                  className="w-full flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => setExpandedId(open ? null : po.id)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="text-sm font-medium tabular-nums">
                          {po.poNumber}
                        </span>
                        {poStatusBadge(po)}
                        <span className="text-sm font-semibold tabular-nums">
                          {formatNaira(
                            forceOrderLines
                              ? po.totalAmount || po.cashDisbursed
                              : (po.retirement?.actualSpent ?? po.totalAmount),
                          )}
                        </span>
                        {!forceOrderLines && po.retirement ? (
                          <PoVarianceBadge po={po} />
                        ) : null}
                      </div>
                      <p className="text-[13px] text-muted-foreground truncate">
                        Raised {formatPoRaisedAt(po.createdAt)} ·{" "}
                        {po.createdByName} · {boughtCount}/{lines.length} lines
                        {showRetirement ? " (retirement)" : forceOrderLines ? " (approved PO)" : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-[13px] text-muted-foreground hidden sm:inline max-w-[140px] truncate">
                    {po.weekLabel}
                  </span>
                </button>
                {open && (
                  <div className="border-t bg-muted/20 px-3 py-2 space-y-2">
                    <p className="text-[13px] text-muted-foreground">
                      Procurement week: {po.weekLabel}
                      {!forceOrderLines && po.retirement && (
                        <>
                          {" "}
                          · Retired{" "}
                          {new Date(po.retirement.submittedAt).toLocaleString()}
                        </>
                      )}
                    </p>
                    {!forceOrderLines && po.retirement ? (
                      <PoRetirementSummary po={po} />
                    ) : null}
                    {showRetirement && po.retirement?.lines?.length ? (
                      <>
                        <RetirementChangedLines po={po} />
                        <RetirementLinesReview po={po} deptFilter={deptFilter} />
                      </>
                    ) : (
                      <PoReviewLinesPanel
                        lines={po.lines}
                        pageSize={10}
                        showDept
                        compact
                        deptFilter={deptFilter}
                        title={`Order lines (${po.lines.length})`}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PaginatedListShell>
  );
}

function PoVarianceBadge({ po }: { po: PurchaseOrder }) {
  const delta = getPoRetirementDelta(po);
  if (!Number.isFinite(delta) || delta === 0) {
    return (
      <Badge variant="outline" className="text-[10px] h-5">
        Even
      </Badge>
    );
  }
  if (delta > 0) {
    return (
      <Badge className="bg-red-100 text-red-800 text-[10px] h-5">
        Debit {formatNaira(delta)}
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-800 text-[10px] h-5">
      Credit {formatNaira(Math.abs(delta))}
    </Badge>
  );
}

function PoRetirementSummary({ po }: { po: PurchaseOrder }) {
  const approved = getPoApprovedAmount(po);
  const retired = getPoRetiredAmount(po);
  const delta = getPoRetirementDelta(po);
  return (
    <div className="rounded-md border bg-background px-3 py-2 text-sm space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Amount summary
      </p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
        <span>Approved PO: <strong>{formatNaira(approved)}</strong></span>
        <span>Retired: <strong>{formatNaira(retired)}</strong></span>
        <span
          className={cn(
            "font-medium",
            delta > 0 && "text-red-700",
            delta < 0 && "text-emerald-700",
          )}
        >
          Difference:{" "}
          {delta === 0
            ? formatNaira(0)
            : delta > 0
              ? `${formatNaira(delta)} debit`
              : `${formatNaira(Math.abs(delta))} credit`}
        </span>
      </div>
    </div>
  );
}

function RetirementChangedLines({ po }: { po: PurchaseOrder }) {
  const [open, setOpen] = useState(false);
  const changed = (po.retirement?.lines ?? []).filter((line) =>
    retirementLineChanged(po, line),
  );
  if (!changed.length) return null;
  const changedPo = {
    ...po,
    retirement: po.retirement
      ? { ...po.retirement, lines: changed }
      : po.retirement,
  };
  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="font-medium">
          Changed lines ({changed.length})
        </span>
        <span className="text-xs text-muted-foreground">qty or amount vs approved PO</span>
      </button>
      {open ? (
        <div className="border-t px-3 py-2">
          <RetirementLinesReview po={changedPo} />
        </div>
      ) : null}
    </div>
  );
}
