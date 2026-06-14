"use client";

import { useState } from "react";
import type { PurchaseOrder } from "@/lib/supply-chain/types";
import { formatNaira } from "@/lib/utils/currency";
import {
  formatPoRaisedAt,
  getPoHistoryLines,
  isPurchaseOrderHistoryStatus,
} from "@/lib/supply-chain/po-format";
import { poStatusBadge } from "@/components/supply-chain/po-approval-panel";
import { PaginatedListShell } from "@/components/shared/paginated-list-shell";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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
    includeStatuses
      ? includeStatuses.includes(po.status)
      : isPurchaseOrderHistoryStatus(po.status),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <PaginatedListShell
      items={history}
      pageSize={10}
      searchPlaceholder={
        searchPlaceholderProp ?? "Search PO number, raised date, store…"
      }
      searchMatch={(po, query) => {
        const q = query.trim().toLowerCase();
        return (
          po.poNumber.toLowerCase().includes(q) ||
          po.weekLabel.toLowerCase().includes(q) ||
          po.createdByName.toLowerCase().includes(q) ||
          formatPoRaisedAt(po.createdAt).toLowerCase().includes(q)
        );
      }}
      filters={[
        {
          key: "status",
          label: "Status",
          options: [
            { value: "disbursed", label: "Disbursed" },
            { value: "retirement_pending", label: "Retirement pending" },
            {
              value: "retirement_pending_accountant",
              label: "Retirement review",
            },
            { value: "retired", label: "Retired" },
          ],
        },
      ]}
      emptyMessage={
        emptyMessageProp ??
        "No accepted purchase orders in history yet. POs appear here after manager approval and market purchase."
      }
    >
      {(pagePos) => (
        <div className="space-y-1.5">
          {pagePos.map((po) => {
            const open = expandedId === po.id;
            const { mode, lines } = getPoHistoryLines(po);
            const boughtCount = lines.filter((l) => !l.notBought).length;

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
                        {poStatusBadge(po.status)}
                        <span className="text-sm font-semibold tabular-nums">
                          {formatNaira(
                            po.retirement?.actualSpent ?? po.totalAmount,
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        Raised {formatPoRaisedAt(po.createdAt)} ·{" "}
                        {po.createdByName} · {boughtCount}/{lines.length} lines
                        {mode === "retirement" ? " (retirement)" : ""}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground hidden sm:inline max-w-[140px] truncate">
                    {po.weekLabel}
                  </span>
                </button>
                {open && (
                  <div className="border-t bg-muted/20 px-3 py-2">
                    <p className="text-[10px] text-muted-foreground mb-2">
                      Procurement week: {po.weekLabel}
                      {po.retirement && (
                        <>
                          {" "}
                          · Retired{" "}
                          {new Date(po.retirement.submittedAt).toLocaleString()}
                        </>
                      )}
                    </p>
                    <div className="space-y-1 sm:hidden">
                      {lines.map((line) => (
                        <div
                          key={line.id}
                          className={cn(
                            "rounded border bg-background px-2 py-1.5 text-xs",
                            line.notBought && "opacity-60 line-through",
                          )}
                        >
                          <p className="font-medium">
                            {line.notBought ? "* " : ""}
                            {line.name}
                          </p>
                          <p className="text-muted-foreground tabular-nums">
                            {line.quantity} {line.unit} ·{" "}
                            {formatNaira(line.lineTotal)}
                          </p>
                        </div>
                      ))}
                    </div>
                    <table className="w-full text-xs hidden sm:table">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="pb-1 font-medium">Item</th>
                          <th className="pb-1 font-medium text-right">Qty</th>
                          <th className="pb-1 font-medium text-right">Unit</th>
                          <th className="pb-1 font-medium text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr
                            key={line.id}
                            className={cn(
                              "border-t border-border/50",
                              line.notBought && "opacity-60",
                            )}
                          >
                            <td
                              className={cn(
                                "py-1 pr-2",
                                line.notBought && "line-through",
                              )}
                            >
                              {line.notBought ? "* " : ""}
                              {line.name}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {line.quantity} {line.unit}
                            </td>
                            <td className="py-1 text-right tabular-nums">
                              {formatNaira(line.unitPrice)}
                            </td>
                            <td className="py-1 text-right tabular-nums font-medium">
                              {formatNaira(line.lineTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
