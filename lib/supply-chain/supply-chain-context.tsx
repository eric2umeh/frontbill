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
  LEGACY_DEMO_BATCH_IDS,
  LEGACY_DEMO_KITCHEN_STOCK_IDS,
  LEGACY_DEMO_RECIPE_IDS,
} from './legacy-demo-ids'
import {
  calcVat,
  recipeOverheadTotal,
} from "./calculations";
import { toTitleCaseWords } from "./title-case";
import {
  normalizeBatchOutletMenuSync,
} from "./batch-outlet-sync";
import type {
  ActivityAction,
  ActivityEntry,
  BasketLine,
  CreateKitchenBatchInput,
  FnbOrder,
  FnbMenuItem,
  FnbRawStockItem,
  IssueOutCartLine,
  IssueOutRecord,
  KitchenRawStockItem,
  KitchenStockItem,
  PendingStoreItem,
  ProductionBatch,
  PurchaseOrder,
  RawKitchenIssueInput,
  Recipe,
  RetirementLine,
  StoreItem,
  BarStockItem,
  SupplyDept,
} from "./types";
import { isBarStoreDept, normalizeSupplyDept, normalizeStoreItemDepts, applyStoreItemDeptFields, storeItemDeptFieldsForDb } from "./types";
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
import { toast } from "sonner";
import { clearKitchenBatchDraft } from "./kitchen-batch-draft";
import { convertToStoreUnits, materialCostForUnit } from "./measurement-units";
import {
  convertToStoreUnitsWithFactors,
  mergeUnitFactors,
} from "./unit-factor-storage";
import type { StockShortageLine } from "@/lib/ui/stock-shortage-dialog";
import { useAuth } from "@/lib/auth-context";
import {
  deleteSupplyCatalogItem,
  fetchSupplyCatalog,
  fetchSupplySnapshots,
  insertSupplyCatalogItem,
  saveSupplySnapshots,
  syncSupplyCatalog,
  updateSupplyCatalogItem,
} from "./supply-db-client";
import { resolveSupplySnapshot } from "./snapshot-merge";
import {
  convertMaterialQuantity,
  materialLineQuantityInStockUnit,
} from "./batch-material-shortages";

function notifyKitchenRawStockChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("frontbill:kitchen-raw-stock"));
    window.dispatchEvent(new CustomEvent("frontbill:supply-stock-changed"));
  }
}

function notifyBarStockChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("frontbill:bar-stock-changed"));
    window.dispatchEvent(new CustomEvent("frontbill:supply-stock-changed"));
  }
}

function notifyFnbRawStockChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("frontbill:fnb-raw-stock-changed"));
    window.dispatchEvent(new CustomEvent("frontbill:supply-stock-changed"));
  }
}

function notifyIssueOutLogChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("frontbill:issue-out-log-changed"));
    window.dispatchEvent(new CustomEvent("frontbill:supply-stock-changed"));
  }
}

type Actor = { name: string; role: string };

let uidSeq = 0;
function uid(p: string) {
  uidSeq += 1;
  return `${p}-${Date.now().toString(36)}-${uidSeq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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
const PENDING_STORE_ITEMS_KEY = "frontbill_pending_store_items";
const FNB_RAW_STOCK_KEY = "frontbill_fnb_raw_stock";
const ACTIVITY_LOG_STORAGE_KEY = "frontbill_supply_activity_log";

const EMPTY_STORE_ITEMS: StoreItem[] = [];
const EMPTY_ACTIVITY_LOG: ActivityEntry[] = [];
const EMPTY_RECIPES: Recipe[] = [];
const EMPTY_KITCHEN_STOCK: KitchenStockItem[] = [];
const EMPTY_KITCHEN_RAW_STOCK: KitchenRawStockItem[] = [];
const EMPTY_BAR_STOCK: BarStockItem[] = [];
const EMPTY_BATCHES: ProductionBatch[] = [];
const EMPTY_PURCHASE_ORDERS: PurchaseOrder[] = [];

const SUPPLY_STORAGE_VERSION = 2;
const SUPPLY_STORAGE_VERSION_KEY = "frontbill_supply_storage_version";

const ALL_SUPPLY_STORAGE_KEYS = [
  STORE_ITEMS_STORAGE_KEY,
  PENDING_STORE_ITEMS_KEY,
  PURCHASE_ORDERS_STORAGE_KEY,
  BASKET_STORAGE_KEY,
  RECIPES_STORAGE_KEY,
  KITCHEN_STOCK_STORAGE_KEY,
  KITCHEN_RAW_STOCK_STORAGE_KEY,
  FNB_RAW_STOCK_KEY,
  BAR_STOCK_STORAGE_KEY,
  BATCHES_STORAGE_KEY,
  ISSUE_OUT_LOG_STORAGE_KEY,
  ACTIVITY_LOG_STORAGE_KEY,
] as const;

/** Cleared after cloud migration — kitchen/outlet snapshots stay in localStorage as backup. */
const CLOUD_MIGRATION_CLEAR_KEYS = [
  STORE_ITEMS_STORAGE_KEY,
  PENDING_STORE_ITEMS_KEY,
  PURCHASE_ORDERS_STORAGE_KEY,
  BASKET_STORAGE_KEY,
] as const;

function isLegacyDemoKitchen(
  recipes: Recipe[],
  batches: ProductionBatch[],
  stock: KitchenStockItem[],
): boolean {
  if (recipes.length === 0 && batches.length === 0 && stock.length === 0) return false;

  const mockRecipeIds = LEGACY_DEMO_RECIPE_IDS;
  if (recipes.some((r) => !mockRecipeIds.has(r.id))) return false;

  const mockBatchIds = LEGACY_DEMO_BATCH_IDS;
  if (batches.some((b) => !mockBatchIds.has(b.id))) return false;

  const mockStockIds = LEGACY_DEMO_KITCHEN_STOCK_IDS;
  if (stock.some((s) => !mockStockIds.has(s.id))) return false;

  return true;
}

function removePersistedStock(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function removeAllPersistedSupplyKeys() {
  for (const key of CLOUD_MIGRATION_CLEAR_KEYS) {
    removePersistedStock(key);
  }
}

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
  persist = true,
): [T[], React.Dispatch<React.SetStateAction<T[]>>] {
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  const [state, setState] = useState<T[]>(() => [...fallbackRef.current]);
  const storageReadyRef = useRef(!persist);

  useEffect(() => {
    if (!persist) return;
    setState(loadPersistedStock(key, fallbackRef.current));
    storageReadyRef.current = true;
  }, [key, persist]);

  useEffect(() => {
    if (!persist || !storageReadyRef.current) return;
    persistStock(key, state);
  }, [key, state, persist]);

  useEffect(() => {
    if (!persist) return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try {
        const parsed = JSON.parse(e.newValue) as T[];
        if (Array.isArray(parsed)) setState(parsed);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key, persist]);

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
  const { userId, organizationId } = useAuth();
  /** Persist when logged in — org is resolved server-side from profile. */
  const useDbPersistence = Boolean(userId);
  const orgIdRef = useRef(organizationId);
  orgIdRef.current = organizationId;
  const persistLocal = !useDbPersistence;
  const [dbHydrated, setDbHydrated] = useState(!useDbPersistence);
  const dbHydratedRef = useRef(dbHydrated);
  dbHydratedRef.current = dbHydrated;
  const catalogSyncSkipRef = useRef(true);
  const snapshotSyncSkipRef = useRef(true);

  const [storeItems, setStoreItems] = usePersistedArrayState<StoreItem>(
    STORE_ITEMS_STORAGE_KEY,
    EMPTY_STORE_ITEMS,
    persistLocal,
  );
  const [pendingStoreItems, setPendingStoreItems] =
    usePersistedArrayState<PendingStoreItem>(PENDING_STORE_ITEMS_KEY, [], persistLocal);
  const [basket, setBasket] = usePersistedArrayState<BasketLine>(
    BASKET_STORAGE_KEY,
    EMPTY_BASKET,
    persistLocal,
  );
  const basketRef = useRef(basket);
  useEffect(() => {
    basketRef.current = basket;
  }, [basket]);
  const [purchaseOrders, setPurchaseOrders] = usePersistedArrayState<PurchaseOrder>(
    PURCHASE_ORDERS_STORAGE_KEY,
    EMPTY_PURCHASE_ORDERS,
    persistLocal,
  );
  const [recipes, setRecipes] = usePersistedArrayState<Recipe>(
    RECIPES_STORAGE_KEY,
    EMPTY_RECIPES,
    true,
  );
  const [kitchenStock, setKitchenStock] = usePersistedArrayState<KitchenStockItem>(
    KITCHEN_STOCK_STORAGE_KEY,
    EMPTY_KITCHEN_STOCK,
    true,
  );
  const [barStock, setBarStock] = usePersistedArrayState<BarStockItem>(
    BAR_STOCK_STORAGE_KEY,
    EMPTY_BAR_STOCK,
    true,
  );
  const [kitchenRawStock, setKitchenRawStock] = usePersistedArrayState<KitchenRawStockItem>(
    KITCHEN_RAW_STOCK_STORAGE_KEY,
    EMPTY_KITCHEN_RAW_STOCK,
    true,
  );
  const [fnbRawStock, setFnbRawStock] = usePersistedArrayState<FnbRawStockItem>(
    FNB_RAW_STOCK_KEY,
    [],
    true,
  );
  const [issueOutLog, setIssueOutLog] = usePersistedArrayState<IssueOutRecord>(
    ISSUE_OUT_LOG_STORAGE_KEY,
    EMPTY_ISSUE_OUT_LOG,
    persistLocal,
  );
  const [batches, setBatches] = usePersistedArrayState<ProductionBatch>(
    BATCHES_STORAGE_KEY,
    EMPTY_BATCHES,
    true,
  );
  const [fnbOrders, setFnbOrders] = useState<FnbMenuItem[]>([]);
  const [orders, setOrders] = useState<FnbOrder[]>([]);
  const [activityLog, setActivityLog] = usePersistedArrayState<ActivityEntry>(
    ACTIVITY_LOG_STORAGE_KEY,
    EMPTY_ACTIVITY_LOG,
    true,
  );

  const recipesRef = useRef(recipes);
  const kitchenStockRef = useRef(kitchenStock);
  const batchesRef = useRef(batches);
  const kitchenRawStockRef = useRef(kitchenRawStock);
  const barStockRef = useRef(barStock);
  const fnbRawStockRef = useRef(fnbRawStock);
  const purchaseOrdersRef = useRef(purchaseOrders);
  const issueOutLogRef = useRef(issueOutLog);
  const activityLogRef = useRef(activityLog);
  const pendingStoreItemsRef = useRef(pendingStoreItems);
  useEffect(() => {
    recipesRef.current = recipes;
    kitchenStockRef.current = kitchenStock;
    batchesRef.current = batches;
    kitchenRawStockRef.current = kitchenRawStock;
    barStockRef.current = barStock;
    fnbRawStockRef.current = fnbRawStock;
    purchaseOrdersRef.current = purchaseOrders;
    issueOutLogRef.current = issueOutLog;
    activityLogRef.current = activityLog;
    pendingStoreItemsRef.current = pendingStoreItems;
  }, [
    recipes,
    kitchenStock,
    batches,
    kitchenRawStock,
    barStock,
    fnbRawStock,
    purchaseOrders,
    issueOutLog,
    activityLog,
    pendingStoreItems,
  ]);

  const persistSnapshotsNow = useCallback(() => {
    if (!useDbPersistence || !dbHydratedRef.current || snapshotSyncSkipRef.current) {
      return;
    }
    void saveSupplySnapshots(
      userId,
      {
        recipes: recipesRef.current,
        batches: batchesRef.current,
        kitchen_stock: kitchenStockRef.current,
        kitchen_raw_stock: kitchenRawStockRef.current,
        bar_stock: barStockRef.current,
        fnb_raw_stock: fnbRawStockRef.current,
        purchase_orders: purchaseOrdersRef.current,
        issue_out_log: issueOutLogRef.current,
        activity_log: activityLogRef.current,
        pending_items: pendingStoreItemsRef.current,
        basket: basketRef.current,
      },
      orgIdRef.current || undefined,
    ).catch((err) => {
      console.error("[supply-chain] immediate snapshot sync failed", err);
      toast.error("Failed to save kitchen data to cloud — refresh may lose changes");
    });
  }, [useDbPersistence, userId]);

  /** Retry snapshot sync until DB hydration finishes (kitchen / outlet stock changes). */
  const schedulePersistSnapshots = useCallback(() => {
    if (!useDbPersistence) return;
    const attempt = (triesLeft: number) => {
      if (dbHydratedRef.current && !snapshotSyncSkipRef.current) {
        persistSnapshotsNow();
        return;
      }
      if (triesLeft > 0) {
        window.setTimeout(() => attempt(triesLeft - 1), 200);
      }
    };
    window.setTimeout(() => attempt(8), 50);
  }, [useDbPersistence, persistSnapshotsNow]);

  /** Load catalogue + JSON snapshots from Supabase when authenticated. */
  useEffect(() => {
    if (!useDbPersistence) return;
    let cancelled = false;
    catalogSyncSkipRef.current = true;
    snapshotSyncSkipRef.current = true;

    void (async () => {
      try {
        const [catalog, snapshots] = await Promise.all([
          fetchSupplyCatalog(userId, organizationId || undefined),
          fetchSupplySnapshots(userId, organizationId || undefined),
        ]);
        if (cancelled) return;

        const localCatalog = loadPersistedStock<StoreItem>(
          STORE_ITEMS_STORAGE_KEY,
          EMPTY_STORE_ITEMS,
        );
        const catalogItems = (
          catalog.length > 0 ? catalog : localCatalog.length > 0 ? localCatalog : []
        ).map(applyStoreItemDeptFields);

        setStoreItems(catalogItems);

        const localRecipes = loadPersistedStock<Recipe>(RECIPES_STORAGE_KEY, EMPTY_RECIPES);
        const localBatches = loadPersistedStock<ProductionBatch>(BATCHES_STORAGE_KEY, EMPTY_BATCHES);
        const localKitchenStock = loadPersistedStock<KitchenStockItem>(
          KITCHEN_STOCK_STORAGE_KEY,
          EMPTY_KITCHEN_STOCK,
        );
        const localKitchenRaw = loadPersistedStock<KitchenRawStockItem>(
          KITCHEN_RAW_STOCK_STORAGE_KEY,
          EMPTY_KITCHEN_RAW_STOCK,
        );
        const localBarStock = loadPersistedStock<BarStockItem>(BAR_STOCK_STORAGE_KEY, EMPTY_BAR_STOCK);
        const localFnbRaw = loadPersistedStock<FnbRawStockItem>(FNB_RAW_STOCK_KEY, []);
        const localActivity = loadPersistedStock<ActivityEntry>(
          ACTIVITY_LOG_STORAGE_KEY,
          EMPTY_ACTIVITY_LOG,
        );

        const mergedRecipes = resolveSupplySnapshot(localRecipes, snapshots.recipes);
        const mergedBatches = resolveSupplySnapshot(localBatches, snapshots.batches);
        const mergedKitchenStock = resolveSupplySnapshot(localKitchenStock, snapshots.kitchen_stock);
        const mergedKitchenRaw = resolveSupplySnapshot(localKitchenRaw, snapshots.kitchen_raw_stock);
        const mergedBarStock = resolveSupplySnapshot(localBarStock, snapshots.bar_stock);
        const mergedFnbRaw = resolveSupplySnapshot(localFnbRaw, snapshots.fnb_raw_stock);
        const mergedActivity = resolveSupplySnapshot(localActivity, snapshots.activity_log);

        if (mergedRecipes.length) setRecipes(mergedRecipes);
        if (mergedBatches.length) setBatches(mergedBatches);
        if (mergedKitchenStock.length) setKitchenStock(mergedKitchenStock);
        if (mergedKitchenRaw.length) setKitchenRawStock(mergedKitchenRaw);
        if (mergedBarStock.length) setBarStock(mergedBarStock);
        if (mergedFnbRaw.length) setFnbRawStock(mergedFnbRaw);
        if (mergedActivity.length) setActivityLog(mergedActivity);
        if (Array.isArray(snapshots.purchase_orders) && snapshots.purchase_orders.length) {
          setPurchaseOrders(snapshots.purchase_orders as PurchaseOrder[]);
        }
        if (Array.isArray(snapshots.issue_out_log) && snapshots.issue_out_log.length) {
          setIssueOutLog(snapshots.issue_out_log as IssueOutRecord[]);
        }
        if (Array.isArray(snapshots.pending_items) && snapshots.pending_items.length) {
          setPendingStoreItems(snapshots.pending_items as PendingStoreItem[]);
        }
        if (Array.isArray(snapshots.basket) && snapshots.basket.length) {
          setBasket(snapshots.basket as BasketLine[]);
        }

        if (catalog.length === 0 && localCatalog.length > 0) {
          await syncSupplyCatalog(userId, localCatalog, organizationId || undefined);
        }

        const localSnapshots = {
          recipes: mergedRecipes,
          batches: mergedBatches,
          kitchen_stock: mergedKitchenStock,
          kitchen_raw_stock: mergedKitchenRaw,
          bar_stock: mergedBarStock,
          fnb_raw_stock: mergedFnbRaw,
          activity_log: mergedActivity,
          purchase_orders: loadPersistedStock<PurchaseOrder>(
            PURCHASE_ORDERS_STORAGE_KEY,
            EMPTY_PURCHASE_ORDERS,
          ),
          issue_out_log: loadPersistedStock<IssueOutRecord>(
            ISSUE_OUT_LOG_STORAGE_KEY,
            EMPTY_ISSUE_OUT_LOG,
          ),
          pending_items: loadPersistedStock<PendingStoreItem>(PENDING_STORE_ITEMS_KEY, []),
          basket: loadPersistedStock<BasketLine>(BASKET_STORAGE_KEY, EMPTY_BASKET),
        };
        const toUpload: Record<string, unknown> = {};
        for (const [key, localRows] of Object.entries(localSnapshots)) {
          const remote = snapshots[key as keyof typeof snapshots];
          const remoteLen = Array.isArray(remote) ? remote.length : 0;
          if (Array.isArray(localRows) && localRows.length > remoteLen) {
            toUpload[key] = localRows;
          }
        }
        if (Object.keys(toUpload).length > 0) {
          await saveSupplySnapshots(userId, toUpload, organizationId || undefined);
        }

        removeAllPersistedSupplyKeys();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load supply data from database";
        console.error("[supply-chain] failed to load from Supabase", err);
        toast.error(message);
        const localCatalog = loadPersistedStock<StoreItem>(
          STORE_ITEMS_STORAGE_KEY,
          EMPTY_STORE_ITEMS,
        );
        if (localCatalog.length > 0) {
          setStoreItems(localCatalog);
        }
      } finally {
        if (!cancelled) {
          setDbHydrated(true);
          window.setTimeout(() => {
            catalogSyncSkipRef.current = false;
            snapshotSyncSkipRef.current = false;
          }, 0);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [useDbPersistence, userId, organizationId]);

  /** Debounced catalogue sync (qty changes from issue-out, PO receive, etc.). */
  useEffect(() => {
    if (!useDbPersistence || !dbHydrated || catalogSyncSkipRef.current) return;
    const timer = window.setTimeout(() => {
      void syncSupplyCatalog(userId, storeItems.map(applyStoreItemDeptFields), orgIdRef.current || undefined).catch((err) => {
        const message =
          err instanceof Error ? err.message : "Failed to sync catalogue to database";
        console.error("[supply-chain] catalogue sync failed", err);
        toast.error(message);
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [useDbPersistence, dbHydrated, userId, storeItems]);

  /** Debounced JSON snapshot sync (kitchen, PO, bar, activity, etc.). */
  useEffect(() => {
    if (!useDbPersistence || !dbHydrated || snapshotSyncSkipRef.current) return;
    const timer = window.setTimeout(() => {
      void saveSupplySnapshots(
        userId,
        {
          recipes,
          batches,
          kitchen_stock: kitchenStock,
          kitchen_raw_stock: kitchenRawStock,
          bar_stock: barStock,
          fnb_raw_stock: fnbRawStock,
          purchase_orders: purchaseOrders,
          issue_out_log: issueOutLog,
          activity_log: activityLog,
          pending_items: pendingStoreItems,
          basket,
        },
        orgIdRef.current || undefined,
      ).catch((err) => {
        console.error("[supply-chain] snapshot sync failed", err);
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    useDbPersistence,
    dbHydrated,
    userId,
    recipes,
    batches,
    kitchenStock,
    kitchenRawStock,
    barStock,
    fnbRawStock,
    purchaseOrders,
    issueOutLog,
    activityLog,
    pendingStoreItems,
    basket,
  ]);

  /** Drop legacy demo kitchen seed (Peppered Chicken / Jollof / Egusi) once per browser. */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const version = Number(window.localStorage.getItem(SUPPLY_STORAGE_VERSION_KEY) || "1");
    if (version >= SUPPLY_STORAGE_VERSION) return;

    const storedRecipes = loadPersistedStock<Recipe>(RECIPES_STORAGE_KEY, EMPTY_RECIPES);
    const storedBatches = loadPersistedStock<ProductionBatch>(BATCHES_STORAGE_KEY, EMPTY_BATCHES);
    const storedKitchenStock = loadPersistedStock<KitchenStockItem>(
      KITCHEN_STOCK_STORAGE_KEY,
      EMPTY_KITCHEN_STOCK,
    );

    if (isLegacyDemoKitchen(storedRecipes, storedBatches, storedKitchenStock)) {
      removePersistedStock(RECIPES_STORAGE_KEY);
      removePersistedStock(BATCHES_STORAGE_KEY);
      removePersistedStock(KITCHEN_STOCK_STORAGE_KEY);
      removePersistedStock(KITCHEN_RAW_STOCK_STORAGE_KEY);
      clearKitchenBatchDraft();
      setRecipes([]);
      setKitchenStock([]);
      setKitchenRawStock([]);
      setBatches([]);
      notifyKitchenRawStockChanged();
    }

    window.localStorage.setItem(SUPPLY_STORAGE_VERSION_KEY, String(SUPPLY_STORAGE_VERSION));
  }, []);

  /** Migrate legacy store dept keys (`bar` → `main_bar`) and strip retired depts. */
  useEffect(() => {
    const migrateDeptRow = <T extends { dept: string; depts?: string[] }>(
      rows: T[],
    ): T[] | null => {
      let changed = false;
      const next = rows.map((row) => {
        const purified = applyStoreItemDeptFields(row as Pick<StoreItem, 'dept' | 'depts'> & T);
        const sameDept = purified.dept === row.dept;
        const sameDepts =
          (purified.depts ?? []).join('|') === (row.depts ?? []).join('|');
        if (sameDept && sameDepts) return row;
        changed = true;
        return purified;
      });
      return changed ? next : null;
    };

    setStoreItems((prev) => migrateDeptRow(prev) ?? prev);
    setPendingStoreItems((prev) => migrateDeptRow(prev) ?? prev);
    setBasket((prev) => {
      const migrated = migrateDeptRow(prev);
      return migrated ?? prev;
    });
  }, []);

  useEffect(() => {
    const reloadFromStorage = (e?: StorageEvent) => {
      if (e && e.key !== PURCHASE_ORDERS_STORAGE_KEY && e.key !== BASKET_STORAGE_KEY) {
        return;
      }
      const orders = loadPersistedStock(PURCHASE_ORDERS_STORAGE_KEY, EMPTY_PURCHASE_ORDERS);
      setPurchaseOrders(orders);
      const active = getActivePurchaseOrder(orders);
      if (active?.lines.length && showsStoreDraftPurchaseList(active)) {
        setBasket(poLinesToBasketLines(active.lines));
      } else if (!active) {
        setBasket(loadPersistedStock(BASKET_STORAGE_KEY, []));
      } else {
        setBasket([]);
      }
    };
    const onStorage = (e: StorageEvent) => {
      reloadFromStorage(e);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const activePurchaseOrder = useMemo(
    () => getActivePurchaseOrder(purchaseOrders),
    [purchaseOrders],
  );

  const basketMigratedRef = useRef(false);

  useEffect(() => {
    if (!activePurchaseOrder) return;
    if (!showsStoreDraftPurchaseList(activePurchaseOrder)) {
      setBasket([]);
      return;
    }
    if (activePurchaseOrder.lines.length) {
      setBasket(poLinesToBasketLines(activePurchaseOrder.lines));
    }
  }, [activePurchaseOrder?.id, activePurchaseOrder?.status]);

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
      meta?: {
        purchaseUnit?: string;
        purchaseQty?: number;
        purchaseUnitPrice?: number;
        storeQty?: number;
        storeUnitPrice?: number;
      },
    ): string | undefined => {
      let err: string | undefined;
      let basketPatch: BasketLine[] | "remove-item" | undefined;
      setPurchaseOrders((prev) => {
        const active = getActivePurchaseOrder(prev);
        if (active && !canEditStorePurchaseOrder(active)) {
          err =
            "Cannot add items — a purchase order is already with the accountant or in approval.";
          return prev;
        }

        if (!Number.isFinite(qty) || qty <= 0) {
          if (!active) {
            basketPatch = "remove-item";
            return prev;
          }
          const nextLines = active.lines.filter(
            (l) => l.stockItemId !== item.id,
          );
          const { total, lines } = recalcPoTotals(nextLines);
          basketPatch = poLinesToBasketLines(lines);
          return prev.map((p) =>
            p.id === active.id
              ? { ...p, lines, totalAmount: total, cashDisbursed: total }
              : p,
          );
        }

        if (!active) {
          const baseLines = basketRef.current.map((b) => basketLineToPoLine(b));
          const existing = baseLines.find((l) => l.stockItemId === item.id);
          const mergedLines = existing
            ? baseLines.map((l) =>
                l.stockItemId === item.id
                  ? storeItemToPoLine(item, qty, unitPrice, l.id, meta)
                  : l,
              )
            : [...baseLines, storeItemToPoLine(item, qty, unitPrice, undefined, meta)];
          const { total, lines } = recalcPoTotals(mergedLines);
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
          basketPatch = poLinesToBasketLines(lines);
          return [po, ...prev];
        }

        const existing = active.lines.find((l) => l.stockItemId === item.id);
        const nextLines = existing
          ? active.lines.map((l) =>
              l.stockItemId === item.id
                ? storeItemToPoLine(item, qty, unitPrice, l.id, meta)
                : l,
            )
          : [...active.lines, storeItemToPoLine(item, qty, unitPrice, undefined, meta)];
        const { total, lines } = recalcPoTotals(nextLines);
        basketPatch = poLinesToBasketLines(lines);
        return prev.map((p) =>
          p.id === active.id
            ? { ...p, lines, totalAmount: total, cashDisbursed: total }
            : p,
        );
      });
      if (basketPatch === "remove-item") {
        setBasket((b) => b.filter((x) => x.stockItemId !== item.id));
      } else if (basketPatch !== undefined) {
        setBasket(basketPatch);
      }
      return err;
    },
    [],
  );

  const addToBasket = useCallback(
    (
      item: StoreItem,
      qty: number,
      unitPrice: number,
      actor?: Actor,
      meta?: {
        purchaseUnit?: string;
        purchaseQty?: number;
        purchaseUnitPrice?: number;
        storeQty?: number;
        storeUnitPrice?: number;
      },
    ) => {
      if (qty <= 0) return;
      upsertActivePoLine(
        item,
        qty,
        unitPrice,
        actor ?? { name: "Store", role: "store" },
        meta,
      );
    },
    [upsertActivePoLine],
  );

  const clearBasket = useCallback((): { ok: true } | { error: string } => {
    const active = getActivePurchaseOrder(purchaseOrders);
    if (active && !canEditStorePurchaseOrder(active)) {
      return {
        error: "Cannot clear — purchase order is locked while in approval.",
      };
    }
    setPurchaseOrders((prev) => {
      const current = getActivePurchaseOrder(prev);
      if (!current || !canEditStorePurchaseOrder(current)) return prev;
      return prev.map((p) =>
        p.id === current.id
          ? { ...p, lines: [], totalAmount: 0, cashDisbursed: 0 }
          : p,
      );
    });
    setBasket([]);
    return { ok: true };
  }, [purchaseOrders]);

  const setBasketLineQty = useCallback(
    (
      item: StoreItem,
      qty: number,
      unitPrice: number,
      actor?: Actor,
      meta?: {
        purchaseUnit?: string;
        purchaseQty?: number;
        purchaseUnitPrice?: number;
        storeQty?: number;
        storeUnitPrice?: number;
      },
    ) => {
      return upsertActivePoLine(
        item,
        qty,
        unitPrice,
        actor ?? { name: "Store", role: "store" },
        meta,
      );
    },
    [upsertActivePoLine],
  );

  const removeFromBasket = useCallback(
    (stockItemId: string): { ok: true } | { error: string } => {
      const active = getActivePurchaseOrder(purchaseOrders);
      if (active && !canEditStorePurchaseOrder(active)) {
        return {
          error: "Cannot remove — purchase order is locked while in approval.",
        };
      }
      let basketPatch: BasketLine[] | undefined;
      setPurchaseOrders((prev) => {
        const current = getActivePurchaseOrder(prev);
        if (!current || !canEditStorePurchaseOrder(current)) return prev;
        const nextLines = current.lines.filter(
          (l) => l.stockItemId !== stockItemId,
        );
        const { total, lines } = recalcPoTotals(nextLines);
        basketPatch = poLinesToBasketLines(lines);
        return prev.map((p) =>
          p.id === current.id
            ? { ...p, lines, totalAmount: total, cashDisbursed: total }
            : p,
        );
      });
      if (basketPatch !== undefined) setBasket(basketPatch);
      return { ok: true };
    },
    [purchaseOrders],
  );

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
            const stockQty =
              rl.stockQuantityBought ??
              (pl.stockQuantityOrdered && pl.quantityOrdered > 0
                ? (rl.quantityBought / pl.quantityOrdered) * pl.stockQuantityOrdered
                : rl.quantityBought);
            const stockUnitPrice =
              rl.actualStockUnitPrice ??
              (stockQty > 0 ? rl.totalPaid / stockQty : rl.actualPrice);
            next[idx] = {
              ...next[idx],
              quantityInStore: next[idx].quantityInStore + stockQty,
              lastPrice: stockUnitPrice,
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
        audience: ["store", "purchasing", "cashier"],
        title: `Retirement accepted — ${po.poNumber}`,
        body: `Central store stock updated. Refund to cashier: ₦${(po.retirement?.refundToCashier ?? 0).toLocaleString()}.`,
        href: "/supply/purchasing",
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
      notifyKitchenRawStockChanged();
    },
    [],
  );

  const returnKitchenRawMaterials = useCallback(
    (lines: { storeItemId: string; quantity: number }[]) => {
      setKitchenRawStock((prev) => {
        const next = [...prev];
        for (const line of lines) {
          const idx = next.findIndex((k) => k.storeItemId === line.storeItemId);
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              quantityOnHand: next[idx].quantityOnHand + line.quantity,
            };
          } else {
            const store = storeItems.find((s) => s.id === line.storeItemId);
            next.push({
              id: `kraw-${line.storeItemId}`,
              storeItemId: line.storeItemId,
              name: store?.name ?? "Material",
              quantityOnHand: line.quantity,
              reorderLevel: store?.reorderLevel ?? 0,
              unit: store?.unit ?? "unit",
            });
          }
        }
        return next;
      });
      notifyKitchenRawStockChanged();
    },
    [storeItems],
  );

  const recipeIngredientCostWithLivePrice = useCallback(
    (ingredient: Recipe["ingredients"][number]): number => {
      if (ingredient.optional) return 0;
      if (Number.isFinite(ingredient.cost) && ingredient.cost > 0) {
        return ingredient.cost;
      }
      if (ingredient.source === "kitchen_stock") {
        const stock = kitchenStock.find((k) => k.id === ingredient.stockItemId);
        const linkedRecipe = stock?.linkedRecipeId
          ? recipes.find((r) => r.id === stock.linkedRecipeId)
          : undefined;
        if (!linkedRecipe || linkedRecipe.yieldPortions <= 0) {
          return Math.max(0, ingredient.cost || 0);
        }
        const linkedCost =
          linkedRecipe.ingredients
            .filter((ing) => !ing.optional)
            .reduce((sum, ing) => sum + Math.max(0, ing.cost || 0), 0) +
          recipeOverheadTotal(linkedRecipe);
        return (linkedCost / linkedRecipe.yieldPortions) * ingredient.quantity;
      }
      const storeItem = storeItems.find((s) => s.id === ingredient.stockItemId);
      if (!storeItem || storeItem.lastPrice <= 0) return Math.max(0, ingredient.cost || 0);
      const factors = mergeUnitFactors(
        ingredient.stockItemId,
        storeItem.unit,
        storeItem.unitFactors,
      );
      return materialCostForUnit(
        ingredient.quantity,
        ingredient.unit,
        storeItem.unit,
        storeItem.lastPrice,
        factors,
      );
    },
    [storeItems, kitchenStock, recipes],
  );

  const recipeTotalCostWithLivePrices = useCallback(
    (recipe: Recipe): number =>
      recipe.ingredients.reduce(
        (sum, ingredient) => sum + recipeIngredientCostWithLivePrice(ingredient),
        0,
      ) + recipeOverheadTotal(recipe),
    [recipeIngredientCostWithLivePrice],
  );

  const recipeCostPerPortionWithLivePrices = useCallback(
    (recipe: Recipe): number =>
      recipe.yieldPortions > 0
        ? Math.round(recipeTotalCostWithLivePrices(recipe) / recipe.yieldPortions)
        : 0,
    [recipeTotalCostWithLivePrices],
  );

  const recipeGrossMarginPctWithLivePrices = useCallback(
    (recipe: Recipe): number => {
      const revenue = recipe.sellingPricePerPortion * recipe.yieldPortions;
      if (revenue <= 0) return 0;
      return Math.round(((revenue - recipeTotalCostWithLivePrices(recipe)) / revenue) * 1000) / 10;
    },
    [recipeTotalCostWithLivePrices],
  );

  const openBatch = useCallback(
    (
      recipeId: string,
      plannedPortions: number,
      actor: Actor,
    ): { ok: true; batch: ProductionBatch } | { error: string } => {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) return { error: "Batch standard not found" };
      if (!Number.isFinite(plannedPortions) || plannedPortions <= 0) {
        return { error: "Enter planned portions" };
      }

      const inProgress = batches.find(
        (b) => b.recipeId === recipeId && b.status === "in_progress",
      );
      if (inProgress) {
        return {
          error: `${recipe.name} already has a production run in progress. Close it before opening another.`,
        };
      }

      const kitchenRow = kitchenStock.find((k) => k.linkedRecipeId === recipeId);
      const scale =
        recipe.yieldPortions > 0 ? plannedPortions / recipe.yieldPortions : 1;
      const materialLines = recipe.ingredients
        .filter((ing) => !ing.optional)
        .map((ing) => ({
          storeItemId: ing.stockItemId,
          name: ing.name,
          unit: ing.unit,
          quantity: Math.round(ing.quantity * scale * 1000) / 1000,
          source: ing.source ?? "raw",
        }));

      const totalRecipeCost = recipeTotalCostWithLivePrices(recipe);
      const batchCost =
        (totalRecipeCost / Math.max(1, recipe.yieldPortions)) * plannedPortions;

      const batch: ProductionBatch = {
        id: uid("bat"),
        recipeId,
        recipeName: recipe.name,
        shift: "Production",
        status: "in_progress",
        plannedPortions,
        actualPortions: 0,
        foodCostPct: recipeGrossMarginPctWithLivePrices(recipe),
        variancePct: 0,
        batchCost,
        sellingPricePerPortion: recipe.sellingPricePerPortion,
        materialsUsed: materialLines.map(
          (i) => `${i.quantity} ${i.unit} ${i.name}`,
        ),
        kitchenStockId: kitchenRow?.id,
        openedAt: new Date().toISOString(),
        openedBy: actor.name,
        createdBy: actor.name,
      };
      setBatches((b) => [batch, ...b]);
      setActivityLog((a) =>
        log(
          a,
          "batch_opened",
          actor,
          `Production run opened: ${recipe.name} — ${plannedPortions} portions (raw stock deducts on close)`,
          batch.id,
        ),
      );
      schedulePersistSnapshots();
      return { ok: true, batch };
    },
    [
      recipes,
      kitchenStock,
      batches,
      recipeTotalCostWithLivePrices,
      recipeGrossMarginPctWithLivePrices,
      schedulePersistSnapshots,
    ],
  );

  const openKitchenBatchFromMaterials = useCallback(
    (
      input: CreateKitchenBatchInput,
      actor: Actor,
    ): { ok: true; kitchenStockId: string; recipeId: string } | { error: string } => {
      const batchName = toTitleCaseWords(input.batchName);
      const menuCategory = toTitleCaseWords(input.menuCategory);
      if (!batchName) return { error: "Enter a batch / menu name" };
      if (!menuCategory) return { error: "Select a menu category for the restaurant" };
      if (!Number.isFinite(input.plannedPortions) || input.plannedPortions <= 0) {
        return { error: "Enter planned portions for this batch" };
      }

      const materials = input.materials.filter((m) => m.quantity > 0);
      for (const line of materials) {
        if (line.source === "kitchen_stock") continue;
        const store = storeItems.find((s) => s.id === line.storeItemId);
        if (store && store.dept !== "kitchen") {
          return { error: `${line.name} is not a kitchen store item` };
        }
      }

      const overheadLabour = Math.max(0, input.overheadLabour ?? 0);
      const overheadGas = Math.max(0, input.overheadGas ?? 0);
      const overheadOther = Math.max(0, input.overheadOther ?? 0);
      const ingredientCost = materials
        .filter((line) => !line.optional)
        .reduce(
          (sum, line) => sum + (line.lineCost ?? line.quantity * line.unitCost),
          0,
        );
      const batchCost = ingredientCost + overheadLabour + overheadGas + overheadOther;
      const sell = Math.max(0, input.sellingPricePerPortion);
      const revenue = sell * input.plannedPortions;
      const marginPct =
        revenue > 0 ? Math.round(((revenue - batchCost) / revenue) * 1000) / 10 : 0;


      const kitchenStockId =
        input.kitchenStockId?.trim() || `ks-${outletStockSlug(batchName)}`;
      const recipeId = `rcp-${outletStockSlug(batchName)}`;
      const yieldUnit = input.yieldUnit || "portion";

      setKitchenStock((prev) => {
        const idx = prev.findIndex((k) => k.id === kitchenStockId);
        if (idx >= 0) {
          return prev.map((k, i) =>
            i === idx
              ? {
                  ...k,
                  name: batchName,
                  source: "produced" as const,
                  unit: yieldUnit,
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
            availablePortions: 0,
            unit: yieldUnit,
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
        yieldUnit,
        yieldLabel: `${input.plannedPortions} ${yieldUnit}`,
        ingredients: materials.map((m) => ({
          stockItemId: m.storeItemId,
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          cost: m.lineCost ?? m.quantity * m.unitCost,
          source: m.source ?? "raw",
          optional: m.optional,
        })),
        overheadCost: overheadLabour + overheadGas + overheadOther,
        overheadLabour,
        overheadGas,
        overheadOther,
        sellingPricePerPortion: sell,
        outletMenuSync: normalizeBatchOutletMenuSync(
          input.outletMenuSync ?? input.fnbEligible,
        ),
      };
      setRecipes((prev) => {
        const idx = prev.findIndex((r) => r.id === recipeId || r.name === batchName);
        if (idx >= 0) {
          return prev.map((r, i) => (i === idx ? { ...recipeRow, id: r.id } : r));
        }
        return [recipeRow, ...prev];
      });

      setActivityLog((a) =>
        log(
          a,
          "recipe_updated",
          actor,
          `Batch standard saved: ${batchName} — ${input.plannedPortions} std portions, ${materials.length} ingredient(s). Open a production run from All Batches when ready.`,
          recipeId,
        ),
      );
      schedulePersistSnapshots();
      return { ok: true, kitchenStockId, recipeId };
    },
    [storeItems, schedulePersistSnapshots],
  );

  const updateRecipe = useCallback(
    (
      recipeId: string,
      patch: {
        name?: string;
        category?: string;
        yieldPortions?: number;
        yieldUnit?: string;
        sellingPricePerPortion?: number;
        overheadCost?: number;
        overheadLabour?: number;
        overheadGas?: number;
        overheadOther?: number;
        outletMenuSync?: import("./types").BatchOutletMenuSync;
        /** @deprecated */
        fnbEligible?: boolean;
        ingredients?: Recipe["ingredients"];
      },
      actor: Actor,
    ):
      | { ok: true; kitchenStockId: string; menuItemName: string; category: string; outletMenuSync: import("./types").BatchOutletMenuSync }
      | { error: string } => {
      const existing = recipes.find((r) => r.id === recipeId);
      if (!existing) return { error: "Batch standard not found" };

      const name = toTitleCaseWords(patch.name ?? existing.name);
      const category = toTitleCaseWords(patch.category ?? existing.category);
      const yieldPortions = patch.yieldPortions ?? existing.yieldPortions;
      const yieldUnit = patch.yieldUnit ?? existing.yieldUnit ?? "portion";
      const sellingPricePerPortion =
        patch.sellingPricePerPortion ?? existing.sellingPricePerPortion;
      const overheadLabour = patch.overheadLabour ?? existing.overheadLabour ?? 0;
      const overheadGas = patch.overheadGas ?? existing.overheadGas ?? 0;
      const overheadOther =
        patch.overheadOther ?? existing.overheadOther ?? patch.overheadCost ?? existing.overheadCost ?? 0;
      const ingredients = patch.ingredients ?? existing.ingredients;
      const outletMenuSync = normalizeBatchOutletMenuSync(
        patch.outletMenuSync ?? patch.fnbEligible ?? existing.outletMenuSync ?? existing.fnbEligible,
      );

      if (!name) return { error: "Enter a batch name" };
      if (!category) return { error: "Enter a menu category" };
      if (!Number.isFinite(yieldPortions) || yieldPortions <= 0) {
        return { error: "Enter valid planned portions" };
      }

      const overheadCost = overheadLabour + overheadGas + overheadOther;
      const updated: Recipe = {
        ...existing,
        name,
        category,
        yieldPortions,
        yieldUnit,
        yieldLabel: `${yieldPortions} ${yieldUnit}`,
        sellingPricePerPortion,
        overheadCost,
        overheadLabour,
        overheadGas,
        overheadOther,
        outletMenuSync,
        ingredients,
      };

      const kitchenRow = kitchenStock.find((k) => k.linkedRecipeId === recipeId);
      const kitchenStockId =
        kitchenRow?.id ?? `ks-${outletStockSlug(name)}`;

      setRecipes((prev) =>
        prev.map((r) => (r.id === recipeId ? updated : r)),
      );
      setKitchenStock((prev) =>
        prev.map((k) =>
          k.linkedRecipeId === recipeId ? { ...k, name, unit: yieldUnit } : k,
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
      schedulePersistSnapshots();
      return { ok: true, kitchenStockId, menuItemName: name, category, outletMenuSync };
    },
    [recipes, kitchenStock, schedulePersistSnapshots],
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
      schedulePersistSnapshots();
      return { ok: true };
    },
    [recipes, batches, schedulePersistSnapshots],
  );

  /** Wipe kitchen finished stock, raw-from-store, batch standards, production runs, and batch draft. Categories stay in Restaurant outlet DB. */
  const clearKitchenRestaurantMenu = useCallback((actor: Actor) => {
    const recipeCount = recipes.length;
    const stockCount = kitchenStock.length;
    const batchCount = batches.length;
    const rawCount = kitchenRawStock.length;
    const kitchenIssueCount = issueOutLog.filter((r) => {
      const d = r.destination.trim().toLowerCase();
      return d === "kitchen" || d.includes("kitchen");
    }).length;

    setRecipes([]);
    setKitchenStock([]);
    setKitchenRawStock([]);
    setBatches([]);
    setIssueOutLog((prev) =>
      prev.filter((r) => {
        const d = r.destination.trim().toLowerCase();
        return d !== "kitchen" && !d.includes("kitchen");
      }),
    );
    removePersistedStock(RECIPES_STORAGE_KEY);
    removePersistedStock(BATCHES_STORAGE_KEY);
    removePersistedStock(KITCHEN_STOCK_STORAGE_KEY);
    removePersistedStock(KITCHEN_RAW_STOCK_STORAGE_KEY);
    clearKitchenBatchDraft();
    notifyKitchenRawStockChanged();

    setActivityLog((a) =>
      log(
        a,
        "recipe_updated",
        actor,
        `Cleared kitchen menu — ${recipeCount} batch standard(s), ${stockCount} finished stock, ${rawCount} raw material row(s), ${batchCount} production record(s)`,
      ),
    );

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("frontbill:outlet-menu-cleared"));
    }

    schedulePersistSnapshots();

    return {
      ok: true as const,
      recipesCleared: recipeCount,
      stockCleared: stockCount,
      rawStockCleared: rawCount,
      kitchenIssuesCleared: kitchenIssueCount,
      batchesCleared: batchCount,
    };
  }, [recipes, kitchenStock, kitchenRawStock, issueOutLog, batches, schedulePersistSnapshots]);

  const deleteInProgressBatch = useCallback(
    (batchId: string, actor: Actor): { ok: true } | { error: string } => {
      const batch = batches.find((b) => b.id === batchId);
      if (!batch) return { error: "Production batch not found" };
      if (batch.status !== "in_progress") {
        return { error: "Only in-progress batches can be deleted" };
      }

      if (batch.deductedMaterials?.length) {
        returnKitchenRawMaterials(batch.deductedMaterials);
      }

      setBatches((prev) => prev.filter((b) => b.id !== batchId));
      setActivityLog((a) =>
        log(
          a,
          "batch_closed",
          actor,
          `Deleted in-progress production run "${batch.recipeName}" (no stock was moved)`,
          batchId,
        ),
      );
      schedulePersistSnapshots();
      return { ok: true };
    },
    [batches, returnKitchenRawMaterials, schedulePersistSnapshots],
  );

  const clearAllStoreItems = useCallback((actor: Actor) => {
    const count = storeItems.length;
    setStoreItems([]);
    setActivityLog((a) =>
      log(
        a,
        "stock_received",
        actor,
        `Cleared central store catalogue (${count} item(s))`,
      ),
    );
    return { ok: true as const, cleared: count };
  }, [storeItems]);

  const clearSupplyHistory = useCallback((_actor: Actor) => {
    const poCount = purchaseOrders.length;
    const issueCount = issueOutLog.length;
    const activityCount = activityLog.length;
    setPurchaseOrders([]);
    setBasket([]);
    setIssueOutLog([]);
    setActivityLog([]);
    return {
      ok: true as const,
      purchaseOrdersCleared: poCount,
      issueOutCleared: issueCount,
      activityCleared: activityCount,
    };
  }, [purchaseOrders, issueOutLog, activityLog]);

  const clearAllSupplyChainData = useCallback((actor: Actor) => {
    setStoreItems([]);
    setPendingStoreItems([]);
    setPurchaseOrders([]);
    setBasket([]);
    setRecipes([]);
    setKitchenStock([]);
    setKitchenRawStock([]);
    setFnbRawStock([]);
    setBarStock([]);
    setBatches([]);
    setIssueOutLog([]);
    setActivityLog([]);
    removeAllPersistedSupplyKeys();
    clearKitchenBatchDraft();
    notifyKitchenRawStockChanged();
    notifyBarStockChanged();
    notifyFnbRawStockChanged();
    notifyIssueOutLogChanged();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("frontbill:outlet-menu-cleared"));
    }
    void actor;
    return { ok: true as const };
  }, []);

  const addStoreItemDirect = useCallback(
    (
      input: Omit<StoreItem, "id"> & { name: string },
      actor: Actor,
    ): { ok: true; item: StoreItem } | { error: string } => {
      const name = toTitleCaseWords(input.name);
      if (!name) return { error: "Enter an item name" };
      if (!input.unit.trim()) return { error: "Enter SI unit" };
      const duplicate = storeItems.find(
        (s) => s.name.trim().toLowerCase() === name.trim().toLowerCase(),
      );
      if (duplicate) {
        return { error: `"${name}" already exists in central store` };
      }
      const deptInput = input.depts?.length
        ? input.depts
        : [input.dept];
      const { dept, depts } = normalizeStoreItemDepts(deptInput);
      const item: StoreItem = applyStoreItemDeptFields({
        id: uid("si"),
        name,
        unit: input.unit.trim(),
        dept,
        depts,
        quantityInStore: Math.max(0, input.quantityInStore),
        reorderLevel: Math.max(0, input.reorderLevel),
        lastPrice: Math.max(0, input.lastPrice),
        benchmarkPrice: Math.max(0, input.benchmarkPrice || input.lastPrice),
        kitchenCategory: input.kitchenCategory,
        unitFactors: input.unitFactors,
      });
      setStoreItems((prev) => [item, ...prev]);
      setActivityLog((a) =>
        log(a, "stock_received", actor, `Added store item: ${name}`, item.id),
      );
      if (useDbPersistence) {
        catalogSyncSkipRef.current = true;
        void insertSupplyCatalogItem(userId, item, orgIdRef.current || undefined)
          .catch((err) => {
            setStoreItems((prev) => prev.filter((s) => s.id !== item.id));
            const message =
              err instanceof Error ? err.message : "Failed to save item to database";
            toast.error(message);
          })
          .finally(() => {
            catalogSyncSkipRef.current = false;
          });
      }
      return { ok: true, item };
    },
    [useDbPersistence, userId, storeItems],
  );

  const updateStoreItemDirect = useCallback(
    (
      itemId: string,
      input: Partial<Omit<StoreItem, "id">>,
      actor: Actor,
    ): { ok: true } | { error: string } => {
      const existing = storeItems.find((s) => s.id === itemId);
      if (!existing) return { error: "Store item not found" };
      const name = input.name != null ? toTitleCaseWords(input.name) : existing.name;
      if (!name) return { error: "Enter an item name" };
      const { dept: _inputDept, depts: _inputDepts, ...restInput } = input;
      const deptFields =
        input.depts != null || input.dept != null
          ? storeItemDeptFieldsForDb({
              dept: (input.dept ?? existing.dept) as Exclude<SupplyDept, 'all'>,
              depts: input.depts?.length
                ? input.depts
                : input.dept != null
                  ? [input.dept]
                  : undefined,
            })
          : null;
      let nextItem: StoreItem = applyStoreItemDeptFields({
        ...existing,
        ...restInput,
        name,
        unit: input.unit?.trim() || existing.unit,
        quantityInStore:
          input.quantityInStore != null
            ? Math.max(0, input.quantityInStore)
            : existing.quantityInStore,
        reorderLevel:
          input.reorderLevel != null
            ? Math.max(0, input.reorderLevel)
            : existing.reorderLevel,
        lastPrice:
          input.lastPrice != null ? Math.max(0, input.lastPrice) : existing.lastPrice,
        benchmarkPrice:
          input.benchmarkPrice != null
            ? Math.max(0, input.benchmarkPrice)
            : existing.benchmarkPrice,
        ...(deptFields
          ? {
              dept: deptFields.dept,
              depts: deptFields.depts.length > 1 ? deptFields.depts : undefined,
            }
          : {}),
      });
      setStoreItems((prev) =>
        prev.map((s) => (s.id === itemId ? nextItem : s)),
      );
      setActivityLog((a) =>
        log(a, "stock_received", actor, `Updated store item: ${name}`, itemId),
      );
      if (useDbPersistence) {
        catalogSyncSkipRef.current = true;
        void updateSupplyCatalogItem(
          userId,
          itemId,
          {
            ...nextItem,
            ...storeItemDeptFieldsForDb(nextItem),
          },
          orgIdRef.current || undefined,
        )
          .catch((err) => {
            const message =
              err instanceof Error ? err.message : "Failed to update item in database";
            toast.error(message);
          })
          .finally(() => {
            catalogSyncSkipRef.current = false;
          });
      }
      return { ok: true };
    },
    [storeItems, useDbPersistence, userId],
  );

  const deleteStoreItemDirect = useCallback(
    (itemId: string, actor: Actor): { ok: true } | { error: string } => {
      const existing = storeItems.find((s) => s.id === itemId);
      if (!existing) return { error: "Store item not found" };
      setStoreItems((prev) => prev.filter((s) => s.id !== itemId));
      setBasket((prev) => prev.filter((b) => b.stockItemId !== itemId));
      setActivityLog((a) =>
        log(
          a,
          "stock_received",
          actor,
          `Deleted store item: ${existing.name}`,
          itemId,
        ),
      );
      if (useDbPersistence) {
        catalogSyncSkipRef.current = true;
        void deleteSupplyCatalogItem(userId, itemId, orgIdRef.current || undefined)
          .catch((err) => {
            const message =
              err instanceof Error ? err.message : "Failed to delete item from database";
            toast.error(message);
          })
          .finally(() => {
            catalogSyncSkipRef.current = false;
          });
      }
      return { ok: true };
    },
    [storeItems, useDbPersistence, userId],
  );

  const submitStoreItemForApproval = useCallback(
    (
      input: Omit<PendingStoreItem, "id" | "status" | "submittedAt" | "submittedBy" | "submittedByName"> & {
        name: string;
        submittedBy: string;
        submittedByName: string;
      },
      actor: Actor,
    ): { ok: true } | { error: string; shortages?: StockShortageLine[] } => {
      const name = toTitleCaseWords(input.name);
      if (!name) return { error: "Enter an item name" };
      if (!input.unit.trim()) return { error: "Enter SI unit" };
      const duplicate = storeItems.find(
        (s) => s.name.trim().toLowerCase() === name.trim().toLowerCase(),
      );
      if (duplicate) {
        return { error: `"${name}" already exists in central store` };
      }
      const deptInput = input.depts?.length ? input.depts : [input.dept];
      const normalized = normalizeStoreItemDepts(deptInput);
      const row: PendingStoreItem = {
        id: uid("psi"),
        name,
        unit: input.unit.trim(),
        dept: normalized.dept,
        depts: normalized.depts,
        quantityInStore: Math.max(0, input.quantityInStore),
        reorderLevel: Math.max(0, input.reorderLevel),
        lastPrice: Math.max(0, input.lastPrice),
        benchmarkPrice: Math.max(0, input.benchmarkPrice || input.lastPrice),
        kitchenCategory: input.kitchenCategory,
        unitFactors: input.unitFactors,
        status: "pending",
        submittedBy: input.submittedBy,
        submittedByName: input.submittedByName,
        submittedAt: new Date().toISOString(),
      };
      setPendingStoreItems((prev) => [row, ...prev]);
      setActivityLog((a) =>
        log(
          a,
          "stock_received",
          actor,
          `Store item submitted for approval: ${name}`,
          row.id,
        ),
      );
      pushSupplyNotification({
        audience: ["manager"],
        title: `Store item pending approval`,
        body: `${input.submittedByName} submitted "${name}" for central store.`,
        href: "/supply/store",
      });
      return { ok: true };
    },
    [],
  );

  const approvePendingStoreItem = useCallback(
    (pendingId: string, actor: Actor): { ok: true } | { error: string } => {
      const pending = pendingStoreItems.find((p) => p.id === pendingId);
      if (!pending || pending.status !== "pending") {
        return { error: "Pending item not found" };
      }
      const res = addStoreItemDirect(
        {
          name: pending.name,
          unit: pending.unit,
          dept: pending.dept,
          depts: pending.depts,
          quantityInStore: pending.quantityInStore,
          reorderLevel: pending.reorderLevel,
          lastPrice: pending.lastPrice,
          benchmarkPrice: pending.benchmarkPrice,
          kitchenCategory: pending.kitchenCategory,
          unitFactors: pending.unitFactors,
        },
        actor,
      );
      if ("error" in res) return res;
      setPendingStoreItems((prev) =>
        prev.map((p) =>
          p.id === pendingId
            ? {
                ...p,
                status: "approved" as const,
                reviewedBy: actor.name,
                reviewedAt: new Date().toISOString(),
              }
            : p,
        ),
      );
      return { ok: true };
    },
    [pendingStoreItems, addStoreItemDirect],
  );

  const rejectPendingStoreItem = useCallback(
    (pendingId: string, actor: Actor): { ok: true } | { error: string } => {
      const pending = pendingStoreItems.find((p) => p.id === pendingId);
      if (!pending || pending.status !== "pending") {
        return { error: "Pending item not found" };
      }
      setPendingStoreItems((prev) =>
        prev.map((p) =>
          p.id === pendingId
            ? {
                ...p,
                status: "rejected" as const,
                reviewedBy: actor.name,
                reviewedAt: new Date().toISOString(),
              }
            : p,
        ),
      );
      return { ok: true };
    },
    [pendingStoreItems],
  );

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
    ): { ok: true } | { error: string; shortages?: StockShortageLine[] } => {
      const batch = batches.find((b) => b.id === batchId);
      if (!batch) return { error: "Production batch not found" };
      if (batch.status !== "in_progress") {
        return { error: "This production run is already closed" };
      }
      if (!Number.isFinite(actualPortions) || actualPortions <= 0) {
        return { error: "Enter valid portions to close" };
      }

      const recipe = batch.recipeId
        ? recipes.find((r) => r.id === batch.recipeId)
        : undefined;

      const scale =
        recipe && recipe.yieldPortions > 0
          ? actualPortions / recipe.yieldPortions
          : 1;
      const materialLines =
        recipe?.ingredients
          .filter((ing) => !ing.optional)
          .map((ing) => ({
            storeItemId: ing.stockItemId,
            name: ing.name,
            unit: ing.unit,
            quantity: Math.round(ing.quantity * scale * 1000) / 1000,
            source: ing.source ?? "raw",
          })) ?? [];

      const shortages: StockShortageLine[] = [];
      for (const line of materialLines) {
        if (line.quantity <= 0) continue;
        let stockQuantity = 0;
        let stockUnit = line.unit;
        if (line.source === "kitchen_stock") {
          const stock = kitchenStock.find((k) => k.id === line.storeItemId);
          stockQuantity = stock?.availablePortions ?? 0;
          stockUnit = stock?.unit ?? line.unit;
        } else {
          const stock = kitchenRawStock.find((k) => k.storeItemId === line.storeItemId);
          stockQuantity = stock?.quantityOnHand ?? kitchenRawOnHand(line.storeItemId);
          stockUnit = stock?.unit ?? line.unit;
        }
        const onHand = convertMaterialQuantity(stockQuantity, stockUnit, line.unit);
        if (onHand < line.quantity) {
          shortages.push({
            name: line.name,
            need: line.quantity,
            onHand,
            unit: line.unit,
          });
        }
      }

      if (shortages.length) {
        return {
          error:
            shortages.length === 1
              ? `Insufficient ${shortages[0].name} in kitchen raw stock. Issue from store first.`
              : `${shortages.length} raw materials are short for this batch. Issue from store first.`,
          shortages,
        };
      }

      if (materialLines.length) {
        deductKitchenRawMaterials(
          materialLines
            .filter((l) => l.quantity > 0 && l.source !== "kitchen_stock")
            .map((l) => ({
              storeItemId: l.storeItemId,
              quantity: materialLineQuantityInStockUnit(
                l,
                kitchenRawStock.find((k) => k.storeItemId === l.storeItemId)?.unit ?? l.unit,
              ),
            })),
        );
        const kitchenStockLines = materialLines
          .filter((l) => l.quantity > 0 && l.source === "kitchen_stock")
          .map((line) => ({
            ...line,
            quantityInStockUnit: materialLineQuantityInStockUnit(
              line,
              kitchenStock.find((k) => k.id === line.storeItemId)?.unit ?? line.unit,
            ),
          }));
        if (kitchenStockLines.length) {
          setKitchenStock((prev) =>
            prev.map((k) => {
              const line = kitchenStockLines.find((l) => l.storeItemId === k.id);
              if (!line) return k;
              return {
                ...k,
                availablePortions: Math.max(0, k.availablePortions - line.quantityInStockUnit),
              };
            }),
          );
        }
      }

      const foodCost =
        batch.batchCost && batch.batchCost > 0
          ? batch.batchCost
          : recipe
            ? (recipeTotalCostWithLivePrices(recipe) / Math.max(1, recipe.yieldPortions)) *
              actualPortions
            : 0;
      const foodCostPct =
        batch.batchCost && batch.batchCost > 0
          ? batch.foodCostPct
          : recipe
            ? recipeGrossMarginPctWithLivePrices(recipe)
            : 0;
      const variancePct =
        batch.plannedPortions > 0
          ? Math.round(
              ((actualPortions - batch.plannedPortions) /
                batch.plannedPortions) *
                1000,
            ) / 10
          : 0;

      const sellable =
        actualPortions -
        disposition.staff -
        disposition.waste -
        disposition.returned;

      setBatches((prev) =>
        prev.map((b) =>
          b.id === batchId
            ? {
                ...b,
                status: "completed",
                actualPortions,
                foodCostPct,
                variancePct,
                batchCost: foodCost,
                closedAt: new Date().toISOString(),
                disposition,
                deductedMaterials: materialLines
                  .filter((l) => l.quantity > 0 && l.source !== "kitchen_stock")
                  .map((l) => ({
                    storeItemId: l.storeItemId,
                    quantity: materialLineQuantityInStockUnit(
                      l,
                      kitchenRawStock.find((k) => k.storeItemId === l.storeItemId)?.unit ?? l.unit,
                    ),
                  })),
                deductedKitchenStock: materialLines
                  .filter((l) => l.quantity > 0 && l.source === "kitchen_stock")
                  .map((l) => ({
                    kitchenStockId: l.storeItemId,
                    quantity: materialLineQuantityInStockUnit(
                      l,
                      kitchenStock.find((k) => k.id === l.storeItemId)?.unit ?? l.unit,
                    ),
                  })),
                materialsUsed: materialLines.map(
                  (i) => `${i.quantity} ${i.unit} ${i.name}`,
                ),
              }
            : b,
        ),
      );

      const stockId =
        batch.kitchenStockId ??
        (recipe
          ? kitchenStock.find((k) => k.linkedRecipeId === recipe.id)?.id
          : undefined);
      if (stockId && sellable > 0) {
        setKitchenStock((ks) => {
          const idx = ks.findIndex((k) => k.id === stockId);
          if (idx >= 0) {
            return ks.map((k, i) =>
              i === idx
                ? { ...k, availablePortions: k.availablePortions + sellable }
                : k,
            );
          }
          return [
            ...ks,
            {
              id: stockId,
              name: batch.recipeName,
              source: "produced" as const,
              availablePortions: sellable,
              reorderLevel: Math.max(2, Math.ceil(sellable * 0.15)),
              linkedRecipeId: recipe?.id,
            },
          ];
        });
      }

      setActivityLog((a) =>
        log(
          a,
          "batch_closed",
          actor,
          `Closed ${batch.recipeName}: ${actualPortions} portions produced, ${sellable} to finished stock. Raw materials deducted.`,
          batchId,
        ),
      );
      schedulePersistSnapshots();
      return { ok: true };
    },
    [
      batches,
      recipes,
      kitchenStock,
      kitchenRawStock,
      kitchenRawOnHand,
      deductKitchenRawMaterials,
      recipeTotalCostWithLivePrices,
      recipeGrossMarginPctWithLivePrices,
      schedulePersistSnapshots,
    ],
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
      schedulePersistSnapshots();
      return { order };
    },
    [fnbOrders, kitchenStock, schedulePersistSnapshots],
  );

  const issueFromStoreToBar = useCallback(
    (
      storeItemId: string,
      qty: number,
      actor: Actor,
      opts?: {
        destination?: string;
        receivedBy?: string;
        receivedById?: string;
        notes?: string;
        issueUnit?: string;
      },
    ) => {
      if (qty <= 0) return { error: "Enter a quantity to issue" };
      const store = storeItems.find((s) => s.id === storeItemId);
      if (!store || !isBarStoreDept(store.dept)) {
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

      const dest = opts?.destination?.trim() || "Main Bar";
      const receivedBy = opts?.receivedBy?.trim() || actor.name;
      const displayUnit = opts?.issueUnit?.trim() || store.unit;
      const displayQty =
        displayUnit === store.unit
          ? qty
          : Math.round(qty * 1000) / 1000;

      setIssueOutLog((prev) => [
        {
          id: uid("issue"),
          storeItemId,
          itemName: store.name,
          unit: displayUnit,
          quantity: displayQty,
          destination: dest,
          receivedBy,
          receivedById: opts?.receivedById,
          notes: opts?.notes,
          issuedAt: new Date().toISOString(),
          issuedBy: actor.name,
        },
        ...prev,
      ]);

      setActivityLog((a) =>
        log(
          a,
          "stock_issued_bar",
          actor,
          `Issued ${displayQty} ${displayUnit} ${store.name} from store → ${dest}`,
          storeItemId,
        ),
      );
      setActivityLog((a) =>
        log(
          a,
          "stock_issued_out",
          actor,
          `Stock out: ${displayQty} ${displayUnit} ${store.name} → ${dest}`,
          storeItemId,
        ),
      );
      notifyBarStockChanged();
      notifyIssueOutLogChanged();
      schedulePersistSnapshots();
      return { ok: true as const };
    },
    [storeItems, schedulePersistSnapshots],
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

  function destinationCreditsFnbRaw(destination: string): boolean {
    const d = destination.trim().toLowerCase();
    return d === "restaurant" || d.includes("fnb") || d.includes("food");
  }

  const issueFromStoreToDepartment = useCallback(
    (
      storeItemId: string,
      qty: number,
      destination: string,
      actor: Actor,
      opts?: {
        notes?: string;
        receivedBy?: string;
        receivedById?: string;
        issueUnit?: string;
        issueDisplayQty?: number;
      },
    ): { ok: true } | { error: string } => {
      const dest = destination.trim();
      if (!dest) return { error: "Select a destination department or outlet" };
      const receivedBy = opts?.receivedBy?.trim();
      if (!receivedBy) return { error: "Received by is required" };

      const store = storeItems.find((s) => s.id === storeItemId);
      if (!store) return { error: "Item not found" };
      if (!Number.isFinite(qty) || qty <= 0)
        return { error: "Enter a quantity to issue" };
      if (store.quantityInStore < qty) {
        return {
          error: `Insufficient stock (${store.quantityInStore} ${store.unit} on hand)`,
        };
      }

      if (isBarStoreDept(store.dept) && destinationCreditsBarStock(dest)) {
        const barRes = issueFromStoreToBar(storeItemId, qty, actor, {
          destination: dest,
          receivedBy,
          receivedById: opts?.receivedById,
          notes: opts?.notes,
          issueUnit: opts?.issueUnit,
        });
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

      if (isBarStoreDept(store.dept) && destinationCreditsFnbRaw(dest)) {
        setFnbRawStock((prev) => {
          const idx = prev.findIndex((f) => f.storeItemId === storeItemId);
          if (idx >= 0) {
            return prev.map((f, i) =>
              i === idx ? { ...f, quantityOnHand: f.quantityOnHand + qty } : f,
            );
          }
          return [
            ...prev,
            {
              id: `fnb-${storeItemId}`,
              storeItemId,
              name: store.name,
              quantityOnHand: qty,
              reorderLevel: store.reorderLevel,
              unit: store.unit,
            },
          ];
        });
        notifyFnbRawStockChanged();
      }

      const displayUnit = opts?.issueUnit?.trim() || store.unit;
      const displayQty = opts?.issueDisplayQty ?? qty;

      const extra = [
        `Received by: ${receivedBy}`,
        opts?.notes?.trim() ?? "",
      ]
        .filter(Boolean)
        .join(" · ");

      const summary = `Stock out: ${displayQty} ${displayUnit} ${store.name} → ${dest} (${extra})`;

      setIssueOutLog((prev) => [
        {
          id: uid("issue"),
          storeItemId,
          itemName: store.name,
          unit: displayUnit,
          quantity: displayQty,
          destination: dest,
          receivedBy,
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
      notifyIssueOutLogChanged();
      schedulePersistSnapshots();
      return { ok: true as const };
    },
    [storeItems, issueFromStoreToBar, schedulePersistSnapshots],
  );

  const issueOutCart = useCallback(
    (
      lines: IssueOutCartLine[],
      destination: string,
      actor: Actor,
      opts: { receivedBy: string; receivedById?: string; notes?: string },
    ): { ok: true; issued: number } | { error: string; shortages?: StockShortageLine[] } => {
      if (!lines.length) return { error: "Add at least one item to the issue cart" };
      const receivedBy = opts.receivedBy?.trim();
      if (!receivedBy) return { error: "Received by is required" };

      const shortages: StockShortageLine[] = [];
      for (const line of lines) {
        if (!Number.isFinite(line.quantity) || line.quantity <= 0) {
          return { error: `Enter quantity for ${line.name}` };
        }
        const storeUnit = line.storeUnit || line.unit;
        const storeItem = storeItems.find((s) => s.id === line.storeItemId);
        const factors = storeItem
          ? mergeUnitFactors(line.storeItemId, storeItem.unit, storeItem.unitFactors)
          : undefined;
        const storeQty = convertToStoreUnitsWithFactors(
          line.quantity,
          line.unit,
          storeUnit,
          factors,
        );
        if (storeQty == null) {
          return {
            error: `Set pack size for ${line.name} (${line.unit} → ${storeUnit}) before issuing`,
          };
        }
        if (storeQty > line.maxAvailable) {
          shortages.push({
            name: line.name,
            need: storeQty,
            onHand: line.maxAvailable,
            unit: storeUnit,
          });
        }
      }

      if (shortages.length) {
        return {
          error:
            shortages.length === 1
              ? `Insufficient ${shortages[0].name} in central store.`
              : `${shortages.length} items are short in central store.`,
          shortages,
        };
      }

      for (const line of lines) {
        const storeUnit = line.storeUnit || line.unit;
        const storeItem = storeItems.find((s) => s.id === line.storeItemId);
        const factors = storeItem
          ? mergeUnitFactors(line.storeItemId, storeItem.unit, storeItem.unitFactors)
          : undefined;
        const storeQty =
          convertToStoreUnitsWithFactors(
            line.quantity,
            line.unit,
            storeUnit,
            factors,
          ) ?? 0;
        const res = issueFromStoreToDepartment(
          line.storeItemId,
          storeQty,
          destination,
          actor,
          {
            receivedBy,
            receivedById: opts.receivedById,
            notes: opts.notes,
            issueUnit: line.unit,
            issueDisplayQty: line.quantity,
          },
        );
        if ("error" in res) return res;
      }
      return { ok: true, issued: lines.length };
    },
    [issueFromStoreToDepartment, storeItems],
  );

  const updateFnbRawSellingPrice = useCallback(
    (
      fnbRawId: string,
      sellingPrice: number,
      actor: Actor,
    ): { ok: true; storeItemId: string; name: string } | { error: string } => {
      const row = fnbRawStock.find((f) => f.id === fnbRawId);
      if (!row) return { error: "F&B stock item not found" };
      if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
        return { error: "Enter a valid selling price" };
      }
      setFnbRawStock((prev) =>
        prev.map((f) =>
          f.id === fnbRawId ? { ...f, sellingPricePerPortion: sellingPrice } : f,
        ),
      );
      setActivityLog((a) =>
        log(
          a,
          "recipe_updated",
          actor,
          `F&B selling price set: ${row.name} → ₦${sellingPrice}`,
          fnbRawId,
        ),
      );
      return { ok: true, storeItemId: row.storeItemId, name: row.name };
    },
    [fnbRawStock],
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
            isBarStoreDept(s.dept) &&
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
    ): { ok: true } | { error: string; shortages?: StockShortageLine[] } => {
      const shortages: StockShortageLine[] = [];
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
        if (line.qty > maxQty || need > link.available) {
          shortages.push({
            name: line.item.name,
            need,
            onHand: link.available,
            unit: link.unit,
          });
        }
      }
      if (shortages.length) {
        return {
          error:
            shortages.length === 1
              ? `${shortages[0].name} — not enough stock on hand.`
              : `${shortages.length} items are out of stock for this order.`,
          shortages,
        };
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
      activePurchaseOrder &&
      !showsStoreDraftPurchaseList(activePurchaseOrder)
    ) {
      return [];
    }
    if (
      activePurchaseOrder?.lines.length &&
      showsStoreDraftPurchaseList(activePurchaseOrder)
    ) {
      return poLinesToBasketLines(activePurchaseOrder.lines);
    }
    return basket;
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
    pendingStoreItems,
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
    fnbRawStock,
    issueOutLog,
    barStock,
    issueFromStoreToBar,
    issueFromStoreToDepartment,
    issueOutCart,
    addStoreItemDirect,
    updateStoreItemDirect,
    deleteStoreItemDirect,
    submitStoreItemForApproval,
    approvePendingStoreItem,
    rejectPendingStoreItem,
    clearAllStoreItems,
    clearAllSupplyChainData,
    clearSupplyHistory,
    updateFnbRawSellingPrice,
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
    deleteInProgressBatch,
    kitchenRawOnHand,
    closeBatch,
    postFnbOrder,
    activityLog,
    stats,
    getRecipeEconomics: (recipe: Recipe) => ({
      totalCost: recipeTotalCostWithLivePrices(recipe),
      costPerPortion: recipeCostPerPortionWithLivePrices(recipe),
      revenue: recipe.sellingPricePerPortion * recipe.yieldPortions,
      profit:
        recipe.sellingPricePerPortion * recipe.yieldPortions -
        recipeTotalCostWithLivePrices(recipe),
      marginPct: recipeGrossMarginPctWithLivePrices(recipe),
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
    pendingStoreItems: ctx.pendingStoreItems ?? [],
    fnbRawStock: ctx.fnbRawStock ?? [],
    issueOutCart:
      ctx.issueOutCart ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    addStoreItemDirect:
      ctx.addStoreItemDirect ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    updateStoreItemDirect:
      ctx.updateStoreItemDirect ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    deleteStoreItemDirect:
      ctx.deleteStoreItemDirect ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    submitStoreItemForApproval:
      ctx.submitStoreItemForApproval ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    approvePendingStoreItem:
      ctx.approvePendingStoreItem ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    rejectPendingStoreItem:
      ctx.rejectPendingStoreItem ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    clearAllStoreItems:
      ctx.clearAllStoreItems ??
      (() => ({ ok: true as const, cleared: 0 })),
    clearAllSupplyChainData:
      ctx.clearAllSupplyChainData ??
      (() => ({ ok: true as const })),
    clearSupplyHistory:
      ctx.clearSupplyHistory ??
      (() => ({
        ok: true as const,
        purchaseOrdersCleared: 0,
        issueOutCleared: 0,
        activityCleared: 0,
      })),
    deleteInProgressBatch:
      ctx.deleteInProgressBatch ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    updateFnbRawSellingPrice:
      ctx.updateFnbRawSellingPrice ??
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
    clearBasket: ctx.clearBasket ?? (() => ({ error: "Basket not ready — refresh the page" })),
    sendBasketForApproval:
      ctx.sendBasketForApproval ??
      (() => ({ error: "Basket not ready — refresh the page" })),
  };
}
