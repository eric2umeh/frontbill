"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSupplyChain } from "@/lib/supply-chain/supply-chain-context";
import type { RetirementLine } from "@/lib/supply-chain/types";
import { formatNaira } from "@/lib/utils/currency";
import { canonicalRoleKey } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Info, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PoApprovalPanel } from "@/components/supply-chain/po-approval-panel";
import { PoDetailPanel } from "@/components/supply-chain/po-detail-card";
export function PurchasingWorkspace() {
  const { name, role } = useAuth();
  const searchParams = useSearchParams();
  const poParam = searchParams.get("po");
  const { purchaseOrders, submitRetirement } = useSupplyChain();
  const [selectedId, setSelectedId] = useState<string | null>(poParam);
  const [retireLines, setRetireLines] = useState<RetirementLine[]>([]);

  const retireCandidates = purchaseOrders.filter((p) =>
    ["retirement_pending", "disbursed", "approved"].includes(p.status),
  );
  const selected = purchaseOrders.find((p) => p.id === selectedId);

  const initRetire = (poId: string) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return;
    setSelectedId(poId);
    setRetireLines(
      po.lines.map((l) => ({
        lineId: l.id,
        name: l.name,
        quantityOrdered: l.quantityOrdered,
        quantityBought: l.quantityOrdered,
        poPrice: l.unitPrice,
        actualPrice: l.unitPrice,
        totalPaid: l.quantityOrdered * l.unitPrice,
      })),
    );
  };

  const actualSpent = useMemo(
    () =>
      retireLines
        .filter((l) => !l.removed)
        .reduce((s, l) => s + l.totalPaid, 0),
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

  if (!selectedId || !selected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Purchasing</h1>
          <p className="text-sm text-muted-foreground">
            PO approvals, market purchase, and retirement
          </p>
        </div>

        <PoApprovalPanel />

        <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 p-4 flex gap-3 text-sm">
          <Info className="h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="font-medium">Purchaser — Retirement workflow</p>
            <p className="text-muted-foreground">
              After manager approval and cash disbursement, retire the PO at
              market. Edit actual quantities and prices. Stock is updated in
              central store when retirement is submitted.
            </p>
          </div>
        </div>

        <p className="font-medium">Select a PO to retire:</p>
        <div className="space-y-2">
          {retireCandidates.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No POs ready for market retirement yet — complete accountant and
              manager approvals first.
            </p>
          )}
          {retireCandidates.map((po) => (
            <div
              key={po.id}
              className="flex justify-between items-center rounded-lg border p-4"
            >
              <div>
                <p className="font-medium">{po.weekLabel}</p>
                <p className="text-sm text-muted-foreground">
                  {po.createdByName} · Disbursed:{" "}
                  {formatNaira(po.cashDisbursed)}
                </p>
              </div>
              <Button onClick={() => initRetire(po.id)}>Retire This PO</Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => setSelectedId(null)}>
        ← Change PO
      </Button>
      <h2 className="text-xl font-semibold">Retire — {selected.weekLabel}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Cash Disbursed"
          value={formatNaira(selected.cashDisbursed)}
        />
        <StatCard
          label="Actual Spent"
          value={formatNaira(actualSpent)}
          highlight
        />
        <StatCard label="Refund to Cashier" value={formatNaira(refund)} />
        <StatCard
          label="Price changes"
          value={String(
            retireLines.filter((l) => l.poPrice !== l.actualPrice).length,
          )}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Ordered</TableHead>
            <TableHead className="text-right">Bought</TableHead>
            <TableHead className="text-right">PO Price</TableHead>
            <TableHead className="text-right">Actual Price</TableHead>
            <TableHead className="text-right">Total Paid</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {retireLines
            .filter((l) => !l.removed)
            .map((line) => (
              <TableRow key={line.lineId}>
                <TableCell>
                  {line.name}{" "}
                  <Badge className="ml-1 bg-emerald-100 text-emerald-800 text-[10px]">
                    OK
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {line.quantityOrdered}
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    className="h-8 w-16 ml-auto text-right"
                    value={line.quantityBought}
                    onChange={(e) => {
                      const q = Number(e.target.value);
                      setRetireLines((prev) =>
                        prev.map((l) =>
                          l.lineId === line.lineId
                            ? {
                                ...l,
                                quantityBought: q,
                                totalPaid: q * l.actualPrice,
                              }
                            : l,
                        ),
                      );
                    }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  {formatNaira(line.poPrice)}
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    className="h-8 w-20 ml-auto text-right"
                    value={line.actualPrice}
                    onChange={(e) => {
                      const p = Number(e.target.value);
                      setRetireLines((prev) =>
                        prev.map((l) =>
                          l.lineId === line.lineId
                            ? {
                                ...l,
                                actualPrice: p,
                                totalPaid: l.quantityBought * p,
                              }
                            : l,
                        ),
                      );
                    }}
                  />
                </TableCell>
                <TableCell className="text-right">
                  {formatNaira(line.totalPaid)}
                </TableCell>
                <TableCell>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      setRetireLines((p) =>
                        p.map((l) =>
                          l.lineId === line.lineId
                            ? { ...l, removed: true }
                            : l,
                        ),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
      <Button
        onClick={() => {
          submitRetirement(selected.id, retireLines, actor);
          toast.success("Retirement submitted — central store stock updated");
          setSelectedId(null);
        }}
      >
        Submit Retirement
      </Button>
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
      className={`rounded-xl border p-4 ${highlight ? "ring-2 ring-primary" : ""}`}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold tabular-nums mt-1">{value}</p>
    </div>
  );
}
