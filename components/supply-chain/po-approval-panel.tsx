"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useSupplyChain } from "@/lib/supply-chain/supply-chain-context";
import type { PurchaseOrder } from "@/lib/supply-chain/types";
import { formatNaira } from "@/lib/utils/currency";
import {
  canonicalRoleKey,
  canAdminTestApproveSupplyPo,
  canSupplyPoAccountantReview,
  canSupplyPoManagerReview,
} from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PoReviewLinesPanel } from "@/components/supply-chain/po-review-lines-panel";
import { PoCommentBanner } from "@/components/supply-chain/po-comment-banner";
import {
  formatPoRaisedAt,
  resolvePoDisplayStatus,
} from "@/lib/supply-chain/po-format";
import {
  formatPoActorStamp,
  formatPoDecisionStamp,
  formatPoLinesEditStamp,
  listOrdersAwaitingAccountant,
  listOrdersAwaitingManager,
  poOriginOf,
} from "@/lib/supply-chain/po-active";

function poStatusBadge(statusOrPo: PurchaseOrder["status"] | PurchaseOrder) {
  const status =
    typeof statusOrPo === "string"
      ? statusOrPo
      : resolvePoDisplayStatus(statusOrPo);
  const map: Record<
    PurchaseOrder["status"],
    { label: string; className: string }
  > = {
    draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
    pending_store: {
      label: "Awaiting store (kitchen)",
      className: "bg-violet-100 text-violet-900",
    },
    pending_accountant: {
      label: "Accepted — awaiting accountant",
      className: "bg-sky-100 text-sky-900",
    },
    accountant_rejected: {
      label: "Accountant rejected",
      className: "bg-red-100 text-red-800",
    },
    pending_manager: {
      label: "Accepted — awaiting manager",
      className: "bg-blue-100 text-blue-900",
    },
    manager_rejected: {
      label: "Manager rejected",
      className: "bg-red-100 text-red-800",
    },
    disbursed: {
      label: "Approved by manager — buy at market",
      className: "bg-emerald-100 text-emerald-900",
    },
    approved: {
      label: "Approved by manager",
      className: "bg-emerald-100 text-emerald-900",
    },
    retirement_pending: {
      label: "Retirement pending",
      className: "bg-sky-100 text-sky-900",
    },
    retirement_pending_accountant: {
      label: "Retirement — awaiting accountant",
      className: "bg-violet-100 text-violet-900",
    },
    retirement_rejected: {
      label: "Retirement rejected",
      className: "bg-red-100 text-red-800",
    },
    retired: { label: "Retired", className: "bg-muted text-muted-foreground" },
  };
  const s = map[status];
  return <Badge className={s.className}>{s.label}</Badge>;
}

function PoDecisionCard({
  po,
  stage,
  onDecide,
  testingAdmin,
  canEditLines,
  onLineQtyChange,
  onLineDelete,
}: {
  po: PurchaseOrder;
  stage: "accountant" | "manager" | "admin_test";
  onDecide: (approved: boolean, comment: string) => void;
  testingAdmin?: boolean;
  canEditLines?: boolean;
  onLineQtyChange?: (stockItemId: string, qty: number) => void;
  onLineDelete?: (stockItemId: string) => void;
}) {
  const [comment, setComment] = useState("");

  const title =
    stage === "admin_test"
      ? "Admin — accept or reject with comment (one step to market)"
      : stage === "accountant"
        ? "Accountant review — accept forwards to manager; reject returns to store"
        : "Manager review — accept releases for market; reject returns to store";

  const editable = Boolean(canEditLines && onLineQtyChange);

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium flex flex-wrap items-center gap-2">
            {po.poNumber}
            {poOriginOf(po) === "kitchen" ? (
              <Badge
                variant="outline"
                className="text-xs bg-violet-50 text-violet-800 border-violet-200"
              >
                Kitchen order
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Store order
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {po.weekLabel} · {formatNaira(po.totalAmount)}
          </p>
          <p className="text-[13px] text-muted-foreground">{formatPoActorStamp(po)}</p>
          {formatPoLinesEditStamp(po) ? (
            <p className="text-[13px] text-sky-800 dark:text-sky-200 font-medium">
              {formatPoLinesEditStamp(po)}
            </p>
          ) : null}
          {po.lineEdits && po.lineEdits.length > 0 ? (
            <details className="text-[12px] text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                Recent line edits ({Math.min(po.lineEdits.length, 8)})
              </summary>
              <ul className="mt-1.5 space-y-1 border-l-2 border-sky-200 pl-2.5">
                {po.lineEdits.slice(0, 8).map((e, i) => (
                  <li key={`${e.at}-${e.stockItemId}-${i}`}>
                    <span className="font-medium text-foreground">{e.by}</span>
                    {e.role ? ` (${e.role})` : ""} · {e.action}{" "}
                    <span className="text-foreground">{e.name}</span>
                    {e.detail ? ` — ${e.detail}` : ""} ·{" "}
                    {new Date(e.at).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {formatPoDecisionStamp(po) ? (
            <p className="text-[13px] font-medium text-foreground">
              {formatPoDecisionStamp(po)}
            </p>
          ) : null}
          <p className="text-[13px] text-muted-foreground">
            Created {formatPoRaisedAt(po.createdAt)}
            {po.sentToAccountantAt
              ? ` · Sent to accountant ${formatPoRaisedAt(po.sentToAccountantAt)}`
              : ""}
          </p>
          {editable ? (
            <p className="text-[13px] text-muted-foreground mt-1">
              Edit or delete lines below. To add items, open{" "}
              <Link href="/supply/purchase-orders?tab=orders" className="underline text-primary">
                Store → Purchase orders
              </Link>
              .
            </p>
          ) : null}
          {po.accountantComment && stage === "manager" && (
            <div className="mt-2 w-full">
              <PoCommentBanner
                label="Accountant comment"
                comment={po.accountantComment}
                variant="info"
                compact
              />
            </div>
          )}
        </div>
        {poStatusBadge(po)}
      </div>
      {testingAdmin && (
        <Badge
          variant="outline"
          className="text-xs bg-sky-50 text-sky-900 border-sky-200"
        >
          Testing — admin fast-track (skips separate accountant/manager logins)
        </Badge>
      )}
      <p className="text-[13px] font-medium text-muted-foreground">{title}</p>
      {po.lines.length > 0 && (
        <div className="rounded-md border bg-muted/20 p-3">
          <PoReviewLinesPanel
            lines={po.lines}
            editable={editable}
            onQtyChange={editable ? onLineQtyChange : undefined}
            onDelete={editable ? onLineDelete : undefined}
            pageSize={10}
          />
        </div>
      )}
      <Textarea
        placeholder="Comment required for accept or reject…"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!comment.trim()}
          onClick={() => {
            onDecide(true, comment.trim());
            setComment("");
          }}
        >
          {stage === "admin_test"
            ? "Accept PO (release for market)"
            : stage === "accountant"
              ? "Accept & forward to manager"
              : "Approve for market"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={!comment.trim()}
          onClick={() => {
            onDecide(false, comment.trim());
            setComment("");
          }}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}

export function PoApprovalPanel({ compact }: { compact?: boolean }) {
  const { name, role } = useAuth();
  const {
    purchaseOrders,
    accountantDecision,
    managerDecision,
    adminTestPoDecision,
    mutatePurchaseOrderLine,
  } = useSupplyChain();
  const actor = {
    name: name ?? "Staff",
    role: canonicalRoleKey(role) ?? "staff",
  };

  const pendingAccountant = listOrdersAwaitingAccountant(purchaseOrders);
  const pendingManager = listOrdersAwaitingManager(purchaseOrders);
  const canAccountant = canSupplyPoAccountantReview(role);
  const canManager = canSupplyPoManagerReview(role);
  const adminTester = canAdminTestApproveSupplyPo(role);

  const handleLineQty = (poId: string, stockItemId: string, qty: number) => {
    const err = mutatePurchaseOrderLine?.(poId, stockItemId, qty, undefined, actor);
    if (err) toast.error(err);
  };
  const handleLineDelete = (poId: string, stockItemId: string) => {
    const err = mutatePurchaseOrderLine?.(poId, stockItemId, 0, undefined, actor);
    if (err) toast.error(err);
    else toast.success("Line removed");
  };

  if (
    !pendingAccountant.length &&
    !pendingManager.length
  ) {
    if (compact) return null;
    return (
      <p className="text-sm text-muted-foreground">
        No purchase orders awaiting approval.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {pendingAccountant.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">
            Raised POs — awaiting review ({pendingAccountant.length})
          </p>
          {pendingAccountant.map((po) =>
            adminTester ? (
              <PoDecisionCard
                key={po.id}
                po={po}
                stage="admin_test"
                testingAdmin
                canEditLines
                onLineQtyChange={(id, qty) => handleLineQty(po.id, id, qty)}
                onLineDelete={(id) => handleLineDelete(po.id, id)}
                onDecide={(approved, comment) => {
                  adminTestPoDecision(po.id, approved, comment, actor);
                  toast.success(
                    approved
                      ? "PO accepted — released for market purchase (admin test)"
                      : "PO rejected — returned to store (admin test)",
                  );
                }}
              />
            ) : canAccountant ? (
              <PoDecisionCard
                key={po.id}
                po={po}
                stage={canManager ? "manager" : "accountant"}
                canEditLines
                onLineQtyChange={(id, qty) => handleLineQty(po.id, id, qty)}
                onLineDelete={(id) => handleLineDelete(po.id, id)}
                onDecide={(approved, comment) => {
                  accountantDecision(po.id, approved, comment, actor);
                  toast.success(
                    approved
                      ? canManager
                        ? "Approved — released for market (Purchase Orders → History)"
                        : "Forwarded to manager for approval"
                      : "PO rejected — returned to store for editing",
                  );
                }}
              />
            ) : (
              <div key={po.id} className="rounded-lg border p-3 space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <div>
                    <p className="font-medium text-sm">{po.poNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      Waiting for accountant review
                    </p>
                  </div>
                  {poStatusBadge(po)}
                </div>
                {po.lines.length > 0 && (
                  <PoReviewLinesPanel lines={po.lines} pageSize={10} />
                )}
              </div>
            ),
          )}
        </div>
      )}

      {pendingManager.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-semibold">
            Manager queue ({pendingManager.length})
          </p>
          {pendingManager.map((po) =>
            adminTester ? (
              <PoDecisionCard
                key={po.id}
                po={po}
                stage="admin_test"
                testingAdmin
                onDecide={(approved, comment) => {
                  adminTestPoDecision(po.id, approved, comment, actor);
                  toast.success(
                    approved
                      ? "PO accepted — released for market purchase (admin test)"
                      : "PO rejected (admin test)",
                  );
                }}
              />
            ) : canManager ? (
              <PoDecisionCard
                key={po.id}
                po={po}
                stage="manager"
                onDecide={(approved, comment) => {
                  managerDecision(po.id, approved, comment, actor);
                  toast.success(
                    approved
                      ? "Approved — cash released for market purchase"
                      : "PO rejected by manager",
                  );
                }}
              />
            ) : (
              <div
                key={po.id}
                className="rounded-lg border p-3 flex justify-between items-center gap-2"
              >
                <div>
                  <p className="font-medium text-sm">{po.poNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    Waiting for manager review
                  </p>
                </div>
                {poStatusBadge(po)}
              </div>
            ),
          )}
        </div>
      )}

      {!canAccountant && !canManager && !adminTester && (
        <p className="text-xs text-muted-foreground">
          You can view pending POs here. Approvals are handled by users with
          accountant or manager permissions — open{" "}
          <Link href="/supply/purchasing" className="underline font-medium">
            Retirement
          </Link>{" "}
          when assigned.
        </p>
      )}
    </div>
  );
}

export { poStatusBadge };
