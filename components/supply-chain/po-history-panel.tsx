"use client";

import { useState } from "react";
import type { PurchaseOrder } from "@/lib/supply-chain/types";
import { formatNaira } from "@/lib/utils/currency";
import { isPurchaseOrderHistoryStatus } from "@/lib/supply-chain/po-format";
import { poStatusBadge } from "@/components/supply-chain/po-approval-panel";
import { PaginatedListShell } from "@/components/shared/paginated-list-shell";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PoHistoryPanel({
  purchaseOrders,
}: {
  purchaseOrders: PurchaseOrder[];
}) {
  const history = purchaseOrders.filter((po) =>
    isPurchaseOrderHistoryStatus(po.status),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <PaginatedListShell
      items={history}
      pageSize={10}
      searchPlaceholder="Search PO number, week…"
      searchMatch={(po, query) => {
        const q = query.trim().toLowerCase();
        return (
          po.poNumber.toLowerCase().includes(q) ||
          po.weekLabel.toLowerCase().includes(q) ||
          po.createdByName.toLowerCase().includes(q)
        );
      }}
      emptyMessage="No accepted purchase orders in history yet. POs appear here after manager approval and market purchase."
    >
      {(pagePos) => (
        <div className="space-y-2">
          {pagePos.map((po) => {
            const open = expandedId === po.id;
            return (
              <div key={po.id} className="rounded-lg border overflow-hidden">
                <button
                  type="button"
                  className="w-full flex flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-muted/40 transition-colors"
                  onClick={() => setExpandedId(open ? null : po.id)}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    {open ? (
                      <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{po.poNumber}</p>
                        {poStatusBadge(po.status)}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {po.weekLabel} · {po.createdByName} ·{" "}
                        {formatNaira(po.totalAmount)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {po.lines.length} line{po.lines.length === 1 ? "" : "s"}
                  </span>
                </button>
                {open && (
                  <div className="border-t bg-muted/20 px-4 py-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground text-xs">
                          <th className="pb-2 font-medium">Item</th>
                          <th className="pb-2 font-medium text-right">Qty</th>
                          <th className="pb-2 font-medium text-right">Unit</th>
                          <th className="pb-2 font-medium text-right">
                            Line total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {po.lines.map((line) => (
                          <tr
                            key={line.id}
                            className={cn("border-t border-border/50")}
                          >
                            <td className="py-2 pr-2">{line.name}</td>
                            <td className="py-2 text-right tabular-nums">
                              {line.quantityOrdered} {line.unit}
                            </td>
                            <td className="py-2 text-right tabular-nums">
                              {formatNaira(line.unitPrice)}
                            </td>
                            <td className="py-2 text-right tabular-nums font-medium">
                              {formatNaira(line.lineTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {po.retirement && (
                      <p className="text-xs text-muted-foreground mt-3">
                        Retired{" "}
                        {new Date(po.retirement.submittedAt).toLocaleString()} —
                        actual spend {formatNaira(po.retirement.actualSpent)}
                      </p>
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
