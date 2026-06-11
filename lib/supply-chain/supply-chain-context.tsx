"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  MOCK_BATCHES,
  MOCK_BAR_STOCK,
  MOCK_FNB_MENU,
  MOCK_KITCHEN_RAW_STOCK,
  MOCK_KITCHEN_STOCK,
  MOCK_POS,
  MOCK_RECIPES,
  MOCK_STORE_ITEMS,
} from "./mock-data";
import {
  calcVat,
  recipeCostPerPortion,
  recipeGrossMarginPct,
  recipeTotalCost,
} from "./calculations";
import type {
  ActivityAction,
  ActivityEntry,
  BasketLine,
  CreateKitchenBatchInput,
  FnbOrder,
  IssueOutRecord,
  KitchenRawStockItem,
  KitchenStockItem,
  ProductionBatch,
  PurchaseOrder,
  RawKitchenIssueInput,
  Recipe,
  RetirementLine,
  StoreItem,
  BarStockItem,
} from "./types";
import type { OutletDepartmentKey } from "@/lib/outlets/departments";
import { isStoreControlledFnbOutlet } from "@/lib/outlets/departments";
import type { OutletMenuItemRow } from "@/lib/outlets/types";
import { outletStockSlug } from "@/lib/outlets/outlet-stock-slug";
import {
  effectiveStockSource,
  maxSellableQty,
  resolveOutletItemStock,
} from "@/lib/outlets/outlet-supply-stock";
import {
  formatPurchaseOrderNumber,
  formatPurchaseWeekLabel,
} from "./po-format";
import {
  basketLineToPoLine,
  canEditStorePurchaseOrder,
  getActivePurchaseOrder,
  isPurchaseOrderAwaitingAccountant,
  poLinesToBasketLines,
  recalcPoTotals,
  showsStoreDraftPurchaseList,
  storeItemToPoLine,
} from "./po-active";
import { pushSupplyNotification } from "./supply-notifications";
import { clearKitchenBatchDraft } from "./kitchen-batch-draft";

function notifyKitchenRawStockChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("frontbill:kitchen-raw-stock"));
  }
}

type Actor = { name: string; role: string };

function uid(p: string) {
  return `${p}-${Date.now().toString(36)}`;
}

function log(
  entries: ActivityEntry[],
  action: ActivityAction,
  actor: Actor,
  summary: string,
  entityId?: string,
): ActivityEntry[] {
  return [
    {
      id: uid("act"),
      action,
      actorName: actor.name,
      actorRole: actor.role,
      timestamp: new Date().toISOString(),
      summary,
      entityId,
    },
    ...entries,
  ];
}

const KITCHEN_STOCK_STORAGE_KEY = "frontbill_kitchen_stock";
const BAR_STOCK_STORAGE_KEY = "frontbill_bar_stock";
const STORE_ITEMS_STORAGE_KEY = "frontbill_store_items";
const RECIPES_STORAGE_KEY = "frontbill_recipes";
const BATCHES_STORAGE_KEY = "frontbill_batches";
const KITCHEN_RAW_STOCK_STORAGE_KEY = "frontbill_kitchen_raw_stock";
const ISSUE_OUT_LOG_STORAGE_KEY = "frontbill_issue_out_log";
const BASKET_STORAGE_KEY = "frontbill_supply_basket";
const PURCHASE_ORDERS_STORAGE_KEY = "frontbill_supply_purchase_orders";

function loadPersistedStock<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return [...fallback];
  try {
    const raw =
      window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    if (!raw) return [...fallback];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [...fallback];
  } catch {
    return [...fallback];
  }
}

function persistStock(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    const json = JSON.stringify(value);
    window.localStorage.setItem(key, json);
    window.sessionStorage.setItem(key, json);
  } catch {
    /* ignore */
  }
}

const EMPTY_BASKET: BasketLine[] = [];
const EMPTY_ISSUE_OUT_LOG: IssueOutRecord[] = [];

/** SSR-safe: start with fallback, then hydrate from storage after mount. */
function usePersistedArrayState<T>(
  key: string,
  fallback: T[],
): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const [state, setState] = useState<T[]>(() => [...fallbackRef.current]);
  const storageReadyRef = useRef(false);

  useEffect(() => {
    setState(loadPersistedStock(key, fallbackRef.current));
    storageReadyRef.current = true;
  }, [key]);

  useEffect(() => {
    if (!storageReadyRef.current) return;
    persistStock(key, state);
  }, [key, state]);

  return [state, setState];
}

function upsertKitchenStockRow(
  prev: KitchenStockItem[],
  stockId: string,
  itemName: string,
  qty: number,
): KitchenStockItem[] {
  const idx = prev.findIndex((k) => k.id === stockId);
  if (idx >= 0) {
    return prev.map((k) =>
      k.id === stockId ? { ...k, availablePortions: qty } : k,
    );
  }
  return [
    ...prev,
    {
      id: stockId,
      name: itemName,
      source: "issued_raw",
      availablePortions: qty,
      reorderLevel: Math.max(2, Math.ceil(qty * 0.2)),
    },
  ];
}

function upsertBarStockRow(
  prev: BarStockItem[],
  stockId: string,
  row: BarStockItem,
  qty: number,
): BarStockItem[] {
  const idx = prev.findIndex((b) => b.id === stockId);
  if (idx >= 0) {
    return prev.map((b) =>
      b.id === stockId ? { ...b, quantityOnHand: qty } : b,
    );
  }
  return [...prev, { ...row, quantityOnHand: qty }];
}

const SupplyChainContext = createContext<ReturnType<
  typeof useSupplyChainImpl
> | null>(null);

export { SupplyChainContext };

function useSupplyChainImpl() {
  const [storeItems, setStoreItems] = usePersistedArrayState<StoreItem>(
    STORE_ITEMS_STORAGE_KEY,
    MOCK_STORE_ITEMS,
  );
  const [basket, setBasket] = usePersistedArrayState<BasketLine>(
    BASKET_STORAGE_KEY,
    EMPTY_BASKET,
  );
  const [purchaseOrders, setPurchaseOrders] = usePersistedArrayState<PurchaseOrder>(
    PURCHASE_ORDERS_STORAGE_KEY,
    MOCK_POS,
  );
  const [recipes, setRecipes] = usePersistedArrayState<Recipe>(
    RECIPES_STORAGE_KEY,
    MOCK_RECIPES,
  );
  const [kitchenStock, setKitchenStock] = usePersistedArrayState<KitchenStockItem>(
    KITCHEN_STOCK_STORAGE_KEY,
    MOCK_KITCHEN_STOCK,
  );
  const [barStock, setBarStock] = usePersistedArrayState<BarStockItem>(
    BAR_STOCK_STORAGE_KEY,
    MOCK_BAR_STOCK,
  );
  const [kitchenRawStock, setKitchenRawStock] = usePersistedArrayState<KitchenRawStockItem>(
    KITCHEN_RAW_STOCK_STORAGE_KEY,
    MOCK_KITCHEN_RAW_STOCK,
  );
  const [issueOutLog, setIssueOutLog] = usePersistedArrayState<IssueOutRecord>(
    ISSUE_OUT_LOG_STORAGE_KEY,
    EMPTY_ISSUE_OUT_LOG,
  );
  const [batches, setBatches] = usePersistedArrayState<ProductionBatch>(
    BATCHES_STORAGE_KEY,
    MOCK_BATCHES,
  );
  const [fnbOrders, setFnbOrders] = useState<FnbMenuItem[]>(() => [
    ...MOCK_FNB_MENU,
  ]);
  const [orders, setOrders] = useState<FnbOrder[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([
    {
      id: "act-seed",
      action: "low_stock_alert",
      actorName: "System",
      actorRole: "system",
      timestamp: new Date().toISOString(),
      summary: "Chapman — 86 OUT (bar stock depleted from sales)",
    },
  ]);

  useEffect(() => {
    const reloadFromStorage = () => {
      const orders = loadPersistedStock(PURCHASE_ORDERS_STORAGE_KEY, MOCK_POS);
      setPurchaseOrders(orders);
      const active = getActivePurchaseOrder(orders);
      if (active?.lines.length) {
        setBasket(poLinesToBasketLines(active.lines));
      } else {
        setBasket(loadPersistedStock(BASKET_STORAGE_KEY, []));
      }
    };
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === PURCHASE_ORDERS_STORAGE_KEY ||
        e.key === BASKET_STORAGE_KEY
      ) {
        reloadFromStorage();
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", reloadFromStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", reloadFromStorage);
    };
  }, []);

  const activePurchaseOrder = useMemo(
    () => getActivePurchaseOrder(purchaseOrders),
    [purchaseOrders],
  );

  const basketMigratedRef = useRef(false);

  useEffect(() => {
    if (
      activePurchaseOrder?.lines.length &&
      showsStoreDraftPurchaseList(activePurchaseOrder)
    ) {
      setBasket(poLinesToBasketLines(activePurchaseOrder.lines));
    } else if (activePurchaseOrder && !showsStoreDraftPurchaseList(activePurchaseOrder)) {
      setBasket([]);
    }
  }, [activePurchaseOrder]);

  useEffect(() => {
    if (basketMigratedRef.current || activePurchaseOrder) return;
    if (!basket.length) return;
    basketMigratedRef.current = true;
    const { total, lines } = recalcPoTotals(
      basket.map((b) => basketLineToPoLine(b)),
    );
    const now = new Date();
    const po: PurchaseOrder = {
      id: uid("po"),
      poNumber: formatPurchaseOrderNumber(now),
      weekLabel: formatPurchaseWeekLabel(now),
      status: "draft",
      createdBy: "Store",
      createdByName: "Store",
      createdAt: now.toISOString(),
      cashDisbursed: total,
      totalAmount: total,
      lines,
    };
    setPurchaseOrders((prev) =>
      getActivePurchaseOrder(prev) ? prev : [po, ...prev],
    );
  }, [activePurchaseOrder, basket]);

  const upsertActivePoLine = useCallback(
    (
      item: StoreItem,
      qty: number,
      unitPrice: number,
      actor: Actor,
    ): string | undefined => {
      let err: string | undefined;
      setPurchaseOrders((prev) => {
        const active = getActivePurchaseOrder(prev);
        if (active && !canEditStorePurchaseOrder(active)) {
          err =
            "Cannot add items — a purchase order is already with the accountant or in approval.";
          return prev;
        }

        if (!Number.isFinite(qty) || qty <= 0) {
          if (!active) {
            setBasket((b) => b.filter((x) => x.stockItemId !== item.id));
            return prev;
          }
          const nextLines = active.lines.filter(
            (l) => l.stockItemId !== item.id,
          );
          const { total, lines } = recalcPoTotals(nextLines);
          setBasket(poLinesToBasketLines(lines));
          return prev.map((p) =>
            p.id === active.id
              ? { ...p, lines, totalAmount: total, cashDisbursed: total }
              : p,
          );
        }

        if (!active) {
          const line = storeItemToPoLine(item, qty, unitPrice);
          const { total, lines } = recalcPoTotals([line]);
          const now = new Date();
          const po: PurchaseOrder = {
            id: uid("po"),
            poNumber: formatPurchaseOrderNumber(now),
            weekLabel: formatPurchaseWeekLabel(now),
            status: "draft",
            createdBy: actor.name,
            createdByName: actor.name,
            createdAt: now.toISOString(),
            cashDisbursed: total,
            totalAmount: total,
            lines,
          };
          setBasket(poLinesToBasketLines(lines));
          return [po, ...prev];
        }

        const existing = active.lines.find((l) => l.stockItemId === item.id);
        const nextLines = existing
          ? active.lines.map((l) =>
              l.stockItemId === item.id
                ? storeItemToPoLine(item, qty, unitPrice, l.id)
                : l,
            )
          : [...active.lines, storeItemToPoLine(item, qty, unitPrice)];
        const { total, lines } = recalcPoTotals(nextLines);
        setBasket(poLinesToBasketLines(lines));
        return prev.map((p) =>
          p.id === active.id
            ? { ...p, lines, totalAmount: total, cashDisbursed: total }
            : p,
        );
      });
      return err;
    },
    [],
  );

  const addToBasket = useCallback(
    (item: StoreItem, qty: number, unitPrice: number, actor?: Actor) => {
      if (qty <= 0) return;
      upsertActivePoLine(
        item,
        qty,
        unitPrice,
        actor ?? { name: "Store", role: "store" },
      );
    },
    [upsertActivePoLine],
  );

  const clearBasket = useCallback(() => {
    setPurchaseOrders((prev) => {
      const active = getActivePurchaseOrder(prev);
      if (!active || !canEditStorePurchaseOrder(active)) return prev;
      setBasket([]);
      return prev.map((p) =>
        p.id === active.id
          ? { ...p, lines: [], totalAmount: 0, cashDisbursed: 0 }
          : p,
      );
    });
    setBasket([]);
  }, []);

  const setBasketLineQty = useCallback(
    (item: StoreItem, qty: number, unitPrice: number, actor?: Actor) => {
      return upsertActivePoLine(
        item,
        qty,
        unitPrice,
        actor ?? { name: "Store", role: "store" },
      );
    },
    [upsertActivePoLine],
  );

  const removeFromBasket = useCallback((stockItemId: string) => {
    setPurchaseOrders((prev) => {
      const active = getActivePurchaseOrder(prev);
      if (!active || !canEditStorePurchaseOrder(active)) return prev;
      const nextLines = active.lines.filter((l) => l.stockItemId !== stockItemId);
      const { total, lines } = recalcPoTotals(nextLines);
      setBasket(poLinesToBasketLines(lines));
      return prev.map((p) =>
        p.id === active.id
          ? { ...p, lines, totalAmount: total, cashDisbursed: total }
          : p,
      );
    });
  }, []);

  const sendBasketForApproval = useCallback(
    (actor: Actor): { po: PurchaseOrder } | { error: string } => {
      const active = getActivePurchaseOrder(purchaseOrders);
      const lines = active?.lines ?? basket;
      if (!lines.length) {
        return { error: "Add items to the draft purchase list first" };
      }

      if (active && isPurchaseOrderAwaitingAccountant(active)) {
        return {
          error: "Cannot send again — the accountant is reviewing this PO.",
        };
      }

      if (active && !canEditStorePurchaseOrder(active)) {
        return {
          error: "This purchase order cannot be edited or resent in its current status.",
        };
      }

      const poLines = active
        ? active.lines
        : (lines as BasketLine[]).map((b) => basketLineToPoLine(b));
      const { total, lines: recalcLines } = recalcPoTotals(poLines);
      const now = new Date();
      const submitted: PurchaseOrder = active
        ? {
            ...active,
            status: "pending_accountant",
            lines: recalcLines,
            totalAmount: total,
            cashDisbursed: total,
            accountantComment: undefined,
          }
        : {
            id: uid("po"),
            poNumber: formatPurchaseOrderNumber(now),
            weekLabel: formatPurchaseWeekLabel(now),
            status: "pending_accountant",
            createdBy: actor.name,
            createdByName: actor.name,
            createdAt: now.toISOString(),
            cashDisbursed: total,
            totalAmount: total,
            lines: recalcLines,
          };

      setPurchaseOrders((prev) => {
        if (active) {
          return prev.map((p) => (p.id === active.id ? submitted : p));
        }
        return [submitted, ...prev];
      });
      setBasket(poLinesToBasketLines(recalcLines));
      setActivityLog((a) =>
        log(
          a,
          "po_submitted",
          actor,
          `Sent ${submitted.poNumber} — ₦${total.toLocaleString()} to accountant for approval`,
          submitted.id,
        ),
      );
      pushSupplyNotification({
        audience: ["accountant", "manager"],
        title: `PO raised — ${submitted.poNumber}`,
        body: `${actor.name} sent ${submitted.poNumber} (₦${total.toLocaleString()}) for approval`,
        href: "/expenses?tab=purchase_orders",
      });
      return { po: submitted };
    },
    [basket, purchaseOrders],
  );

  const submitBasketAsPo = useCallback(
    (actor: Actor) => {
      sendBasketForApproval(actor);
    },
    [sendBasketForApproval],
  );

  const accountantDecision = useCallback(
    (poId: string, approved: boolean, comment: string, actor: Actor) => {
      if (approved) setBasket([]);
      setPurchaseOrders((prev) =>
        prev.map((po) =>
          po.id === poId
            ? {
                ...po,
                status: approved ? "pending_manager" : "accountant_rejected",
                accountantComment: comment,
              }
            : po,
        ),
      );
      setActivityLog((a) =>
        log(
          a,
          "po_accountant_decision",
          actor,
          `Accountant ${approved ? "approved" : "rejected"} PO: ${comment}`,
          poId,
        ),
      );
      const po = purchaseOrders.find((p) => p.id === poId);
      if (po) {
        if (approved) {
          pushSupplyNotification({
            audience: ["manager"],
            title: `PO awaiting manager — ${po.poNumber}`,
            body: `Accountant approved. Forwarded for manager review.`,
            href: "/expenses?tab=purchase_orders",
          });
        } else {
          pushSupplyNotification({
            audience: ["store"],
            title: `PO rejected — ${po.poNumber}`,
            body: comment || "Accountant rejected this purchase order.",
            href: "/supply/store",
          });
        }
      }
    },
    [purchaseOrders],
  );

  const managerDecision = useCallback(
    (poId: string, approved: boolean, comment: string, actor: Actor) => {
      setPurchaseOrders((prev) =>
        prev.map((po) =>
          po.id === poId
            ? {
                ...po,
                status: approved ? "disbursed" : "manager_rejected",
                managerComment: comment,
              }
            : po,
        ),
      );
      setActivityLog((a) =>
        log(
          a,
          "po_manager_decision",
          actor,
          `Manager ${approved ? "approved" : "rejected"} PO: ${comment}`,
          poId,
        ),
      );
      const po = purchaseOrders.find((p) => p.id === poId);
      if (po) {
        if (approved) {
          pushSupplyNotification({
            audience: ["purchasing", "store"],
            title: `PO approved for market — ${po.poNumber}`,
            body: `Cash disbursed (₦${po.cashDisbursed.toLocaleString()}). Ready for market purchase.`,
            href: "/supply/purchasing",
          });
        } else {
          pushSupplyNotification({
            audience: ["store", "accountant"],
            title: `PO rejected by manager — ${po.poNumber}`,
            body: comment || "Manager rejected this purchase order.",
            href: "/supply/store",
          });
        }
      }
    },
    [purchaseOrders],
  );

  /** Testing: admin approves or rejects a raised PO in one step (skips accountant → manager chain). */
  const adminTestPoDecision = useCallback(
    (poId: string, approved: boolean, comment: string, actor: Actor) => {
      const target = purchaseOrders.find((p) => p.id === poId);
      if (
        approved &&
        target &&
        (target.status === "pending_accountant" ||
          target.status === "pending_manager")
      ) {
        setBasket([]);
      }
      setPurchaseOrders((prev) =>
        prev.map((po) => {
          if (po.id !== poId) return po;
          if (
            po.status !== "pending_accountant" &&
            po.status !== "pending_manager"
          )
            return po;
          if (approved) {
            return {
              ...po,
              status: "disbursed" as const,
              accountantComment: `[Admin test] ${comment}`,
            };
          }
          if (po.status === "pending_manager") {
            return {
              ...po,
              status: "manager_rejected" as const,
              managerComment: `[Admin test] ${comment}`,
            };
          }
          return {
            ...po,
            status: "accountant_rejected" as const,
            accountantComment: `[Admin test] ${comment}`,
          };
        }),
      );
      setActivityLog((a) =>
        log(
          a,
          approved ? "po_manager_decision" : "po_accountant_decision",
          actor,
          `Admin test ${approved ? "approved" : "rejected"} PO: ${comment}`,
          poId,
        ),
      );
      const po = purchaseOrders.find((p) => p.id === poId);
      if (po && approved) {
        pushSupplyNotification({
          audience: ["purchasing", "store"],
          title: `PO approved (admin test) — ${po.poNumber}`,
          body: comment,
          href: "/supply/purchasing",
        });
      } else if (po && !approved) {
        pushSupplyNotification({
          audience: ["store"],
          title: `PO rejected (admin test) — ${po.poNumber}`,
          body: comment,
          href: "/supply/store",
        });
      }
    },
    [purchaseOrders],
  );

  const applyRetirementToStock = useCallback(
    (po: PurchaseOrder, lines: RetirementLine[]) => {
      setStoreItems((items) => {
        const next = [...items];
        for (const rl of lines) {
          const notBought = rl.notBought === true || rl.removed === true;
          if (notBought || rl.quantityBought <= 0) continue;
          const pl = po.lines.find((l) => l.id === rl.lineId);
          if (!pl) continue;
          const idx = next.findIndex((s) => s.id === pl.stockItemId);
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              quantityInStore: next[idx].quantityInStore + rl.quantityBought,
              lastPrice: rl.actualPrice,
            };
          }
        }
        return next;
      });
    },
    [],
  );

  const submitRetirement = useCallback(
    (poId: string, lines: RetirementLine[], actor: Actor) => {
      setPurchaseOrders((prev) => {
        const po = prev.find((p) => p.id === poId);
        if (!po) return prev;
        const normalized = lines.map((l) => ({
          ...l,
          notBought: l.notBought ?? l.removed ?? false,
        }));
        const actualSpent = normalized
          .filter((l) => !l.notBought)
          .reduce((s, l) => s + l.totalPaid, 0);
        const refund = po.cashDisbursed - actualSpent;

        setActivityLog((a) =>
          log(
            a,
            "retirement_submitted",
            actor,
            `Retirement submitted for accountant review — est. spend ₦${actualSpent.toLocaleString()}, refund ₦${refund.toLocaleString()}`,
            poId,
          ),
        );

        pushSupplyNotification({
          audience: ["accountant"],
          title: `Retirement submitted — ${po.poNumber}`,
          body: `${actor.name} submitted market retirement (₦${actualSpent.toLocaleString()} spent)`,
          href: "/expenses?tab=purchase_orders",
        });

        return prev.map((p) =>
          p.id === poId
            ? {
                ...p,
                status: "retirement_pending_accountant" as const,
                retirement: {
                  actualSpent,
                  refundToCashier: refund,
                  priceChanges: normalized.filter((l) => l.poPrice !== l.actualPrice)
                    .length,
                  lines: normalized,
                  submittedAt: new Date().toISOString(),
                  submittedBy: actor.name,
                },
              }
            : p,
        );
      });
    },
    [],
  );

  const accountantRetirementDecision = useCallback(
    (
      poId: string,
      approved: boolean,
      comment: string,
      actor: Actor,
    ): { ok: true } | { error: string } => {
      const po = purchaseOrders.find((p) => p.id === poId);
      if (!po?.retirement) return { error: "Retirement not found" };
      if (po.status !== "retirement_pending_accountant") {
        return { error: "This PO is not awaiting retirement review" };
      }

      if (!approved) {
        setPurchaseOrders((prev) =>
          prev.map((p) =>
            p.id === poId
              ? {
                  ...p,
                  status: "retirement_rejected" as const,
                  retirementComment: comment,
                  retirement: {
                    ...p.retirement!,
                    accountantComment: comment,
                    reviewedAt: new Date().toISOString(),
                    reviewedBy: actor.name,
                  },
                }
              : p,
          ),
        );
        setActivityLog((a) =>
          log(
            a,
            "retirement_submitted",
            actor,
            `Retirement rejected by accountant: ${comment}`,
            poId,
          ),
        );
        pushSupplyNotification({
          audience: ["purchasing"],
          title: `Retirement rejected — ${po.poNumber}`,
          body: comment || "Accountant rejected the retirement submission.",
          href: "/supply/purchasing",
        });
        return { ok: true };
      }

      applyRetirementToStock(po, po.retirement.lines);
      setPurchaseOrders((prev) =>
        prev.map((p) =>
          p.id === poId
            ? {
                ...p,
                status: "retired" as const,
                retirementComment: comment,
                retirement: {
                  ...p.retirement!,
                  accountantComment: comment,
                  reviewedAt: new Date().toISOString(),
                  reviewedBy: actor.name,
                },
              }
            : p,
        ),
      );
      setBasket([]);
      setActivityLog((a) =>
        log(
          a,
          "retirement_submitted",
          actor,
          `Retirement approved — central store stock updated. ${comment}`,
          poId,
        ),
      );
      pushSupplyNotification({
        audience: ["store", "purchasing"],
        title: `Retirement accepted — ${po.poNumber}`,
        body: "Central store stock updated from market purchase.",
        href: "/supply/store",
      });
      return { ok: true };
    },
    [purchaseOrders, applyRetirementToStock],
  );

  const deleteActivePurchaseOrder = useCallback(
    (actor: Actor): { ok: true } | { error: string } => {
      const po = getActivePurchaseOrder(purchaseOrders);
      if (!po) return { error: "No active purchase order to delete" };
      if (
        !["draft", "accountant_rejected", "retirement_rejected"].includes(
          po.status,
        )
      ) {
        return {
          error: "Only draft, accountant-rejected, or retirement-rejected POs can be deleted",
        };
      }
      setPurchaseOrders((prev) => prev.filter((p) => p.id !== po.id));
      setBasket([]);
      setActivityLog((a) =>
        log(
          a,
          "po_created",
          actor,
          `Purchase order ${po.poNumber} deleted`,
          po.id,
        ),
      );
      return { ok: true };
    },
    [purchaseOrders],
  );

  const kitchenRawOnHand = useCallback(
    (storeItemId: string) =>
      kitchenRawStock.find((k) => k.storeItemId === storeItemId)?.quantityOnHand ?? 0,
    [kitchenRawStock],
  );

  const deductKitchenRawMaterials = useCallback(
    (lines: { storeItemId: string; quantity: number }[]) => {
      setKitchenRawStock((prev) =>
        prev.map((k) => {
          const line = lines.find((l) => l.storeItemId === k.storeItemId);
          if (!line) return k;
          return { ...k, quantityOnHand: Math.max(0, k.quantityOnHand - line.quantity) };
        }),
      );
    },
    [],
  );

  const openBatch = useCallback(
    (recipeId: string, plannedPortions: number, actor: Actor) => {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) return null;
      if (!Number.isFinite(plannedPortions) || plannedPortions <= 0) {
        return { error: "Enter planned portions" };
      }

      const scale =
        recipe.yieldPortions > 0 ? plannedPortions / recipe.yieldPortions : 1;
      const materialLines = recipe.ingredients.map((ing) => ({
        storeItemId: ing.stockItemId,
        name: ing.name,
        unit: ing.unit,
        quantity: Math.round(ing.quantity * scale * 1000) / 1000,
      }));

      for (const line of materialLines) {
        const onHand = kitchenRawOnHand(line.storeItemId);
        if (onHand < line.quantity) {
          return {
            error: `Insufficient ${line.name} issued to kitchen (${onHand} ${line.unit} on hand; need ${line.quantity}). Ask store to issue out first.`,
          };
        }
      }

      deductKitchenRawMaterials(materialLines);

      const batch: ProductionBatch = {
        id: uid("bat"),
        recipeId,
        recipeName: recipe.name,
        shift: "Morning",
        status: "in_progress",
        plannedPortions,
        actualPortions: 0,
        foodCostPct: 0,
        variancePct: 0,
        materialsUsed: materialLines.map(
          (i) => `${i.quantity} ${i.unit} ${i.name}`,
        ),
        openedAt: new Date().toISOString(),
        openedBy: actor.name,
      };
      setBatches((b) => [batch, ...b]);
      setActivityLog((a) =>
        log(
          a,
          "stock_issued_kitchen",
          actor,
          `Opened batch: ${recipe.name} — raw materials from kitchen stock (cost ₦${recipeTotalCost(recipe).toLocaleString()})`,
          batch.id,
        ),
      );
      return { batch };
    },
    [recipes, kitchenRawOnHand, deductKitchenRawMaterials],
  );

  const openKitchenBatchFromMaterials = useCallback(
    (
      input: CreateKitchenBatchInput,
      actor: Actor,
    ): { ok: true; batch: ProductionBatch; kitchenStockId: string } | { error: string } => {
      const batchName = input.batchName.trim();
      const menuCategory = input.menuCategory.trim();
      if (!batchName) return { error: "Enter a batch / menu name" };
      if (!menuCategory) return { error: "Select a menu category for the restaurant" };
      if (!input.materials.length) return { error: "Add at least one raw material" };
      if (!Number.isFinite(input.plannedPortions) || input.plannedPortions <= 0) {
        return { error: "Enter planned portions for this batch" };
      }

      for (const line of input.materials) {
        const store = storeItems.find((s) => s.id === line.storeItemId);
        if (!store || store.dept !== "kitchen") {
          return { error: `${line.name} is not a kitchen store item` };
        }
        const onHand =
          kitchenRawStock.find((k) => k.storeItemId === line.storeItemId)
            ?.quantityOnHand ?? 0;
        if (onHand < line.quantity) {
          return {
            error: `Insufficient ${line.name} issued to kitchen (${onHand} ${line.unit} on hand; need ${line.quantity}). Ask store to issue out first.`,
          };
        }
      }

      const batchCost = input.materials.reduce(
        (sum, line) => sum + line.quantity * line.unitCost,
        0,
      );
      const sell = Math.max(0, input.sellingPricePerPortion);
      const revenue = sell * input.plannedPortions;
      const marginPct =
        revenue > 0 ? Math.round(((revenue - batchCost) / revenue) * 1000) / 10 : 0;

      deductKitchenRawMaterials(
        input.materials.map((m) => ({
          storeItemId: m.storeItemId,
          quantity: m.quantity,
        })),
      );

      const kitchenStockId =
        input.kitchenStockId?.trim() || `ks-${outletStockSlug(batchName)}`;
      const recipeId = `rcp-${outletStockSlug(batchName)}`;

      setKitchenStock((prev) => {
        const idx = prev.findIndex((k) => k.id === kitchenStockId);
        if (idx >= 0) {
          return prev.map((k, i) =>
            i === idx
              ? {
                  ...k,
                  availablePortions: k.availablePortions + input.plannedPortions,
                  source: "produced" as const,
                  linkedRecipeId: recipeId,
                }
              : k,
          );
        }
        return [
          ...prev,
          {
            id: kitchenStockId,
            name: batchName,
            source: "produced" as const,
            availablePortions: input.plannedPortions,
            reorderLevel: Math.max(2, Math.ceil(input.plannedPortions * 0.15)),
            linkedRecipeId: recipeId,
          },
        ];
      });

      const recipeRow: Recipe = {
        id: recipeId,
        name: batchName,
        category: menuCategory,
        yieldPortions: input.plannedPortions,
        yieldLabel: `${input.plannedPortions} portions`,
        ingredients: input.materials.map((m) => ({
          stockItemId: m.storeItemId,
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          cost: m.quantity * m.unitCost,
        })),
        overheadCost: 0,
        sellingPricePerPortion: sell,
      };
      setRecipes((prev) => {
        const idx = prev.findIndex((r) => r.id === recipeId || r.name === batchName);
        if (idx >= 0) {
          return prev.map((r, i) => (i === idx ? { ...recipeRow, id: r.id } : r));
        }
        return [recipeRow, ...prev];
      });

      const materialsUsed = input.materials.map(
        (m) => `${m.quantity} ${m.unit} ${m.name}`,
      );
      if (input.notes?.trim()) materialsUsed.push(input.notes.trim());

      const batch: ProductionBatch = {
        id: uid("bat"),
        recipeId,
        recipeName: batchName,
        shift: "Production",
        status: "in_progress",
        plannedPortions: input.plannedPortions,
        actualPortions: 0,
        foodCostPct: marginPct,
        variancePct: 0,
        batchCost,
        sellingPricePerPortion: sell,
        materialsUsed,
        kitchenStockId,
        openedAt: new Date().toISOString(),
        openedBy: actor.name,
      };
      setBatches((b) => [batch, ...b]);
      setActivityLog((a) =>
        log(
          a,
          "batch_opened",
          actor,
          `New batch "${batchName}" — ${input.plannedPortions} portions, cost ₦${batchCost.toLocaleString()}, margin ${marginPct}%`,
          batch.id,
        ),
      );
      setActivityLog((a) =>
        log(
          a,
          "recipe_updated",
          actor,
          `Recipe standard saved: ${batchName} (${input.materials.length} ingredients)`,
          recipeId,
        ),
      );
      return { ok: true, batch, kitchenStockId };
    },
    [storeItems, kitchenRawStock, deductKitchenRawMaterials],
  );

  const updateRecipe = useCallback(
    (
      recipeId: string,
      patch: {
        name?: string;
        category?: string;
        yieldPortions?: number;
        sellingPricePerPortion?: number;
        overheadCost?: number;
        ingredients?: Recipe["ingredients"];
      },
      actor: Actor,
    ): { ok: true } | { error: string } => {
      const existing = recipes.find((r) => r.id === recipeId);
      if (!existing) return { error: "Batch standard not found" };

      const name = (patch.name ?? existing.name).trim();
      const category = (patch.category ?? existing.category).trim();
      const yieldPortions = patch.yieldPortions ?? existing.yieldPortions;
      const sellingPricePerPortion =
        patch.sellingPricePerPortion ?? existing.sellingPricePerPortion;
      const overheadCost = patch.overheadCost ?? existing.overheadCost;
      const ingredients = patch.ingredients ?? existing.ingredients;

      if (!name) return { error: "Enter a batch name" };
      if (!category) return { error: "Enter a menu category" };
      if (!Number.isFinite(yieldPortions) || yieldPortions <= 0) {
        return { error: "Enter valid planned portions" };
      }
      if (!ingredients.length) {
        return { error: "Add at least one ingredient" };
      }

      const updated: Recipe = {
        ...existing,
        name,
        category,
        yieldPortions,
        yieldLabel: `${yieldPortions} portions`,
        sellingPricePerPortion,
        overheadCost,
        ingredients,
      };

      setRecipes((prev) =>
        prev.map((r) => (r.id === recipeId ? updated : r)),
      );
      setKitchenStock((prev) =>
        prev.map((k) =>
          k.linkedRecipeId === recipeId ? { ...k, name } : k,
        ),
      );
      setActivityLog((a) =>
        log(
          a,
          "recipe_updated",
          actor,
          `Batch standard updated: ${name}`,
          recipeId,
        ),
      );
      return { ok: true };
    },
    [recipes],
  );

  const deleteRecipe = useCallback(
    (recipeId: string, actor: Actor): { ok: true } | { error: string } => {
      const existing = recipes.find((r) => r.id === recipeId);
      if (!existing) return { error: "Batch standard not found" };

      const inProgress = batches.some(
        (b) => b.recipeId === recipeId && b.status === "in_progress",
      );
      if (inProgress) {
        return {
          error: "Close or complete the in-progress production run before deleting this batch standard",
        };
      }

      setRecipes((prev) => prev.filter((r) => r.id !== recipeId));
      setKitchenStock((prev) =>
        prev.filter((k) => k.linkedRecipeId !== recipeId),
      );
      setBatches((prev) => prev.filter((b) => b.recipeId !== recipeId));
      setActivityLog((a) =>
        log(
          a,
          "recipe_updated",
          actor,
          `Batch standard deleted: ${existing.name}`,
          recipeId,
        ),
      );
      return { ok: true };
    },
    [recipes, batches],
  );

  /** Wipe kitchen finished stock, batch standards, production runs, and batch draft. Categories stay in Restaurant outlet DB. */
  const clearKitchenRestaurantMenu = useCallback((actor: Actor) => {
    const recipeCount = recipes.length;
    const stockCount = kitchenStock.length;
    const batchCount = batches.length;

    setRecipes([]);
    setKitchenStock([]);
    setBatches([]);
    clearKitchenBatchDraft();

    setActivityLog((a) =>
      log(
        a,
        "recipe_updated",
        actor,
        `Cleared kitchen menu — ${recipeCount} batch standard(s), ${stockCount} finished stock row(s), ${batchCount} production record(s)`,
      ),
    );

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("frontbill:outlet-menu-cleared"));
    }

    return {
      ok: true as const,
      recipesCleared: recipeCount,
      stockCleared: stockCount,
      batchesCleared: batchCount,
    };
  }, [recipes, kitchenStock, batches]);

  const closeBatch = useCallback(
    (
      batchId: string,
      actualPortions: number,
      disposition: {
        sold: number;
        staff: number;
        waste: number;
        returned: number;
      },
      actor: Actor,
    ) => {
      const batch = batches.find((b) => b.id === batchId);
      if (!batch) return;
      const recipe = batch.recipeId
        ? recipes.find((r) => r.id === batch.recipeId)
        : undefined;

      const foodCost = batch.batchCost ?? (recipe ? recipeTotalCost(recipe) : 0);
      const foodCostPct =
        batch.foodCostPct ||
        (recipe ? recipeGrossMarginPct(recipe) : 0);
      const variancePct =
        batch.plannedPortions > 0
          ? Math.round(
              ((actualPortions - batch.plannedPortions) /
                batch.plannedPortions) *
                1000,
            ) / 10
          : 0;

      setBatches((prev) =>
        prev.map((b) =>
          b.id === batchId
            ? {
                ...b,
                status: "completed",
                actualPortions,
                foodCostPct,
                variancePct,
                closedAt: new Date().toISOString(),
                disposition,
              }
            : b,
        ),
      );

      const stockId =
        batch.kitchenStockId ??
        (recipe
          ? kitchenStock.find((k) => k.linkedRecipeId === recipe.id)?.id
          : undefined);
      if (stockId) {
        setKitchenStock((ks) =>
          ks.map((k) =>
            k.id === stockId
              ? {
                  ...k,
                  availablePortions:
                    k.availablePortions +
                    actualPortions -
                    disposition.staff -
                    disposition.waste -
                    disposition.returned,
                }
              : k,
          ),
        );
      }

      setActivityLog((a) =>
        log(
          a,
          "batch_closed",
          actor,
          `Closed ${batch.recipeName}: ${actualPortions} portions → F&B stock (+${actualPortions - disposition.staff - disposition.waste - disposition.returned} sellable). Cost ₦${foodCost.toLocaleString()}, margin ${foodCostPct}%`,
          batchId,
        ),
      );
    },
    [batches, recipes, kitchenStock],
  );

  const postFnbOrder = useCallback(
    (
      lines: { menuItemId: string; qty: number }[],
      tableLabel: string,
      settlement: string,
      actor: Actor,
    ) => {
      const orderLines: FnbOrder["lines"] = [];
      let subtotal = 0;

      for (const { menuItemId, qty } of lines) {
        const menu = fnbOrders.find((m) => m.id === menuItemId);
        if (!menu) continue;
        if (menu.portionsPerSale > 0) {
          const ks = kitchenStock.find((k) => k.id === menu.kitchenStockId);
          if (!ks || ks.availablePortions < menu.portionsPerSale * qty) {
            return {
              error: `${menu.name} — 86 OUT (kitchen stock insufficient)`,
            };
          }
        }
        orderLines.push({
          menuItemId,
          name: menu.name,
          qty,
          unitPrice: menu.sellingPrice,
        });
        subtotal += menu.sellingPrice * qty;
      }

      for (const ol of orderLines) {
        const menu = fnbOrders.find((m) => m.id === ol.menuItemId)!;
        if (menu.portionsPerSale <= 0) continue;
        setKitchenStock((ks) =>
          ks.map((k) =>
            k.id === menu.kitchenStockId
              ? {
                  ...k,
                  availablePortions: Math.max(
                    0,
                    k.availablePortions - menu.portionsPerSale * ol.qty,
                  ),
                }
              : k,
          ),
        );
      }

      const vat = calcVat(subtotal);
      const order: FnbOrder = {
        id: uid("ord"),
        tableLabel,
        lines: orderLines,
        subtotal,
        vat,
        total: subtotal + vat,
        settlement,
        status: "ordered",
        createdAt: new Date().toISOString(),
      };
      setOrders((o) => [order, ...o]);
      setActivityLog((a) =>
        log(
          a,
          "fnb_order_posted",
          actor,
          `Posted order ₦${order.total.toLocaleString()} — kitchen stock auto-depleted`,
          order.id,
        ),
      );
      return { order };
    },
    [fnbOrders, kitchenStock],
  );

  const issueFromStoreToBar = useCallback(
    (storeItemId: string, qty: number, actor: Actor) => {
      if (qty <= 0) return { error: "Enter a quantity to issue" };
      const store = storeItems.find((s) => s.id === storeItemId);
      if (!store || store.dept !== "bar") {
        return {
          error: "Only bar department store items can be issued to the bar",
        };
      }
      if (store.quantityInStore < qty) {
        return {
          error: `Insufficient ${store.name} in central store (${store.quantityInStore} ${store.unit})`,
        };
      }

      setStoreItems((items) =>
        items.map((s) =>
          s.id === storeItemId
            ? { ...s, quantityInStore: s.quantityInStore - qty }
            : s,
        ),
      );

      setBarStock((prev) => {
        const idx = prev.findIndex((b) => b.storeItemId === storeItemId);
        if (idx >= 0) {
          return prev.map((b, i) =>
            i === idx ? { ...b, quantityOnHand: b.quantityOnHand + qty } : b,
          );
        }
        return [
          ...prev,
          {
            id: `bar-${storeItemId}`,
            storeItemId,
            name: store.name,
            quantityOnHand: qty,
            reorderLevel: store.reorderLevel,
            unitsPerSale: 1,
            unit: store.unit,
          },
        ];
      });

      setActivityLog((a) =>
        log(
          a,
          "stock_issued_bar",
          actor,
          `Issued ${qty} ${store.unit} ${store.name} from store → bar stock`,
          storeItemId,
        ),
      );
      return { ok: true as const };
    },
    [storeItems],
  );

  function destinationCreditsBarStock(destination: string): boolean {
    const d = destination.trim().toLowerCase();
    return (
      d === "main bar" ||
      d === "beverages / mini-bar" ||
      d === "swimming pool" ||
      d.includes("bar")
    );
  }

  function destinationCreditsKitchenRaw(destination: string): boolean {
    const d = destination.trim().toLowerCase();
    return d === "kitchen" || d === "staff cafeteria" || d.includes("kitchen");
  }

  const issueFromStoreToDepartment = useCallback(
    (
      storeItemId: string,
      qty: number,
      destination: string,
      actor: Actor,
      opts?: { notes?: string; receivedBy?: string; receivedById?: string },
    ): { ok: true } | { error: string } => {
      const dest = destination.trim();
      if (!dest) return { error: "Select a destination department or outlet" };

      const store = storeItems.find((s) => s.id === storeItemId);
      if (!store) return { error: "Item not found" };
      if (!Number.isFinite(qty) || qty <= 0)
        return { error: "Enter a quantity to issue" };
      if (store.quantityInStore < qty) {
        return {
          error: `Insufficient stock (${store.quantityInStore} ${store.unit} on hand)`,
        };
      }

      if (store.dept === "bar" && destinationCreditsBarStock(dest)) {
        const barRes = issueFromStoreToBar(storeItemId, qty, actor);
        if (barRes && "error" in barRes) return barRes;
        return { ok: true as const };
      }

      setStoreItems((items) =>
        items.map((s) =>
          s.id === storeItemId
            ? { ...s, quantityInStore: s.quantityInStore - qty }
            : s,
        ),
      );

      if (store.dept === "kitchen" && destinationCreditsKitchenRaw(dest)) {
        setKitchenRawStock((prev) => {
          const idx = prev.findIndex((k) => k.storeItemId === storeItemId);
          if (idx >= 0) {
            return prev.map((k, i) =>
              i === idx ? { ...k, quantityOnHand: k.quantityOnHand + qty } : k,
            );
          }
          return [
            ...prev,
            {
              id: `kraw-${storeItemId}`,
              storeItemId,
              name: store.name,
              quantityOnHand: qty,
              reorderLevel: store.reorderLevel,
              unit: store.unit,
            },
          ];
        });
        setActivityLog((a) =>
          log(
            a,
            "stock_issued_kitchen",
            actor,
            `Issued ${qty} ${store.unit} ${store.name} from store → kitchen raw stock`,
            storeItemId,
          ),
        );
        notifyKitchenRawStockChanged();
      }

      const extra = [
        opts?.receivedBy?.trim()
          ? `Received by: ${opts.receivedBy.trim()}`
          : "",
        opts?.notes?.trim() ?? "",
      ]
        .filter(Boolean)
        .join(" · ");

      const summary = extra
        ? `Stock out: ${qty} ${store.unit} ${store.name} → ${dest} (${extra})`
        : `Stock out: ${qty} ${store.unit} ${store.name} → ${dest}`;

      setIssueOutLog((prev) => [
        {
          id: uid("issue"),
          storeItemId,
          itemName: store.name,
          unit: store.unit,
          quantity: qty,
          destination: dest,
          receivedBy: opts?.receivedBy?.trim() || undefined,
          receivedById: opts?.receivedById || undefined,
          notes: opts?.notes?.trim() || undefined,
          issuedAt: new Date().toISOString(),
          issuedBy: actor.name,
        },
        ...prev,
      ]);
      setActivityLog((a) =>
        log(a, "stock_issued_out", actor, summary, storeItemId),
      );
      return { ok: true as const };
    },
    [storeItems, issueFromStoreToBar],
  );

  /** Admin kickstart: set absolute on-hand qty for a menu item (creates kitchen/bar link if missing). */
  const kickstartOutletMenuStock = useCallback(
    (
      department: OutletDepartmentKey,
      item: OutletMenuItemRow,
      newQty: number,
      actor: Actor,
    ):
      | { ok: true; stockId: string; serviceCode: string; unit: string }
      | { error: string } => {
      if (!isStoreControlledFnbOutlet(department)) {
        return { error: "Stock kickstart is only for Restaurant and Main Bar" };
      }
      if (!Number.isFinite(newQty) || newQty < 0) {
        return { error: "Enter a valid quantity (0 or more)" };
      }

      const qty = Math.floor(newQty);
      const source = effectiveStockSource(department, item);
      const link = resolveOutletItemStock(
        item,
        department,
        kitchenStock,
        barStock,
      );

      if (source === "kitchen") {
        const stockId = link.stockId || `ks-${outletStockSlug(item.name)}`;
        const serviceCode = `ks:${stockId}`;
        setKitchenStock((prev) =>
          upsertKitchenStockRow(prev, stockId, item.name, qty),
        );
        setActivityLog((a) =>
          log(
            a,
            "stock_issued_kitchen",
            actor,
            `Kickstart ${item.name} → ${qty} portions (menu tab)`,
            stockId,
          ),
        );
        return { ok: true, stockId, serviceCode, unit: "portion" };
      }

      if (source === "bar") {
        const stockId = link.stockId || `bar-${outletStockSlug(item.name)}`;
        const matchedStore = storeItems.find(
          (s) =>
            s.dept === "bar" &&
            s.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
        );
        const barUnit =
          barStock.find((b) => b.id === stockId)?.unit ??
          matchedStore?.unit ??
          "bottle";
        const serviceCode = `bar:${stockId}`;
        const barRow: BarStockItem = {
          id: stockId,
          storeItemId: matchedStore?.id ?? `manual-${stockId}`,
          name: item.name,
          quantityOnHand: qty,
          reorderLevel: Math.max(6, Math.ceil(qty * 0.2)),
          unitsPerSale: 1,
          unit: barUnit,
        };
        setBarStock((prev) => upsertBarStockRow(prev, stockId, barRow, qty));
        setActivityLog((a) =>
          log(
            a,
            "stock_issued_bar",
            actor,
            `Kickstart ${item.name} → ${qty} ${barUnit}(s) (menu tab)`,
            stockId,
          ),
        );
        return { ok: true, stockId, serviceCode, unit: barUnit };
      }

      return { error: "This outlet is not stock-controlled" };
    },
    [kitchenStock, barStock, storeItems],
  );

  /**
   * Issue raw kitchen store stock → flexible portion yield.
   * e.g. 1 kg beef → 4 portions; 6 kg chicken → 16 portions; 5 kg goat → 15 portions.
   */
  const issueRawToKitchenPortions = useCallback(
    (
      input: RawKitchenIssueInput,
      actor: Actor,
    ): { ok: true } | { error: string } => {
      const rawQty = Number(input.rawQuantity);
      const portions = Math.floor(Number(input.portionsProduced));
      const finishedName = input.finishedItemName.trim();

      if (!input.storeItemId)
        return { error: "Select a raw material from central store" };
      if (!finishedName)
        return { error: "Enter the finished kitchen item name" };
      if (!Number.isFinite(rawQty) || rawQty <= 0)
        return { error: "Enter raw quantity issued" };
      if (!Number.isFinite(portions) || portions <= 0) {
        return { error: "Enter portions produced (flexible yield)" };
      }

      const store = storeItems.find((s) => s.id === input.storeItemId);
      if (!store || store.dept !== "kitchen") {
        return {
          error: "Only kitchen department store items can be issued this way",
        };
      }
      if (store.quantityInStore < rawQty) {
        return {
          error: `Insufficient ${store.name} in store (${store.quantityInStore} ${store.unit} on hand)`,
        };
      }

      setStoreItems((items) =>
        items.map((s) =>
          s.id === store.id
            ? { ...s, quantityInStore: s.quantityInStore - rawQty }
            : s,
        ),
      );

      let kitchenStockId = input.kitchenStockId?.trim();
      if (kitchenStockId) {
        setKitchenStock((prev) =>
          prev.map((k) =>
            k.id === kitchenStockId
              ? { ...k, availablePortions: k.availablePortions + portions }
              : k,
          ),
        );
      } else {
        kitchenStockId = `ks-${outletStockSlug(finishedName)}`;
        setKitchenStock((prev) => {
          const idx = prev.findIndex((k) => k.id === kitchenStockId);
          if (idx >= 0) {
            return prev.map((k, i) =>
              i === idx
                ? { ...k, availablePortions: k.availablePortions + portions }
                : k,
            );
          }
          return [
            ...prev,
            {
              id: kitchenStockId!,
              name: finishedName,
              source: "issued_raw" as const,
              availablePortions: portions,
              reorderLevel: Math.max(2, Math.ceil(portions * 0.15)),
            },
          ];
        });
      }

      const yieldNote = input.notes?.trim()
        ? input.notes.trim()
        : `${rawQty} ${store.unit} ${store.name} → ${portions} portions`;

      setActivityLog((a) =>
        log(
          a,
          "stock_issued_kitchen",
          actor,
          `Raw issue: ${yieldNote}`,
          kitchenStockId,
        ),
      );

      return { ok: true };
    },
    [storeItems],
  );

  const getOutletItemStock = useCallback(
    (department: OutletDepartmentKey, item: OutletMenuItemRow) =>
      resolveOutletItemStock(item, department, kitchenStock, barStock),
    [kitchenStock, barStock],
  );

  const validateOutletCart = useCallback(
    (
      department: OutletDepartmentKey,
      lines: { item: OutletMenuItemRow; qty: number }[],
    ): { ok: true } | { error: string } => {
      for (const line of lines) {
        const link = resolveOutletItemStock(
          line.item,
          department,
          kitchenStock,
          barStock,
        );
        if (!link.tracked) continue;
        const need = link.portionsPerSale * line.qty;
        const maxQty = maxSellableQty(link);
        if (line.qty > maxQty) {
          const src = link.source === "kitchen" ? "kitchen" : "bar";
          return {
            error: `${line.item.name} — only ${maxQty} available (${src}: ${link.available} on hand)`,
          };
        }
        if (need > link.available) {
          return {
            error: `${line.item.name} — insufficient ${link.source} stock`,
          };
        }
      }
      return { ok: true };
    },
    [kitchenStock, barStock],
  );

  const deductOutletCart = useCallback(
    (
      department: OutletDepartmentKey,
      lines: { item: OutletMenuItemRow; qty: number }[],
      actor: Actor,
    ) => {
      for (const line of lines) {
        const link = resolveOutletItemStock(
          line.item,
          department,
          kitchenStock,
          barStock,
        );
        if (!link.tracked || !link.stockId) continue;
        const deduct = link.portionsPerSale * line.qty;
        if (link.source === "kitchen") {
          setKitchenStock((ks) =>
            ks.map((k) =>
              k.id === link.stockId
                ? {
                    ...k,
                    availablePortions: Math.max(
                      0,
                      k.availablePortions - deduct,
                    ),
                  }
                : k,
            ),
          );
        } else {
          setBarStock((bs) =>
            bs.map((b) =>
              b.id === link.stockId
                ? {
                    ...b,
                    quantityOnHand: Math.max(0, b.quantityOnHand - deduct),
                  }
                : b,
            ),
          );
        }
      }
      setActivityLog((a) =>
        log(
          a,
          "fnb_order_posted",
          actor,
          `Outlet ${department} sale — stock deducted (kitchen / bar pipeline)`,
        ),
      );
    },
    [kitchenStock, barStock],
  );

  const draftLines = useMemo(() => {
    if (
      activePurchaseOrder?.lines.length &&
      showsStoreDraftPurchaseList(activePurchaseOrder)
    ) {
      return poLinesToBasketLines(activePurchaseOrder.lines);
    }
    if (!activePurchaseOrder && basket.length) return basket;
    return [];
  }, [activePurchaseOrder, basket]);

  const stats = useMemo(
    () => ({
      totalStoreItems: storeItems.length,
      stockAlerts: storeItems.filter((s) => s.quantityInStore <= s.reorderLevel)
        .length,
      basketTotal: draftLines.reduce((s, b) => s + b.qtyToBuy * b.unitPrice, 0),
      basketCount: draftLines.length,
      activeBatches: batches.filter((b) => b.status === "in_progress").length,
      recipeCount: recipes.length,
      fnbAlerts: kitchenStock.filter(
        (k) => k.availablePortions <= k.reorderLevel,
      ).length,
      barAlerts: barStock.filter((b) => b.quantityOnHand <= b.reorderLevel)
        .length,
      todayRevenue: orders
        .filter(
          (o) =>
            o.createdAt.slice(0, 10) === new Date().toISOString().slice(0, 10),
        )
        .reduce((s, o) => s + o.total, 0),
    }),
    [storeItems, draftLines, batches, recipes, kitchenStock, barStock, orders],
  );

  return {
    storeItems,
    basket: draftLines,
    activePurchaseOrder,
    addToBasket,
    setBasketLineQty,
    removeFromBasket,
    clearBasket,
    sendBasketForApproval,
    submitBasketAsPo,
    purchaseOrders,
    accountantDecision,
    managerDecision,
    adminTestPoDecision,
    submitRetirement,
    accountantRetirementDecision,
    deleteActivePurchaseOrder,
    recipes,
    kitchenStock,
    kitchenRawStock,
    issueOutLog,
    barStock,
    issueFromStoreToBar,
    issueFromStoreToDepartment,
    kickstartOutletMenuStock,
    issueRawToKitchenPortions,
    getOutletItemStock,
    validateOutletCart,
    deductOutletCart,
    batches,
    fnbMenu: fnbOrders,
    orders,
    openBatch,
    openKitchenBatchFromMaterials,
    updateRecipe,
    deleteRecipe,
    clearKitchenRestaurantMenu,
    kitchenRawOnHand,
    closeBatch,
    postFnbOrder,
    activityLog,
    stats,
    getRecipeEconomics: (recipe: Recipe) => ({
      totalCost: recipeTotalCost(recipe),
      costPerPortion: recipeCostPerPortion(recipe),
      revenue: recipe.sellingPricePerPortion * recipe.yieldPortions,
      profit:
        recipe.sellingPricePerPortion * recipe.yieldPortions -
        recipeTotalCost(recipe),
      marginPct: recipeGrossMarginPct(recipe),
    }),
  };
}

export function SupplyChainProvider({ children }: { children: ReactNode }) {
  return (
    <SupplyChainContext.Provider value={useSupplyChainImpl()}>
      {children}
    </SupplyChainContext.Provider>
  );
}

export function useSupplyChain() {
  const ctx = useContext(SupplyChainContext);
  if (!ctx) throw new Error("useSupplyChain requires SupplyChainProvider");
  // Guard against stale HMR context shapes missing newer fields
  return {
    ...ctx,
    kitchenRawStock: ctx.kitchenRawStock ?? [],
    kitchenRawOnHand: ctx.kitchenRawOnHand ?? (() => 0),
    issueOutLog: ctx.issueOutLog ?? [],
    updateRecipe:
      ctx.updateRecipe ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    deleteRecipe:
      ctx.deleteRecipe ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    clearKitchenRestaurantMenu:
      ctx.clearKitchenRestaurantMenu ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    accountantRetirementDecision:
      ctx.accountantRetirementDecision ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    deleteActivePurchaseOrder:
      ctx.deleteActivePurchaseOrder ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    basket: ctx.basket ?? [],
    activePurchaseOrder: ctx.activePurchaseOrder ?? undefined,
    purchaseOrders: ctx.purchaseOrders ?? [],
    setBasketLineQty: ctx.setBasketLineQty ?? (() => {}),
    removeFromBasket: ctx.removeFromBasket ?? (() => {}),
    clearBasket: ctx.clearBasket ?? (() => {}),
    sendBasketForApproval:
      ctx.sendBasketForApproval ??
      (() => ({ error: "Basket not ready — refresh the page" })),
  };
}
