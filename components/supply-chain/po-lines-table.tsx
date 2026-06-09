"use client";

import type { BasketLine, PoLine } from "@/lib/supply-chain/types";
import { DEPT_LABELS } from "@/lib/supply-chain/types";
import { formatNaira } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BasketRow = {
  kind: "basket";
  line: BasketLine;
};

type PoRow = {
  kind: "po";
  line: PoLine;
};

type Props = {
  rows: BasketRow[] | PoRow[];
  showDept?: boolean;
};

export function PoLinesTable({ rows, showDept = true }: Props) {
  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No line items.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          {showDept && <TableHead>Dept</TableHead>}
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Unit price</TableHead>
          <TableHead className="text-right">Line total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          if (row.kind === "basket") {
            const l = row.line;
            return (
              <TableRow key={l.stockItemId}>
                <TableCell className="font-medium">
                  {l.name}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({l.unit})
                  </span>
                </TableCell>
                {showDept && (
                  <TableCell>
                    <Badge variant="outline">{DEPT_LABELS[l.dept]}</Badge>
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {l.qtyToBuy} {l.unit}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNaira(l.unitPrice)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatNaira(l.qtyToBuy * l.unitPrice)}
                </TableCell>
              </TableRow>
            );
          }
          const l = row.line;
          return (
            <TableRow key={l.id}>
              <TableCell className="font-medium">
                {l.name}{" "}
                <span className="text-muted-foreground font-normal">
                  ({l.unit})
                </span>
              </TableCell>
              {showDept && (
                <TableCell>
                  <Badge variant="outline">{DEPT_LABELS[l.dept]}</Badge>
                </TableCell>
              )}
              <TableCell className="text-right tabular-nums">
                {l.quantityOrdered} {l.unit}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNaira(l.unitPrice)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatNaira(l.lineTotal)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
