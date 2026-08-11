"use client";

import { useMemo, useState } from "react";
import { normalizeSupplyDept, type PurchaseOrder } from "@/lib/supply-chain/types";
import { formatNaira } from "@/lib/utils/currency";
import {
  formatPoRaisedAt,
  getPoHistoryLines,
  isPurchaseOrderHistoryStatus,
} from "@/lib/supply-chain/po-format";
import { poStatusBadge } from "@/components/supply-chain/po-approval-panel";
import { PaginatedListShell } from "@/components/shared/paginated-list-shell";
import {
  PoReviewLinesPanel,
  poDepartmentFilterOptions,
} from "@/components/supply-chain/po-review-lines-panel";
import { RetirementLinesReview } from "@/components/supply-chain/retirement-lines-review";
import { ChevronDown, ChevronRight } from "lucide-react";

export function PoHistoryPanel({
  purchaseOrders,
  includeStatuses,
  emptyMessage: emptyMessageProp,
  searchPlaceholder: searchPlaceholderProp,
}: {
  purchaseOrders: PurchaseOrder[];
  /** When set, only these statuses are shown (overrides default store history filter). */
  includeStatuses?: PurchaseOrder["status"][];
  emptyMessage?: string;
  searchPlaceholder?: string;
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
      { value: "disbursed", label: "Disbursed" },
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
        "No accepted purchase orders in history yet. POs appear here after manager approval and market purchase."
      }
    >
      {(pagePos, ctx) => (
        <div className="space-y-1.5">
          {pagePos.map((po) => {
            const open = expandedId === po.id;
            const { mode, lines } = getPoHistoryLines(po);
            const boughtCount = lines.filter((l) => !l.notBought).length;
            const deptFilter = ctx.activeFilters.dept ?? "all";

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
                            po.retirement?.actualSpent ?? po.totalAmount,
                          )}
                        </span>
                      </div>
                      <p className="text-[13px] text-muted-foreground truncate">
                        Raised {formatPoRaisedAt(po.createdAt)} ·{" "}
                        {po.createdByName} · {boughtCount}/{lines.length} lines
                        {mode === "retirement" ? " (retirement)" : ""}
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
                      {po.retirement && (
                        <>
                          {" "}
                          · Retired{" "}
                          {new Date(po.retirement.submittedAt).toLocaleString()}
                        </>
                      )}
                    </p>
                    {mode === "retirement" && po.retirement?.lines?.length ? (
                      <RetirementLinesReview po={po} deptFilter={deptFilter} />
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
