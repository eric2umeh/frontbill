"use client";

import type { ReactNode } from "react";
import type { PurchaseOrder } from "@/lib/supply-chain/types";
import { formatNaira } from "@/lib/utils/currency";
import { poStatusBadge } from "@/components/supply-chain/po-approval-panel";
import { formatPoRaisedAt, getPoHistoryLines } from "@/lib/supply-chain/po-format";
import {
  formatPoDecisionStamp,
  formatPoLinesEditStamp,
} from "@/lib/supply-chain/po-active";
import { PoReviewLinesPanel } from "@/components/supply-chain/po-review-lines-panel";
import { RetirementLinesReview } from "@/components/supply-chain/retirement-lines-review";
import { PoCommentBanner } from "@/components/supply-chain/po-comment-banner";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  po: PurchaseOrder;
  expanded?: boolean;
  onToggle?: () => void;
  action?: ReactNode;
  defaultOpen?: boolean;
};

export function PoDetailCard({
  po,
  expanded,
  onToggle,
  action,
  defaultOpen = false,
}: Props) {
  const open = expanded ?? defaultOpen;
  const showManagerComment =
    po.managerComment &&
    po.managerComment.trim() !== (po.accountantComment?.trim() ?? "");
  const historyLines = getPoHistoryLines(po);

  return (
    <div className="rounded-lg border overflow-hidden">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 p-4",
          onToggle && "cursor-pointer hover:bg-muted/40 transition-colors",
        )}
        onClick={onToggle}
        onKeyDown={
          onToggle
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggle();
                }
              }
            : undefined
        }
        role={onToggle ? "button" : undefined}
        tabIndex={onToggle ? 0 : undefined}
      >
        <div className="flex items-start gap-2 min-w-0">
          {onToggle &&
            (open ? (
              <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            ))}
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{po.poNumber}</p>
              {poStatusBadge(po)}
            </div>
            <p className="text-sm text-muted-foreground">
              Raised {formatPoRaisedAt(po.createdAt)} · {po.createdByName} ·{" "}
              {formatNaira(po.totalAmount)}
            </p>
            {formatPoLinesEditStamp(po) ? (
              <p className="text-xs text-sky-800 dark:text-sky-200">
                {formatPoLinesEditStamp(po)}
              </p>
            ) : null}
            {formatPoDecisionStamp(po) ? (
              <p className="text-xs font-medium text-foreground">
                {formatPoDecisionStamp(po)}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">{po.weekLabel}</p>
          </div>
        </div>
        {action && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {action}
          </div>
        )}
      </div>
      {open && (
        <div className="border-t bg-muted/20 px-3 py-2 space-y-2">
          {po.accountantComment && (
            <PoCommentBanner
              label="Accountant comment"
              comment={po.accountantComment}
              variant={
                po.status === "accountant_rejected" ? "reject" : "info"
              }
              compact
            />
          )}
          {showManagerComment && (
            <PoCommentBanner
              label="Manager comment"
              comment={po.managerComment!}
              variant={po.status === "manager_rejected" ? "reject" : "manager"}
              compact
            />
          )}
          {po.retirementComment && (
            <PoCommentBanner
              label="Retirement review"
              comment={po.retirementComment}
              variant="info"
              compact
            />
          )}
          {historyLines.mode === "retirement" && po.retirement?.lines?.length ? (
            <RetirementLinesReview po={po} />
          ) : (
            <PoReviewLinesPanel
              lines={po.lines}
              compact
              showDept
              pageSize={10}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function PoDetailPanel({
  po,
  onBack,
}: {
  po: PurchaseOrder;
  onBack?: () => void;
}) {
  return (
    <div className="space-y-4">
      {onBack && (
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back to list
        </Button>
      )}
      <PoDetailCard po={po} defaultOpen />
    </div>
  );
}
