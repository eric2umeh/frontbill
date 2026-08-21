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
  FnbDailySheet,
  FnbDailySheetLine,
  FnbMovement,
  FnbOrder,
  FnbRawStockItem,
  FnbMenuItem,
  IssueOutCartLine,
  IssueOutRecord,
  KitchenRawStockItem,
  KitchenStockItem,
  PendingStoreItem,
  PoLine,
  PoLineEditEvent,
  PoOrigin,
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
  appendPoLineEdits,
  basketLineToPoLine,
  canEditStorePurchaseOrder,
  canMutatePurchaseOrder,
  getActivePurchaseOrder,
  getStoreCartMutationTarget,
  companionPurchaseOrdersForStoreSend,
  isPurchaseOrderAwaitingAccountant,
  isPurchaseOrderDeleted,
  listKitchenOrdersAtStore,
  listOrdersAwaitingAccountant,
  listOrdersAwaitingManager,
  mergePoLineLists,
  poLinesToBasketLines,
  poOriginOf,
  recalcPoTotals,
  showsStoreDraftPurchaseList,
  stampPoLineEdit,
  storeItemToPoLine,
  visiblePurchaseOrders,
} from "./po-active";
import { pushSupplyNotification } from "./supply-notifications";
import { toast } from "sonner";
import { clearAllKitchenBatchDrafts } from "./kitchen-batch-draft";
import { convertToStoreUnits, materialCostForUnit } from "./measurement-units";
import {
  convertToStoreUnitsWithFactors,
  mergeUnitFactors,
} from "./unit-factor-storage";
import type { StockShortageLine } from "@/lib/ui/stock-shortage-dialog";
import { useAuth } from "@/lib/auth-context";
import { canManageFnbStore, canManageKitchenBatchStandards, canOperateKitchenProduction, canRaisePurchaseRequest, canSubmitMarketRetirement, canAddPurchasedToStock, canSupplyRetirementReview, canSupplyPoAccountantReview, canSupplyPoManagerReview, canAdminTestApproveSupplyPo, hasPermission } from "@/lib/permissions";
import { isRetryableSupplyError } from "@/lib/utils/fetch-retry";
import { isMainBarIssueDestination } from "@/lib/store/outlet-departments";
import { formatSupplyActorStamp } from "./fnb-store";
import {
  deleteSupplyCatalogItem,
  fetchSupplyCatalog,
  fetchSupplySnapshots,
  insertSupplyCatalogItem,
  saveSupplySnapshots,
  syncSupplyCatalog,
  updateSupplyCatalogItem,
} from "./supply-db-client";
import { mergeSnapshotRowsById, resolveSupplySnapshot } from "./snapshot-merge";
import { mergePurchaseOrdersFromRemote, dedupePurchaseOrders } from "./po-sync-merge";
import {
  isProductionBatchDeleted,
  mergeProductionBatchesFromRemote,
  mergeRecipesFromRemote,
  visibleProductionBatches,
} from "./kitchen-sync-merge";
import { canReadSupplySnapshots, snapshotsPayloadForRole } from "./supply-snapshot-payload";
import { dedupeBatchMaterials } from "./parse-csv-row";
import { broadcastSupplyLiveUpdate, subscribeSupplyLiveUpdates } from "./supply-live-sync";
import {
  canonicalBarStockId,
  mergeBarStockFromRemote,
  normalizeBarStockRows,
} from "./bar-stock-normalize";
import { applyRetirementLinesToCatalog } from "./retirement-stock";
import {
  applyRetirementBatchDecision,
  hasPendingRetirementReview,
  poHasRemainingAddToStockLines,
} from "./add-to-stock";

function applyRemoteArray<T>(
  setter: (updater: (prev: T[]) => T[]) => void,
  remote: unknown,
): boolean {
  if (!Array.isArray(remote)) return false;
  let changed = false;
  setter((prev) => {
    try {
      if (JSON.stringify(prev) === JSON.stringify(remote)) return prev;
    } catch {
      changed = true;
      return remote as T[];
    }
    changed = true;
    return remote as T[];
  });
  return changed;
}

/** Merge remote stock rows by id — local wins on conflict (protects in-flight transfers). */
function applyRemoteStockArray<T extends { id: string }>(
  setter: (updater: (prev: T[]) => T[]) => void,
  remote: unknown,
): boolean {
  if (!Array.isArray(remote)) return false;
  let changed = false;
  setter((prev) => {
    const merged = mergeSnapshotRowsById(remote as T[], prev);
    try {
      if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
    } catch {
      changed = true;
      return merged;
    }
    changed = true;
    return merged;
  });
  return changed;
}

function applyRemoteBarStockArray(
  setter: (updater: (prev: BarStockItem[]) => void) => void,
  remote: unknown,
): boolean {
  if (!Array.isArray(remote)) return false;
  let changed = false;
  setter((prev) => {
    const merged = normalizeBarStockRows(
      mergeBarStockFromRemote(prev, remote as BarStockItem[]),
    );
    try {
      if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
    } catch {
      changed = true;
      return merged;
    }
    changed = true;
    return merged;
  });
  return changed;
}

/** Skip applying a remote poll for a short window after this tab mutated stock. */
let lastLocalSupplyMutationAt = 0;
let liveSupplyInFlight = false;

function markLocalSupplyMutation() {
  lastLocalSupplyMutationAt = Date.now();
}

function notifyKitchenRawStockChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("frontbill:kitchen-raw-stock"));
    window.dispatchEvent(new CustomEvent("frontbill:supply-stock-changed"));
    markLocalSupplyMutation();
  }
}

function notifyBarStockChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("frontbill:bar-stock-changed"));
    window.dispatchEvent(new CustomEvent("frontbill:supply-stock-changed"));
    markLocalSupplyMutation();
  }
}

function notifyFnbRawStockChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("frontbill:fnb-raw-stock-changed"));
    window.dispatchEvent(new CustomEvent("frontbill:supply-stock-changed"));
    markLocalSupplyMutation();
  }
}

function notifyIssueOutLogChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("frontbill:issue-out-log-changed"));
    window.dispatchEvent(new CustomEvent("frontbill:supply-stock-changed"));
    markLocalSupplyMutation();
  }
}

function notifyFnbDailyChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("frontbill:fnb-daily-changed"));
    window.dispatchEvent(new CustomEvent("frontbill:supply-stock-changed"));
    markLocalSupplyMutation();
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
const FNB_DAILY_SHEETS_KEY = "frontbill_fnb_daily_sheets";
const FNB_MOVEMENTS_KEY = "frontbill_fnb_movements";
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
  FNB_DAILY_SHEETS_KEY,
  FNB_MOVEMENTS_KEY,
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
  /** Skip one persist after loading from storage so we never write [] over saved data. */
  const skipNextPersistRef = useRef(persist);

  useEffect(() => {
    if (!persist) return;
    setState(loadPersistedStock(key, fallbackRef.current));
    skipNextPersistRef.current = true;
    storageReadyRef.current = true;
  }, [key, persist]);

  useEffect(() => {
    if (!persist || !storageReadyRef.current) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
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
  const { userId, organizationId, role } = useAuth();
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
  const [workingPoId, setWorkingPoId] = useState<string | null>(null);
  const [poWorkspaceOrigin, setPoWorkspaceOrigin] = useState<PoOrigin>("store");
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
  const [fnbDailySheets, setFnbDailySheets] = usePersistedArrayState<FnbDailySheet>(
    FNB_DAILY_SHEETS_KEY,
    [],
    true,
  );
  const [fnbMovements, setFnbMovements] = usePersistedArrayState<FnbMovement>(
    FNB_MOVEMENTS_KEY,
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
  const fnbDailySheetsRef = useRef(fnbDailySheets);
  const fnbMovementsRef = useRef(fnbMovements);
  const purchaseOrdersRef = useRef(purchaseOrders);
  const issueOutLogRef = useRef(issueOutLog);
  const activityLogRef = useRef(activityLog);
  const pendingStoreItemsRef = useRef(pendingStoreItems);
  const storeItemsRef = useRef(storeItems);
  useEffect(() => {
    recipesRef.current = recipes;
    kitchenStockRef.current = kitchenStock;
    batchesRef.current = batches;
    kitchenRawStockRef.current = kitchenRawStock;
    barStockRef.current = barStock;
    fnbRawStockRef.current = fnbRawStock;
    fnbDailySheetsRef.current = fnbDailySheets;
    fnbMovementsRef.current = fnbMovements;
    purchaseOrdersRef.current = purchaseOrders;
    issueOutLogRef.current = issueOutLog;
    activityLogRef.current = activityLog;
    pendingStoreItemsRef.current = pendingStoreItems;
    storeItemsRef.current = storeItems;
  }, [
    recipes,
    kitchenStock,
    batches,
    kitchenRawStock,
    barStock,
    fnbRawStock,
    fnbDailySheets,
    fnbMovements,
    purchaseOrders,
    issueOutLog,
    activityLog,
    pendingStoreItems,
    storeItems,
  ]);

  const persistSnapshotsNow = useCallback(async (): Promise<void> => {
    if (!useDbPersistence || !dbHydratedRef.current || snapshotSyncSkipRef.current) {
      return;
    }
    const payload = snapshotsPayloadForRole(
      {
        recipes: recipesRef.current,
        batches: batchesRef.current,
        kitchen_stock: kitchenStockRef.current,
        kitchen_raw_stock: kitchenRawStockRef.current,
        bar_stock: barStockRef.current,
        fnb_raw_stock: fnbRawStockRef.current,
        fnb_daily_sheets: fnbDailySheetsRef.current,
        fnb_movements: fnbMovementsRef.current,
        purchase_orders: purchaseOrdersRef.current,
        issue_out_log: issueOutLogRef.current,
        activity_log: activityLogRef.current,
        pending_items: pendingStoreItemsRef.current,
        basket: basketRef.current,
      },
      role,
    );
    if (Object.keys(payload).length === 0) return;
    try {
      await saveSupplySnapshots(userId, payload, orgIdRef.current || undefined);
      broadcastSupplyLiveUpdate();
    } catch (err) {
      // One retry after a short delay (covers brief session refresh races).
      await new Promise((r) => setTimeout(r, 400));
      try {
        await saveSupplySnapshots(userId, payload, orgIdRef.current || undefined);
        broadcastSupplyLiveUpdate();
      } catch (err2) {
        if (isRetryableSupplyError(err2)) {
          console.warn("[supply-chain] snapshot sync retryable:", err2);
          return;
        }
        const msg = err2 instanceof Error ? err2.message : "";
        if (/^forbidden$/i.test(msg.trim())) {
          console.warn("[supply-chain] snapshot sync skipped: Forbidden");
          return;
        }
        console.error("[supply-chain] snapshot sync failed", err2);
        toast.error(
          err2 instanceof Error
            ? `Could not sync purchase orders to cloud: ${err2.message}`
            : "Could not sync purchase orders to cloud — other users may not see them yet",
        );
        throw err2;
      }
    }
  }, [useDbPersistence, userId, role]);

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
    if (!canReadSupplySnapshots(role)) {
      setDbHydrated(true);
      return;
    }
    let cancelled = false;
    catalogSyncSkipRef.current = true;
    snapshotSyncSkipRef.current = true;

    void (async () => {
      try {
        const [catalog, snapshots] = await Promise.all([
          fetchSupplyCatalog(userId, organizationId || undefined).catch(
            () => [] as StoreItem[],
          ),
          fetchSupplySnapshots(userId, organizationId || undefined).catch(
            () => ({}),
          ),
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
        const localFnbSheets = loadPersistedStock<FnbDailySheet>(FNB_DAILY_SHEETS_KEY, []);
        const localFnbMovements = loadPersistedStock<FnbMovement>(FNB_MOVEMENTS_KEY, []);
        const localActivity = loadPersistedStock<ActivityEntry>(
          ACTIVITY_LOG_STORAGE_KEY,
          EMPTY_ACTIVITY_LOG,
        );

        const mergedRecipes = mergeRecipesFromRemote(
          localRecipes,
          Array.isArray(snapshots.recipes) ? (snapshots.recipes as Recipe[]) : [],
        );
        const mergedBatches = resolveSupplySnapshot(localBatches, snapshots.batches);
        const mergedKitchenStock = resolveSupplySnapshot(localKitchenStock, snapshots.kitchen_stock);
        const mergedKitchenRaw = resolveSupplySnapshot(localKitchenRaw, snapshots.kitchen_raw_stock);
        const mergedBarStock = normalizeBarStockRows(
          mergeBarStockFromRemote(
            localBarStock,
            Array.isArray(snapshots.bar_stock)
              ? (snapshots.bar_stock as BarStockItem[])
              : [],
          ),
        );
        const mergedFnbRaw = resolveSupplySnapshot(localFnbRaw, snapshots.fnb_raw_stock);
        const mergedFnbSheets = resolveSupplySnapshot(localFnbSheets, snapshots.fnb_daily_sheets);
        const mergedFnbMovements = resolveSupplySnapshot(localFnbMovements, snapshots.fnb_movements);
        const mergedActivity = resolveSupplySnapshot(localActivity, snapshots.activity_log);

        if (mergedRecipes.length) setRecipes(mergedRecipes);
        if (mergedBatches.length) setBatches(mergedBatches);
        if (mergedKitchenStock.length) setKitchenStock(mergedKitchenStock);
        if (mergedKitchenRaw.length) setKitchenRawStock(mergedKitchenRaw);
        if (mergedBarStock.length) setBarStock(mergedBarStock);
        if (mergedFnbRaw.length) setFnbRawStock(mergedFnbRaw);
        if (mergedFnbSheets.length) setFnbDailySheets(mergedFnbSheets);
        if (mergedFnbMovements.length) setFnbMovements(mergedFnbMovements);
        if (mergedActivity.length) setActivityLog(mergedActivity);
        // Merge local + remote so soft-deletes (tombstones) survive a refresh before cloud sync.
        const localPurchaseOrders = loadPersistedStock<PurchaseOrder>(
          PURCHASE_ORDERS_STORAGE_KEY,
          EMPTY_PURCHASE_ORDERS,
        );
        const remotePurchaseOrders = Array.isArray(snapshots.purchase_orders)
          ? (snapshots.purchase_orders as PurchaseOrder[])
          : [];
        const mergedPurchaseOrders = mergePurchaseOrdersFromRemote(
          localPurchaseOrders,
          remotePurchaseOrders,
        );
        if (mergedPurchaseOrders.length) {
          setPurchaseOrders(mergedPurchaseOrders);
        }
        if (Array.isArray(snapshots.issue_out_log) && snapshots.issue_out_log.length) {
          setIssueOutLog(snapshots.issue_out_log as IssueOutRecord[]);
        }
        if (Array.isArray(snapshots.pending_items) && snapshots.pending_items.length) {
          setPendingStoreItems(snapshots.pending_items as PendingStoreItem[]);
        }
        // Org basket is the store cart — never hydrate it for kitchen-only chefs
        // (it was resurrecting a "cleared" kitchen draft after hard refresh).
        if (
          hasPermission(role, "supply:store") &&
          Array.isArray(snapshots.basket) &&
          snapshots.basket.length
        ) {
          setBasket(snapshots.basket as BasketLine[]);
        }

        if (catalog.length === 0 && localCatalog.length > 0 && hasPermission(role, "supply:store")) {
          await syncSupplyCatalog(userId, localCatalog, organizationId || undefined);
        }

        const localSnapshots = {
          recipes: mergedRecipes,
          batches: mergedBatches,
          kitchen_stock: mergedKitchenStock,
          kitchen_raw_stock: mergedKitchenRaw,
          bar_stock: mergedBarStock,
          fnb_raw_stock: mergedFnbRaw,
          fnb_daily_sheets: mergedFnbSheets,
          fnb_movements: mergedFnbMovements,
          activity_log: mergedActivity,
          purchase_orders: mergedPurchaseOrders,
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
        // Tombstones keep the same array length — still upload when merge differs from remote.
        if (
          mergedPurchaseOrders.length &&
          JSON.stringify(mergedPurchaseOrders) !==
            JSON.stringify(remotePurchaseOrders)
        ) {
          toUpload.purchase_orders = mergedPurchaseOrders;
        }
        if (Object.keys(toUpload).length > 0) {
          const rolePayload = snapshotsPayloadForRole(toUpload, role);
          if (Object.keys(rolePayload).length > 0) {
            await saveSupplySnapshots(
              userId,
              rolePayload,
              organizationId || undefined,
            ).catch(() => undefined);
          }
        }

        removeAllPersistedSupplyKeys();
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load supply data from database";
        const localCatalog = loadPersistedStock<StoreItem>(
          STORE_ITEMS_STORAGE_KEY,
          EMPTY_STORE_ITEMS,
        );
        if (localCatalog.length > 0) {
          setStoreItems(localCatalog);
        }
        if (isRetryableSupplyError(err) || /^forbidden$/i.test(message.trim())) {
          console.warn("[supply-chain] snapshot hydrate skipped:", message);
        } else {
          console.error("[supply-chain] failed to load from Supabase", err);
          toast.error(message);
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
  }, [useDbPersistence, userId, organizationId, role]);

  /** Debounced catalogue sync (qty changes from issue-out, PO receive, etc.). */
  useEffect(() => {
    if (!useDbPersistence || !dbHydrated || catalogSyncSkipRef.current) return;
    if (!hasPermission(role, "supply:store")) return;
    const timer = window.setTimeout(() => {
      void syncSupplyCatalog(userId, storeItems.map(applyStoreItemDeptFields), orgIdRef.current || undefined).catch((err) => {
        if (isRetryableSupplyError(err)) {
          console.warn("[supply-chain] catalogue sync retryable:", err);
          return;
        }
        const message =
          err instanceof Error ? err.message : "Failed to sync catalogue to database";
        console.error("[supply-chain] catalogue sync failed", err);
        toast.error(message);
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [useDbPersistence, dbHydrated, userId, storeItems, role]);

  /** Debounced JSON snapshot sync — always read refs so a slow PUT cannot overwrite Clear. */
  useEffect(() => {
    if (!useDbPersistence || !dbHydrated || snapshotSyncSkipRef.current) return;
    if (
      !hasPermission(role, "supply:store") &&
      !hasPermission(role, "supply:kitchen")
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      void persistSnapshotsNow().catch(() => {
        /* toast handled inside persistSnapshotsNow */
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [
    useDbPersistence,
    dbHydrated,
    persistSnapshotsNow,
    recipes,
    batches,
    kitchenStock,
    kitchenRawStock,
    barStock,
    fnbRawStock,
    fnbDailySheets,
    fnbMovements,
    purchaseOrders,
    issueOutLog,
    activityLog,
    pendingStoreItems,
    basket,
    role,
  ]);

  /** Pull live stock (and batch standards) so kitchen / F&B update without a full page refresh. */
  useEffect(() => {
    if (!useDbPersistence || !dbHydrated) return;
    if (!canReadSupplySnapshots(role)) return;

    let cancelled = false;

    const refreshLiveSupply = async (fromOtherTab = false, includeCatalog = fromOtherTab) => {
      if (Date.now() - lastLocalSupplyMutationAt < 4000) {
        return;
      }
      if (liveSupplyInFlight) return;
      liveSupplyInFlight = true;
      try {
        const [snapshots, catalog] = await Promise.all([
          fetchSupplySnapshots(userId, organizationId || undefined),
          includeCatalog
            ? fetchSupplyCatalog(userId, organizationId || undefined).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;

        let changed = false;
        changed = applyRemoteStockArray(setKitchenRawStock, snapshots.kitchen_raw_stock) || changed;
        changed = applyRemoteStockArray(setFnbRawStock, snapshots.fnb_raw_stock) || changed;
        changed = applyRemoteBarStockArray(setBarStock, snapshots.bar_stock) || changed;
        changed = applyRemoteStockArray(setKitchenStock, snapshots.kitchen_stock) || changed;
        changed = applyRemoteArray(setIssueOutLog, snapshots.issue_out_log) || changed;
        changed = applyRemoteArray(setFnbDailySheets, snapshots.fnb_daily_sheets) || changed;
        changed = applyRemoteArray(setFnbMovements, snapshots.fnb_movements) || changed;

        const skipCatalog =
          Date.now() - lastLocalSupplyMutationAt < 12_000;
        if (!skipCatalog && Array.isArray(catalog) && catalog.length > 0) {
          const remote = catalog.map(applyStoreItemDeptFields);
          setStoreItems((prev) => {
            const preferLocal = Date.now() - lastLocalSupplyMutationAt < 12_000;
            if (preferLocal) return prev;
            try {
              if (JSON.stringify(prev) === JSON.stringify(remote)) return prev;
            } catch {
              changed = true;
              return remote;
            }
            changed = true;
            return remote;
          });
        }

        const remoteBatches = snapshots.batches;
        if (Array.isArray(remoteBatches)) {
          setBatches((prev) => {
            const merged = mergeProductionBatchesFromRemote(
              prev,
              remoteBatches as ProductionBatch[],
            );
            if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
            changed = true;
            return merged;
          });
        }

        const remoteRecipes = snapshots.recipes;
        if (Array.isArray(remoteRecipes)) {
          setRecipes((prev) => {
            const merged = mergeRecipesFromRemote(prev, remoteRecipes as Recipe[]);
            if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
            changed = true;
            return merged;
          });
        }

        if (changed && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("frontbill:supply-stock-changed"));
          window.dispatchEvent(new CustomEvent("frontbill:kitchen-raw-stock"));
          window.dispatchEvent(new CustomEvent("frontbill:fnb-raw-stock-changed"));
          window.dispatchEvent(new CustomEvent("frontbill:bar-stock-changed"));
          window.dispatchEvent(new CustomEvent("frontbill:issue-out-log-changed"));
          window.dispatchEvent(new CustomEvent("frontbill:fnb-daily-changed"));
        }
      } catch {
        /* non-blocking */
      } finally {
        liveSupplyInFlight = false;
      }
    };

    const onVis = () => {
      if (document.visibilityState === "visible") void refreshLiveSupply(false, true);
    };

    const firstPoll = window.setTimeout(() => void refreshLiveSupply(false, true), 1_500);
    document.addEventListener("visibilitychange", onVis);
    const interval = window.setInterval(() => void refreshLiveSupply(false, false), 15_000);
    const unsubscribeLive = subscribeSupplyLiveUpdates(() => {
      window.setTimeout(() => {
        if (!cancelled) void refreshLiveSupply(true);
      }, 700);
    });

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.clearTimeout(firstPoll);
      window.clearInterval(interval);
      unsubscribeLive();
    };
  }, [useDbPersistence, dbHydrated, userId, organizationId, role]);

  /** Refresh PO list from org snapshot so accountant / purchaser see each other's decisions. */
  useEffect(() => {
    if (!useDbPersistence || !dbHydrated) return;
    if (!canReadSupplySnapshots(role)) return;

    let cancelled = false;

    const refreshPurchaseOrders = async () => {
      try {
        // Don't clobber a just-submitted Add-to-stock / retirement decision with a stale GET.
        if (Date.now() - lastLocalSupplyMutationAt < 12_000) return;
        const snapshots = await fetchSupplySnapshots(
          userId,
          organizationId || undefined,
        );
        if (cancelled) return;
        const remote = snapshots.purchase_orders;
        if (!Array.isArray(remote)) return;
        setPurchaseOrders((prev) => {
          const merged = mergePurchaseOrdersFromRemote(prev, remote as PurchaseOrder[]);
          if (JSON.stringify(prev) === JSON.stringify(merged)) return prev;
          return merged;
        });
      } catch {
        /* non-blocking — network may be slow */
      }
    };

    const onVis = () => {
      if (document.visibilityState === "visible") void refreshPurchaseOrders();
    };

    void refreshPurchaseOrders();
    document.addEventListener("visibilitychange", onVis);
    const interval = window.setInterval(refreshPurchaseOrders, 45_000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(interval);
    };
  }, [useDbPersistence, dbHydrated, userId, organizationId, role]);

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
      clearAllKitchenBatchDrafts();
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
    () => getActivePurchaseOrder(purchaseOrders, poWorkspaceOrigin, workingPoId),
    [purchaseOrders, poWorkspaceOrigin, workingPoId],
  );

  const selectWorkingPurchaseOrder = useCallback(
    (poId: string | null) => {
      setWorkingPoId(poId);
      if (!poId) return;
      const focused = purchaseOrders.find((p) => p.id === poId);
      if (
        focused &&
        focused.lines.length > 0 &&
        showsStoreDraftPurchaseList(focused)
      ) {
        setBasket(poLinesToBasketLines(focused.lines));
      }
    },
    [purchaseOrders],
  );

  const setPurchaseWorkspaceOrigin = useCallback((origin: PoOrigin) => {
    setPoWorkspaceOrigin(origin);
    setWorkingPoId(null);
  }, []);

  const basketMigratedRef = useRef(false);

  // Mirror basket only when the focused PO identity/status changes — not on every
  // new `lines` array reference from remote merge (that was wiping a long draft cart).
  useEffect(() => {
    if (!activePurchaseOrder) {
      if (poWorkspaceOrigin === "kitchen") setBasket([]);
      return;
    }
    // During hard refresh, origin briefly defaults to store and would copy a store
    // (or kitchen-at-store) PO into the shared basket — then chef UI shows it again.
    if (
      poWorkspaceOrigin === "kitchen" &&
      poOriginOf(activePurchaseOrder) !== "kitchen"
    ) {
      setBasket([]);
      return;
    }
    if (!showsStoreDraftPurchaseList(activePurchaseOrder)) {
      setBasket([]);
      return;
    }
    if (activePurchaseOrder.lines.length) {
      setBasket(poLinesToBasketLines(activePurchaseOrder.lines));
    }
    // Intentionally do not clear basket when lines are empty here — clearBasket /
    // remove handlers own that. Empty remote merges must not wipe a local cart.
  }, [
    activePurchaseOrder?.id,
    activePurchaseOrder?.status,
    activePurchaseOrder?.origin,
    poWorkspaceOrigin,
  ]);

  useEffect(() => {
    // Never promote the org/store basket into a PO while in the kitchen workspace.
    if (poWorkspaceOrigin === "kitchen") return;
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
      origin: "store",
      createdBy: "Store",
      createdByName: "Store",
      createdAt: now.toISOString(),
      cashDisbursed: total,
      totalAmount: total,
      lines,
    };
    setPurchaseOrders((prev) =>
      getActivePurchaseOrder(prev, "store", workingPoId) ? prev : [po, ...prev],
    );
  }, [activePurchaseOrder, basket, workingPoId, poWorkspaceOrigin]);

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
        // Store Raise must target the store draft (or an explicitly opened kitchen list),
        // not a kitchen pending_store PO that is only the display fallback.
        const active =
          poWorkspaceOrigin === "store"
            ? getStoreCartMutationTarget(prev, workingPoId)
            : getActivePurchaseOrder(prev, poWorkspaceOrigin, workingPoId);
        if (!canRaisePurchaseRequest(actor.role)) {
          err = "You do not have permission to raise or edit a purchase order.";
          return prev;
        }
        if (active && !canEditStorePurchaseOrder(active)) {
          err =
            "Cannot add items — this purchase order is locked in its current status.";
          return prev;
        }

        if (!Number.isFinite(qty) || qty <= 0) {
          if (!active) {
            basketPatch = "remove-item";
            return prev;
          }
          const removed = active.lines.find((l) => l.stockItemId === item.id);
          const nextLines = active.lines.filter(
            (l) => l.stockItemId !== item.id,
          );
          const { total, lines } = recalcPoTotals(nextLines);
          basketPatch = poLinesToBasketLines(lines);
          const removeEvents: PoLineEditEvent[] = removed
            ? [
                {
                  at: new Date().toISOString(),
                  by: actor.name,
                  role: actor.role,
                  action: "removed",
                  stockItemId: removed.stockItemId,
                  name: removed.name,
                  detail: `removed qty ${removed.quantityOrdered}`,
                },
              ]
            : [];
          const editMeta = appendPoLineEdits(active, removeEvents, actor);
          return prev.map((p) =>
            p.id === active.id
              ? {
                  ...p,
                  ...editMeta,
                  lines,
                  totalAmount: total,
                  cashDisbursed: total,
                }
              : p,
          );
        }

        if (!active) {
          // Starting a store cart while kitchen inbox is open — do not seed from
          // kitchen lines that may still be mirrored in the shared basket cache.
          const baseLines =
            poWorkspaceOrigin === "store"
              ? []
              : basketRef.current.map((b) => basketLineToPoLine(b));
          const existing = baseLines.find((l) => l.stockItemId === item.id);
          const draftLine = storeItemToPoLine(
            item,
            qty,
            unitPrice,
            existing?.id,
            meta,
          );
          const stamped = stampPoLineEdit(draftLine, actor, existing);
          const mergedLines = existing
            ? baseLines.map((l) =>
                l.stockItemId === item.id ? stamped.line : l,
              )
            : [...baseLines, stamped.line];
          const { total, lines } = recalcPoTotals(mergedLines);
          const now = new Date();
          const events = stamped.event ? [stamped.event] : [];
          const po: PurchaseOrder = {
            id: uid("po"),
            poNumber: formatPurchaseOrderNumber(now),
            weekLabel: formatPurchaseWeekLabel(now),
            status: "draft",
            origin: poWorkspaceOrigin,
            createdBy: actor.name,
            createdByName: actor.name,
            createdAt: now.toISOString(),
            cashDisbursed: total,
            totalAmount: total,
            lines,
            ...appendPoLineEdits(
              {
                lineEdits: [],
              } as PurchaseOrder,
              events,
              actor,
            ),
          };
          basketPatch = poLinesToBasketLines(lines);
          setWorkingPoId(po.id);
          return [po, ...prev];
        }

        const existing = active.lines.find((l) => l.stockItemId === item.id);
        const draftLine = storeItemToPoLine(
          item,
          qty,
          unitPrice,
          existing?.id,
          meta,
        );
        const stamped = stampPoLineEdit(draftLine, actor, existing);
        const nextLines = existing
          ? active.lines.map((l) =>
              l.stockItemId === item.id ? stamped.line : l,
            )
          : [...active.lines, stamped.line];
        const { total, lines } = recalcPoTotals(nextLines);
        basketPatch = poLinesToBasketLines(lines);
        const events = stamped.event ? [stamped.event] : [];
        const editMeta = appendPoLineEdits(active, events, actor);
        return prev.map((p) =>
          p.id === active.id
            ? {
                ...p,
                ...editMeta,
                lines,
                totalAmount: total,
                cashDisbursed: total,
              }
            : p,
        );
      });
      if (basketPatch === "remove-item") {
        setBasket((b) => b.filter((x) => x.stockItemId !== item.id));
      } else if (basketPatch !== undefined) {
        setBasket(basketPatch);
      }
      schedulePersistSnapshots();
      return err;
    },
    [poWorkspaceOrigin, workingPoId, schedulePersistSnapshots],
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

  const clearBasket = useCallback(
    async (
      actor?: Actor,
    ): Promise<{ ok: true } | { error: string }> => {
      const resolveTarget = (orders: PurchaseOrder[]) =>
        poWorkspaceOrigin === "store"
          ? getStoreCartMutationTarget(orders, workingPoId)
          : getActivePurchaseOrder(orders, poWorkspaceOrigin, workingPoId);
      const active = resolveTarget(purchaseOrders);
      if (active && !canEditStorePurchaseOrder(active)) {
        return {
          error: "Cannot clear — purchase order is locked while in approval.",
        };
      }
      const nowIso = new Date().toISOString();
      const who = actor ?? { name: "Staff", role: poWorkspaceOrigin };
      const kitchenClearable = (p: PurchaseOrder) =>
        !isPurchaseOrderDeleted(p) &&
        poOriginOf(p) === "kitchen" &&
        (p.status === "draft" ||
          p.status === "accountant_rejected" ||
          p.status === "manager_rejected");

      // Kitchen Clear soft-deletes draft POs (tombstone) so hard refresh + org basket
      // cannot resurrect lines. Store Clear empties the focused draft with a newer clock.
      setPurchaseOrders((prev) => {
        let next: PurchaseOrder[];
        if (poWorkspaceOrigin === "kitchen") {
          next = prev.map((p) =>
            kitchenClearable(p)
              ? {
                  ...p,
                  deletedAt: nowIso,
                  deletedBy: who.name,
                  workflowUpdatedAt: nowIso,
                  linesLastEditedAt: nowIso,
                  linesLastEditedBy: who.name,
                  linesLastEditedRole: who.role,
                  lines: [],
                  totalAmount: 0,
                  cashDisbursed: 0,
                  lineEdits: [
                    {
                      at: nowIso,
                      by: who.name,
                      role: who.role,
                      action: "removed" as const,
                      stockItemId: "*",
                      name: "All lines",
                      detail: "cleared kitchen draft basket",
                    },
                    ...(p.lineEdits ?? []),
                  ].slice(0, 40),
                }
              : p,
          );
        } else {
          const current = resolveTarget(prev);
          if (!current || !canEditStorePurchaseOrder(current)) {
            next = prev;
          } else {
            next = prev.map((p) =>
              p.id === current.id
                ? {
                    ...p,
                    lines: [],
                    totalAmount: 0,
                    cashDisbursed: 0,
                    workflowUpdatedAt: nowIso,
                    linesLastEditedAt: nowIso,
                    linesLastEditedBy: who.name,
                    linesLastEditedRole: who.role,
                    lineEdits: [
                      {
                        at: nowIso,
                        by: who.name,
                        role: who.role,
                        action: "removed" as const,
                        stockItemId: "*",
                        name: "All lines",
                        detail: "cleared draft basket",
                      },
                      ...(p.lineEdits ?? []),
                    ].slice(0, 40),
                  }
                : p,
            );
          }
        }
        purchaseOrdersRef.current = next;
        return next;
      });
      setBasket([]);
      basketRef.current = [];
      setWorkingPoId(null);
      try {
        await persistSnapshotsNow();
        return { ok: true };
      } catch {
        return {
          error:
            "Cleared on this screen but cloud sync failed — wait a moment and clear again before refreshing",
        };
      }
    },
    [purchaseOrders, poWorkspaceOrigin, workingPoId, persistSnapshotsNow],
  );

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
    (
      stockItemId: string,
      actor?: Actor,
    ): { ok: true } | { error: string } => {
      const resolveTarget = (orders: PurchaseOrder[]) =>
        poWorkspaceOrigin === "store"
          ? getStoreCartMutationTarget(orders, workingPoId)
          : getActivePurchaseOrder(orders, poWorkspaceOrigin, workingPoId);
      const active = resolveTarget(purchaseOrders);
      if (active && !canEditStorePurchaseOrder(active)) {
        return {
          error: "Cannot remove — purchase order is locked while in approval.",
        };
      }
      const who = actor ?? { name: "Store", role: "store" };
      let basketPatch: BasketLine[] | undefined;
      setPurchaseOrders((prev) => {
        const current = resolveTarget(prev);
        if (!current || !canEditStorePurchaseOrder(current)) return prev;
        const removed = current.lines.find((l) => l.stockItemId === stockItemId);
        const nextLines = current.lines.filter(
          (l) => l.stockItemId !== stockItemId,
        );
        const { total, lines } = recalcPoTotals(nextLines);
        basketPatch = poLinesToBasketLines(lines);
        const removeEvents: PoLineEditEvent[] = removed
          ? [
              {
                at: new Date().toISOString(),
                by: who.name,
                role: who.role,
                action: "removed",
                stockItemId: removed.stockItemId,
                name: removed.name,
                detail: `removed qty ${removed.quantityOrdered}`,
              },
            ]
          : [];
        const editMeta = appendPoLineEdits(current, removeEvents, who);
        return prev.map((p) =>
          p.id === current.id
            ? {
                ...p,
                ...editMeta,
                lines,
                totalAmount: total,
                cashDisbursed: total,
              }
            : p,
        );
      });
      if (basketPatch !== undefined) setBasket(basketPatch);
      return { ok: true };
    },
    [purchaseOrders, poWorkspaceOrigin, workingPoId],
  );

  const sendBasketForApproval = useCallback(
    (actor: Actor): { po: PurchaseOrder } | { error: string } => {
      if (!canRaisePurchaseRequest(actor.role)) {
        return { error: "You do not have permission to raise a purchase order." };
      }
      const active = getActivePurchaseOrder(
        purchaseOrders,
        poWorkspaceOrigin,
        workingPoId,
      );
      const lines = active?.lines ?? basket;
      if (!lines.length) {
        return { error: "Add items to the draft purchase list first" };
      }

      // Kitchen drafts go to store first — not straight to accountant.
      if (
        (!active || active.status === "draft" || active.status === "accountant_rejected") &&
        (poWorkspaceOrigin === "kitchen" || poOriginOf(active) === "kitchen")
      ) {
        return {
          error:
            'Chef has to “Send to store” for kitchen orders first before You.',
        };
      }

      if (active && isPurchaseOrderAwaitingAccountant(active)) {
        return {
          error: "Cannot send again — the accountant is reviewing this PO.",
        };
      }

      const otherAwaiting = purchaseOrders.find(
        (p) =>
          !p.deletedAt &&
          p.status === "pending_accountant" &&
          p.id !== active?.id,
      );
      if (otherAwaiting) {
        return {
          error: `${otherAwaiting.poNumber} is already awaiting accountant. Finish that review before sending another.`,
        };
      }

      if (
        active &&
        active.status !== "draft" &&
        active.status !== "accountant_rejected" &&
        active.status !== "manager_rejected" &&
        active.status !== "pending_store" &&
        !canEditStorePurchaseOrder(active)
      ) {
        return {
          error: "This purchase order cannot be edited or resent in its current status.",
        };
      }

      // Store send: fold chef list + store draft into one PO for accountant review.
      const companions =
        poWorkspaceOrigin === "store"
          ? companionPurchaseOrdersForStoreSend(purchaseOrders, active)
          : [];
      const companionIds = new Set(companions.map((c) => c.id));

      let poLines = active
        ? active.lines
        : (lines as BasketLine[]).map((b) => basketLineToPoLine(b));
      for (const companion of companions) {
        poLines = mergePoLineLists(poLines, companion.lines);
      }
      const { total, lines: recalcLines } = recalcPoTotals(poLines);
      const now = new Date();
      const nowIso = now.toISOString();
      const submitted: PurchaseOrder = active
        ? {
            ...active,
            // Combined send is store-driven for accountant routing / stamps.
            origin:
              companions.length > 0 || poOriginOf(active) === "store"
                ? "store"
                : poOriginOf(active),
            status: "pending_accountant",
            lines: recalcLines,
            totalAmount: total,
            cashDisbursed: total,
            accountantComment: undefined,
            accountantDecidedBy: undefined,
            accountantDecidedRole: undefined,
            accountantDecidedAt: undefined,
            managerComment: undefined,
            managerDecidedBy: undefined,
            managerDecidedRole: undefined,
            managerDecidedAt: undefined,
            sentToAccountantAt: nowIso,
            sentToAccountantBy: actor.name,
            workflowUpdatedAt: nowIso,
          }
        : {
            id: uid("po"),
            poNumber: formatPurchaseOrderNumber(now),
            weekLabel: formatPurchaseWeekLabel(now),
            status: "pending_accountant",
            origin: "store",
            createdBy: actor.name,
            createdByName: actor.name,
            createdAt: nowIso,
            sentToAccountantAt: nowIso,
            sentToAccountantBy: actor.name,
            workflowUpdatedAt: nowIso,
            cashDisbursed: total,
            totalAmount: total,
            lines: recalcLines,
          };

      setPurchaseOrders((prev) => {
        const next = dedupePurchaseOrders(
          prev.map((p) => {
            if (active && p.id === active.id) return submitted;
            if (companionIds.has(p.id)) {
              return {
                ...p,
                deletedAt: nowIso,
                deletedBy: actor.name,
                workflowUpdatedAt: nowIso,
                lines: [],
                totalAmount: 0,
                cashDisbursed: 0,
              };
            }
            return p;
          }).concat(active ? [] : [submitted]),
        );
        purchaseOrdersRef.current = next;
        return next;
      });
      setBasket(poLinesToBasketLines(recalcLines));
      setWorkingPoId(submitted.id);
      const mergedNote =
        companions.length > 0
          ? ` (combined with ${companions.map((c) => c.poNumber).join(", ")})`
          : "";
      setActivityLog((a) =>
        log(
          a,
          "po_submitted",
          actor,
          `Sent ${submitted.poNumber}${mergedNote} — ₦${total.toLocaleString()} to accountant for approval`,
          submitted.id,
        ),
      );
      const originNote =
        companions.length > 0
          ? " (store + kitchen combined)"
          : poOriginOf(submitted) === "kitchen"
            ? " (kitchen order)"
            : "";
      pushSupplyNotification({
        audience: ["accountant", "manager"],
        title: `PO raised — ${submitted.poNumber}`,
        body: `${actor.name} sent ${submitted.poNumber}${originNote} (₦${total.toLocaleString()}) for approval`,
        href: "/supply/purchase-orders?tab=approvals",
      });
      void persistSnapshotsNow();
      return { po: submitted };
    },
    [
      basket,
      purchaseOrders,
      poWorkspaceOrigin,
      workingPoId,
      persistSnapshotsNow,
    ],
  );

  /** Chef / kitchen: send draft kitchen list to central store for review. */
  const sendKitchenOrderToStore = useCallback(
    (actor: Actor): { po: PurchaseOrder } | { error: string } => {
      if (!canRaisePurchaseRequest(actor.role)) {
        return { error: "You do not have permission to raise a purchase order." };
      }
      const active = getActivePurchaseOrder(purchaseOrders, "kitchen", workingPoId);
      const lines = active?.lines ?? (poWorkspaceOrigin === "kitchen" ? basket : []);
      if (!lines.length) {
        return { error: "Add kitchen items to the purchase list first" };
      }
      if (
        active &&
        active.status !== "draft" &&
        active.status !== "accountant_rejected" &&
        active.status !== "manager_rejected"
      ) {
        return {
          error: "This kitchen order is already with the store or in approval.",
        };
      }

      const poLines = active
        ? active.lines
        : (lines as BasketLine[]).map((b) => basketLineToPoLine(b));
      const { total, lines: recalcLines } = recalcPoTotals(poLines);
      const now = new Date();
      const nowIso = now.toISOString();
      const submitted: PurchaseOrder = active
        ? {
            ...active,
            origin: "kitchen",
            status: "pending_store",
            lines: recalcLines,
            totalAmount: total,
            cashDisbursed: total,
            accountantComment: undefined,
            sentToStoreAt: nowIso,
            sentToStoreBy: actor.name,
            workflowUpdatedAt: nowIso,
          }
        : {
            id: uid("po"),
            poNumber: formatPurchaseOrderNumber(now),
            weekLabel: formatPurchaseWeekLabel(now),
            status: "pending_store",
            origin: "kitchen",
            createdBy: actor.name,
            createdByName: actor.name,
            createdAt: nowIso,
            sentToStoreAt: nowIso,
            sentToStoreBy: actor.name,
            workflowUpdatedAt: nowIso,
            cashDisbursed: total,
            totalAmount: total,
            lines: recalcLines,
          };

      setPurchaseOrders((prev) => {
        const next = active
          ? prev.map((p) => (p.id === active.id ? submitted : p))
          : [submitted, ...prev];
        purchaseOrdersRef.current = next;
        return next;
      });
      // Chef leaves the kitchen cart; store loads lines from the PO (pending_store).
      // Only clear the in-memory basket in the kitchen workspace — do not wipe the
      // shared list store needs to review and send to accountant.
      if (poWorkspaceOrigin === "kitchen") {
        setBasket([]);
        setWorkingPoId(null);
      } else {
        setWorkingPoId(submitted.id);
        setBasket(poLinesToBasketLines(recalcLines));
      }
      setActivityLog((a) =>
        log(
          a,
          "po_submitted",
          actor,
          `Kitchen order ${submitted.poNumber} sent to store`,
          submitted.id,
        ),
      );
      pushSupplyNotification({
        audience: ["store"],
        title: `Kitchen order — ${submitted.poNumber}`,
        body: `${actor.name} sent a kitchen purchase list (₦${total.toLocaleString()}) for store review`,
        href: "/supply/purchase-orders?tab=orders",
      });
      void persistSnapshotsNow();
      return { po: submitted };
    },
    [
      basket,
      purchaseOrders,
      poWorkspaceOrigin,
      workingPoId,
      persistSnapshotsNow,
    ],
  );

  const submitBasketAsPo = useCallback(
    (actor: Actor) => {
      sendBasketForApproval(actor);
    },
    [sendBasketForApproval],
  );

  const accountantDecision = useCallback(
    (poId: string, approved: boolean, comment: string, actor: Actor) => {
      if (!canSupplyPoAccountantReview(actor.role)) {
        toast.error("Store and purchaser cannot accept or reject purchase orders.");
        return;
      }
      const nowIso = new Date().toISOString();
      if (approved) setBasket([]);
      setPurchaseOrders((prev) => {
        const next = dedupePurchaseOrders(
          prev.map((po) =>
            po.id === poId
              ? {
                  ...po,
                  status: approved ? "pending_manager" : "accountant_rejected",
                  accountantComment: comment,
                  accountantDecidedBy: actor.name,
                  accountantDecidedRole: actor.role,
                  accountantDecidedAt: nowIso,
                  workflowUpdatedAt: nowIso,
                }
              : po,
          ),
        );
        purchaseOrdersRef.current = next;
        return next;
      });
      if (!approved) setWorkingPoId(null);
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
            href: "/supply/purchase-orders?tab=approvals",
          });
        } else {
          // Rejected lists return to store for edit/resend; kitchen is also notified.
          pushSupplyNotification({
            audience: ["store"],
            title: `PO rejected — ${po.poNumber}`,
            body: comment || "Accountant rejected this purchase order. Edit and resend.",
            href: "/supply/purchase-orders?tab=orders",
          });
          if (poOriginOf(po) === "kitchen") {
            pushSupplyNotification({
              audience: ["kitchen"],
              title: `Kitchen order rejected — ${po.poNumber}`,
              body:
                comment ||
                "Accountant rejected this kitchen order. Store will edit and resend.",
              href: "/supply/kitchen?tab=purchase",
            });
          }
        }
      }
      void persistSnapshotsNow();
    },
    [purchaseOrders, persistSnapshotsNow],
  );

  const managerDecision = useCallback(
    (poId: string, approved: boolean, comment: string, actor: Actor) => {
      if (!canSupplyPoManagerReview(actor.role)) {
        toast.error("Store and purchaser cannot accept or reject purchase orders.");
        return;
      }
      const nowIso = new Date().toISOString();
      setPurchaseOrders((prev) => {
        const next = dedupePurchaseOrders(
          prev.map((po) => {
            if (po.id !== poId) return po;
            if (!approved) {
              return {
                ...po,
                status: "manager_rejected" as const,
                managerComment: comment,
                managerDecidedBy: actor.name,
                managerDecidedRole: actor.role,
                managerDecidedAt: nowIso,
                workflowUpdatedAt: nowIso,
              };
            }
            const frozenLines = po.lines.map((l) => ({ ...l }));
            const total =
              Number(po.totalAmount) ||
              frozenLines.reduce((s, l) => s + (Number(l.lineTotal) || 0), 0);
            return {
              ...po,
              status: "disbursed" as const,
              managerComment: comment,
              managerDecidedBy: actor.name,
              managerDecidedRole: actor.role,
              managerDecidedAt: nowIso,
              approvedAt: nowIso,
              approvedLines: frozenLines,
              cashDisbursed: total,
              totalAmount: total,
              workflowUpdatedAt: nowIso,
            };
          }),
        );
        purchaseOrdersRef.current = next;
        return next;
      });
      if (approved) setWorkingPoId(null);
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
            title: `PO approved — ${po.poNumber}`,
            body: `Manager approved. Listed in Purchase Orders → History (read-only). Ready to buy at market from Retirement.`,
            href: "/supply/purchase-orders?tab=history",
          });
        } else {
          pushSupplyNotification({
            audience: ["store", "accountant"],
            title: `PO rejected by manager — ${po.poNumber}`,
            body: comment || "Manager rejected this purchase order.",
            href: "/supply/purchase-orders?tab=orders",
          });
        }
      }
      void persistSnapshotsNow();
    },
    [purchaseOrders, persistSnapshotsNow],
  );

  /** Testing: admin approves or rejects a raised PO in one step (skips accountant → manager chain). */
  const adminTestPoDecision = useCallback(
    (poId: string, approved: boolean, comment: string, actor: Actor) => {
      if (!canAdminTestApproveSupplyPo(actor.role)) {
        toast.error("Only administrator can use one-step PO approve/reject.");
        return;
      }
      const target = purchaseOrders.find((p) => p.id === poId);
      if (
        approved &&
        target &&
        (target.status === "pending_accountant" ||
          target.status === "pending_manager")
      ) {
        setBasket([]);
      }
      const nowIso = new Date().toISOString();
      setPurchaseOrders((prev) => {
        const next = prev.map((po) => {
          if (po.id !== poId) return po;
          if (
            po.status !== "pending_accountant" &&
            po.status !== "pending_manager"
          )
            return po;
          if (approved) {
            const frozenLines = po.lines.map((l) => ({ ...l }));
            const total =
              Number(po.totalAmount) ||
              frozenLines.reduce((s, l) => s + (Number(l.lineTotal) || 0), 0);
            return {
              ...po,
              status: "disbursed" as const,
              accountantComment: `[Admin test] ${comment}`,
              accountantDecidedBy: actor.name,
              accountantDecidedRole: actor.role,
              accountantDecidedAt: nowIso,
              managerDecidedBy: actor.name,
              managerDecidedRole: actor.role,
              managerDecidedAt: nowIso,
              approvedAt: nowIso,
              approvedLines: frozenLines,
              cashDisbursed: total,
              totalAmount: total,
              workflowUpdatedAt: nowIso,
            };
          }
          if (po.status === "pending_manager") {
            return {
              ...po,
              status: "manager_rejected" as const,
              managerComment: `[Admin test] ${comment}`,
              managerDecidedBy: actor.name,
              managerDecidedRole: actor.role,
              managerDecidedAt: nowIso,
              workflowUpdatedAt: nowIso,
            };
          }
          return {
            ...po,
            status: "accountant_rejected" as const,
            accountantComment: `[Admin test] ${comment}`,
            accountantDecidedBy: actor.name,
            accountantDecidedRole: actor.role,
            accountantDecidedAt: nowIso,
            workflowUpdatedAt: nowIso,
          };
        });
        purchaseOrdersRef.current = next;
        return next;
      });
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
        setWorkingPoId(null);
        pushSupplyNotification({
          audience: ["purchasing", "store"],
          title: `PO approved (admin test) — ${po.poNumber}`,
          body: comment || "Listed in Purchase Orders → History (read-only).",
          href: "/supply/purchase-orders?tab=history",
        });
      } else if (po && !approved) {
        pushSupplyNotification({
          audience: ["store"],
          title: `PO rejected (admin test) — ${po.poNumber}`,
          body: comment,
          href: "/supply/purchase-orders?tab=orders",
        });
        if (poOriginOf(po) === "kitchen") {
          pushSupplyNotification({
            audience: ["kitchen"],
            title: `Kitchen order rejected (admin test) — ${po.poNumber}`,
            body: comment,
            href: "/supply/kitchen?tab=purchase",
          });
        }
      }
      void persistSnapshotsNow();
    },
    [purchaseOrders, persistSnapshotsNow],
  );

  /** Mutate lines on a specific PO (accountant / privileged in-queue edits). */
  const mutatePurchaseOrderLine = useCallback(
    (
      poId: string,
      stockItemId: string,
      qty: number,
      unitPrice?: number,
      actor?: Actor,
    ): string | undefined => {
      let err: string | undefined;
      let basketPatch: BasketLine[] | undefined;
      const who = actor ?? { name: "Reviewer", role: "admin" };
      setPurchaseOrders((prev) => {
        const po = prev.find((p) => p.id === poId);
        if (!po) {
          err = "Purchase order not found";
          return prev;
        }
        if (
          !canEditStorePurchaseOrder(po) &&
          po.status !== "pending_accountant" &&
          po.status !== "pending_manager"
        ) {
          err = "This purchase order cannot be edited in its current status.";
          return prev;
        }
        let nextLines: PoLine[];
        let events: PoLineEditEvent[] = [];
        if (!Number.isFinite(qty) || qty <= 0) {
          const removed = po.lines.find((l) => l.stockItemId === stockItemId);
          nextLines = po.lines.filter((l) => l.stockItemId !== stockItemId);
          if (removed) {
            events = [
              {
                at: new Date().toISOString(),
                by: who.name,
                role: who.role,
                action: "removed",
                stockItemId: removed.stockItemId,
                name: removed.name,
                detail: `removed qty ${removed.quantityOrdered}`,
              },
            ];
          }
        } else {
          const existing = po.lines.find((l) => l.stockItemId === stockItemId);
          if (!existing) {
            err = "Line not found — add items from Store → Purchase orders.";
            return prev;
          }
          const draft: PoLine = {
            ...existing,
            quantityOrdered: qty,
            unitPrice: unitPrice ?? existing.unitPrice,
            lineTotal: qty * (unitPrice ?? existing.unitPrice),
            stockQuantityOrdered:
              existing.stockQuantityOrdered != null &&
              existing.quantityOrdered > 0
                ? (qty / existing.quantityOrdered) *
                  existing.stockQuantityOrdered
                : qty,
          };
          const stamped = stampPoLineEdit(draft, who, existing);
          nextLines = po.lines.map((l) =>
            l.stockItemId === stockItemId ? stamped.line : l,
          );
          if (stamped.event) events = [stamped.event];
        }
        const { total, lines } = recalcPoTotals(nextLines);
        if (
          workingPoId === poId ||
          getActivePurchaseOrder(prev, poWorkspaceOrigin, workingPoId)?.id ===
            poId
        ) {
          basketPatch = poLinesToBasketLines(lines);
        }
        const editMeta = appendPoLineEdits(po, events, who);
        return prev.map((p) =>
          p.id === poId
            ? {
                ...p,
                ...editMeta,
                lines,
                totalAmount: total,
                cashDisbursed: total,
              }
            : p,
        );
      });
      if (basketPatch !== undefined) setBasket(basketPatch);
      schedulePersistSnapshots();
      return err;
    },
    [poWorkspaceOrigin, workingPoId, schedulePersistSnapshots],
  );

  const applyRetirementToStock = useCallback(
    (po: PurchaseOrder, lines: RetirementLine[]) => {
      const result = applyRetirementLinesToCatalog(
        storeItemsRef.current,
        po,
        lines,
      );
      storeItemsRef.current = result.next;
      setStoreItems(result.next);
      markLocalSupplyMutation();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("frontbill:supply-stock-changed"));
      }
      if (
        useDbPersistence &&
        hasPermission(role, "supply:store") &&
        result.posted > 0
      ) {
        void syncSupplyCatalog(
          userId,
          result.next.map(applyStoreItemDeptFields),
          orgIdRef.current || undefined,
        ).catch((err) => {
          if (isRetryableSupplyError(err)) {
            console.warn("[supply-chain] retirement catalogue sync retryable:", err);
            return;
          }
          const message =
            err instanceof Error
              ? err.message
              : "Failed to save retired stock to central store";
          console.error("[supply-chain] retirement catalogue sync failed", err);
          toast.error(message);
        });
      }
      return result.posted;
    },
    [useDbPersistence, userId, role],
  );

  const submitAddToStock = useCallback(
    (
      poId: string,
      lines: RetirementLine[],
      actor: Actor,
    ): { ok: true; posted: number; stampedLineIds: string[] } | { error: string } => {
      if (!canAddPurchasedToStock(actor.role)) {
        return { error: "You do not have permission to add items to stock." };
      }
      const po = purchaseOrders.find((p) => p.id === poId);
      if (!po) return { error: "Purchase order not found" };
      if (po.status === "retired") {
        return { error: "This purchase order is already retired" };
      }
      const batchLines = lines
        .map((l) => ({
          ...l,
          notBought: l.notBought ?? l.removed ?? false,
        }))
        .filter((l) => !l.notBought && l.quantityBought > 0);
      if (!batchLines.length) {
        return { error: "Select at least one item with quantity to add to stock." };
      }

      const nowIso = new Date().toISOString();
      const batchId = `ats-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const stamped = batchLines.map((l) => ({
        ...l,
        stockedAt: nowIso,
        stockedBy: actor.name,
        batchId,
        reviewStatus: "pending_review" as const,
      }));
      const batchSpend = stamped.reduce((s, l) => s + l.totalPaid, 0);
      const posted = applyRetirementToStock(po, stamped);
      markLocalSupplyMutation();

      setPurchaseOrders((prev) => {
        const next = prev.map((p) => {
          if (p.id !== poId) return p;
          const prevLines = p.retirement?.lines ?? [];
          const mergedLines = [...prevLines, ...stamped];
          const actualSpent = mergedLines
            .filter((l) => !(l.notBought || l.removed))
            .reduce((s, l) => s + l.totalPaid, 0);
          const refund = p.cashDisbursed - actualSpent;
          const batch = {
            id: batchId,
            submittedAt: nowIso,
            submittedBy: actor.name,
            lineIds: stamped.map((l) => l.lineId),
            actualSpent: batchSpend,
            status: "pending_review" as const,
          };
          return {
            ...p,
            status: "retirement_pending_accountant" as const,
            workflowUpdatedAt: nowIso,
            retirement: {
              actualSpent,
              refundToCashier: refund,
              priceChanges: mergedLines.filter(
                (l) => !(l.notBought || l.removed) && l.poPrice !== l.actualPrice,
              ).length,
              lines: mergedLines,
              batches: [...(p.retirement?.batches ?? []), batch],
              submittedAt: nowIso,
              submittedBy: actor.name,
              accountantComment: p.retirement?.accountantComment,
              reviewedAt: undefined,
              reviewedBy: undefined,
            },
          };
        });
        purchaseOrdersRef.current = next;
        return next;
      });

      setActivityLog((a) =>
        log(
          a,
          "stock_received",
          actor,
          `Add to stock — ${stamped.length} line(s), ₦${batchSpend.toLocaleString()} (awaiting retirement review)`,
          poId,
        ),
      );
      pushSupplyNotification({
        audience: ["accountant", "manager"],
        title: `Stock added — ${po.poNumber}`,
        body: `${actor.name} added ${stamped.length} item(s) to Central Store. Review under Retirement.`,
        href: "/supply/purchasing?tab=retirement",
      });
      void persistSnapshotsNow();
      return { ok: true as const, posted, stampedLineIds: stamped.map((l) => l.lineId) };
    },
    [purchaseOrders, applyRetirementToStock, persistSnapshotsNow],
  );

  const submitRetirement = useCallback(
    (poId: string, lines: RetirementLine[], actor: Actor) => {
      const res = submitAddToStock(poId, lines, actor);
      if (res && "error" in res) {
        toast.error(res.error);
        return;
      }
      if (res && "posted" in res) {
        if (res.posted > 0) {
          toast.success(
            `${res.posted} item${res.posted === 1 ? "" : "s"} added to Central Store stock`,
          );
        } else {
          toast.error(
            "Saved, but no catalogue lines matched — stock was not increased",
          );
        }
      }
    },
    [submitAddToStock],
  );

  const accountantRetirementDecision = useCallback(
    (
      poId: string,
      approved: boolean,
      comment: string,
      actor: Actor,
    ): { ok: true } | { error: string } => {
      if (!canSupplyRetirementReview(actor.role)) {
        return {
          error:
            "Only accountant, manager, or administrator can accept or reject retirement.",
        };
      }
      const po = purchaseOrders.find((p) => p.id === poId);
      if (!po?.retirement) return { error: "Retirement not found" };
      if (!hasPendingRetirementReview(po)) {
        return { error: "There are no Add-to-stock items awaiting review" };
      }

      const nowIso = new Date().toISOString();
      markLocalSupplyMutation();

      const { lines: nextLines, batches: nextBatches, status: nextStatus } =
        applyRetirementBatchDecision(po, approved, comment, actor.name, nowIso);

      const actualSpent = nextLines
        .filter((l) => !(l.notBought || l.removed))
        .reduce((s, l) => s + (Number(l.totalPaid) || 0), 0);
      const refund = po.cashDisbursed - actualSpent;
      const remaining = poHasRemainingAddToStockLines({
        ...po,
        retirement: { ...po.retirement, lines: nextLines, batches: nextBatches },
      });

      // Stock was already posted on Add to stock — only apply legacy lines missing stockedAt
      // among the batch being decided (should be rare).
      const legacyToApply = nextLines.filter(
        (l) =>
          !(l.notBought || l.removed) &&
          !l.stockedAt &&
          l.quantityBought > 0 &&
          l.reviewStatus === (approved ? "accepted" : "rejected"),
      );
      const posted =
        approved && legacyToApply.length > 0
          ? applyRetirementToStock(po, legacyToApply)
          : 0;

      setPurchaseOrders((prev) => {
        const next = prev.map((p) =>
          p.id === poId
            ? {
                ...p,
                status: nextStatus,
                retirementComment: comment,
                workflowUpdatedAt: nowIso,
                retirement: {
                  ...p.retirement!,
                  actualSpent,
                  refundToCashier: refund,
                  priceChanges: nextLines.filter(
                    (l) =>
                      !(l.notBought || l.removed) && l.poPrice !== l.actualPrice,
                  ).length,
                  lines: nextLines,
                  batches: nextBatches,
                  accountantComment: comment,
                  reviewedAt: nowIso,
                  reviewedBy: actor.name,
                  submittedAt: p.retirement?.submittedAt ?? nowIso,
                  submittedBy: p.retirement?.submittedBy ?? actor.name,
                },
              }
            : p,
        );
        purchaseOrdersRef.current = next;
        return next;
      });

      if (approved && nextStatus === "retired") {
        setBasket([]);
      }

      setActivityLog((a) =>
        log(
          a,
          "retirement_submitted",
          actor,
          approved
            ? remaining
              ? `Retirement batch accepted — remaining items stay on Add to stock. ${comment}`
              : `Retirement accepted — PO complete / History. ${comment}`
            : `Retirement batch rejected — returned to Active. ${comment}`,
          poId,
        ),
      );

      if (approved) {
        pushSupplyNotification({
          audience: ["store", "purchasing", "cashier"],
          title: remaining
            ? `Batch accepted — ${po.poNumber}`
            : `Retirement complete — ${po.poNumber}`,
          body: remaining
            ? `Accepted stocked items only. Remaining lines stay on Add to stock.`
            : `Refund purchaser: ₦${refund.toLocaleString()}.`,
          href: remaining
            ? "/supply/purchasing?tab=active"
            : "/supply/purchasing?tab=history",
        });
        if (posted > 0) {
          toast.success(
            `${posted} item${posted === 1 ? "" : "s"} added to Central Store stock`,
          );
        } else if (remaining) {
          toast.success(
            "Accepted stocked items only — remaining items stay on Add to stock",
          );
        } else {
          toast.success("Retirement accepted — PO moved to History");
        }
      } else {
        pushSupplyNotification({
          audience: ["purchasing", "store"],
          title: `Retirement rejected — ${po.poNumber}`,
          body:
            (comment || "Returned to Active for more Add to stock.") +
            " Stock already posted was not removed. Unstocked items remain on Active.",
          href: "/supply/purchasing?tab=active",
        });
        toast.success(
          "Returned to Active. Unstocked items remain; stock already posted was not removed.",
        );
      }

      void persistSnapshotsNow();
      return { ok: true };
    },
    [purchaseOrders, applyRetirementToStock, persistSnapshotsNow],
  );

  const deleteActivePurchaseOrder = useCallback(
    (actor: Actor): { ok: true } | { error: string } => {
      const po = getActivePurchaseOrder(
        purchaseOrders,
        poWorkspaceOrigin,
        workingPoId,
      );
      if (!po) return { error: "No active purchase order to delete" };
      if (
        ![
          "draft",
          "accountant_rejected",
          "manager_rejected",
          "retirement_rejected",
        ].includes(po.status)
      ) {
        return {
          error:
            "Only draft or rejected POs can be deleted (not ones already sent for approval)",
        };
      }
      const nowIso = new Date().toISOString();
      // Soft-delete tombstone — hard-removing the row lets cloud merge resurrect it.
      setPurchaseOrders((prev) => {
        const next = prev.map((p) =>
          p.id === po.id
            ? {
                ...p,
                deletedAt: nowIso,
                deletedBy: actor.name,
                workflowUpdatedAt: nowIso,
                lines: [],
                totalAmount: 0,
                cashDisbursed: 0,
              }
            : p,
        );
        purchaseOrdersRef.current = next;
        return next;
      });
      setBasket([]);
      setWorkingPoId(null);
      setActivityLog((a) =>
        log(
          a,
          "po_created",
          actor,
          `Purchase order ${po.poNumber} deleted`,
          po.id,
        ),
      );
      void persistSnapshotsNow();
      return { ok: true };
    },
    [purchaseOrders, poWorkspaceOrigin, workingPoId, persistSnapshotsNow],
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
      if (!canOperateKitchenProduction(actor.role)) {
        return { error: "Auditor can view kitchen batches but cannot open a production run." };
      }
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) return { error: "Batch standard not found" };
      if (!Number.isFinite(plannedPortions) || plannedPortions <= 0) {
        return { error: "Enter planned portions" };
      }

      const inProgress = batches.find(
        (b) =>
          b.recipeId === recipeId &&
          b.status === "in_progress" &&
          !isProductionBatchDeleted(b),
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
      persistSnapshotsNow();
      return { ok: true, batch };
    },
    [
      recipes,
      kitchenStock,
      batches,
      recipeTotalCostWithLivePrices,
      recipeGrossMarginPctWithLivePrices,
      persistSnapshotsNow,
    ],
  );

  const openKitchenBatchFromMaterials = useCallback(
    (
      input: CreateKitchenBatchInput,
      actor: Actor,
    ): { ok: true; kitchenStockId: string; recipeId: string } | { error: string } => {
      if (!canManageKitchenBatchStandards(actor.role)) {
        return { error: "Only Admin or Superadmin can create a kitchen batch" };
      }
      const batchName = toTitleCaseWords(input.batchName);
      const menuCategory = toTitleCaseWords(input.menuCategory);
      if (!batchName) return { error: "Enter a batch / menu name" };
      if (!menuCategory) return { error: "Select a menu category for the restaurant" };
      if (!Number.isFinite(input.plannedPortions) || input.plannedPortions <= 0) {
        return { error: "Enter planned portions for this batch" };
      }

      const materials = dedupeBatchMaterials(
        input.materials.filter((m) => m.quantity > 0),
      );
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
        description: (input.description ?? input.notes)?.trim() || undefined,
        updatedAt: new Date().toISOString(),
      };
      setRecipes((prev) => {
        const idx = prev.findIndex((r) => r.id === recipeId || r.name === batchName);
        const next =
          idx >= 0
            ? prev.map((r, i) => (i === idx ? { ...recipeRow, id: r.id } : r))
            : [recipeRow, ...prev];
        recipesRef.current = next;
        return next;
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
      void persistSnapshotsNow();
      return { ok: true, kitchenStockId, recipeId };
    },
    [storeItems, persistSnapshotsNow],
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
        description?: string;
      },
      actor: Actor,
    ):
      | { ok: true; kitchenStockId: string; menuItemName: string; category: string; outletMenuSync: import("./types").BatchOutletMenuSync }
      | { error: string } => {
      if (!canManageKitchenBatchStandards(actor.role)) {
        return { error: "Only Admin or Superadmin can edit a kitchen batch" };
      }
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
      const ingredientsRaw = patch.ingredients ?? existing.ingredients;
      const ingredients = dedupeBatchMaterials(
        ingredientsRaw.map((ing) => ({
          storeItemId: ing.stockItemId,
          name: ing.name,
          unit: ing.unit,
          quantity: ing.quantity,
          unitCost: ing.quantity > 0 ? ing.cost / ing.quantity : 0,
          source: ing.source ?? "raw",
          optional: ing.optional,
          lineCost: ing.cost,
        })),
      ).map((m) => ({
        stockItemId: m.storeItemId,
        name: m.name,
        quantity: m.quantity,
        unit: m.unit,
        cost: m.lineCost ?? m.quantity * m.unitCost,
        source: m.source ?? "raw",
        optional: m.optional,
      }));
      const outletMenuSync = normalizeBatchOutletMenuSync(
        patch.outletMenuSync ?? patch.fnbEligible ?? existing.outletMenuSync ?? existing.fnbEligible,
      );
      const description =
        patch.description !== undefined
          ? patch.description.trim() || undefined
          : existing.description;

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
        description,
        updatedAt: new Date().toISOString(),
      };

      const kitchenRow = kitchenStock.find((k) => k.linkedRecipeId === recipeId);
      const kitchenStockId =
        kitchenRow?.id ?? `ks-${outletStockSlug(name)}`;

      setRecipes((prev) => {
        const next = prev.map((r) => (r.id === recipeId ? updated : r));
        recipesRef.current = next;
        return next;
      });
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
      void persistSnapshotsNow();
      return { ok: true, kitchenStockId, menuItemName: name, category, outletMenuSync };
    },
    [recipes, kitchenStock, persistSnapshotsNow],
  );

  const deleteRecipe = useCallback(
    (recipeId: string, actor: Actor): { ok: true } | { error: string } => {
      if (!canManageKitchenBatchStandards(actor.role)) {
        return { error: "Only Admin or Superadmin can delete a kitchen batch" };
      }
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
    clearAllKitchenBatchDrafts();
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
      if (!canOperateKitchenProduction(actor.role)) {
        return { error: "You do not have permission to delete a production run." };
      }
      const batch = batches.find((b) => b.id === batchId);
      if (!batch || isProductionBatchDeleted(batch)) {
        return { error: "Production batch not found" };
      }
      if (batch.status !== "in_progress") {
        return { error: "Only in-progress batches can be deleted" };
      }

      if (batch.deductedMaterials?.length) {
        returnKitchenRawMaterials(batch.deductedMaterials);
      }

      const nowIso = new Date().toISOString();
      markLocalSupplyMutation();
      setBatches((prev) =>
        prev.map((b) =>
          b.id === batchId ? { ...b, deletedAt: nowIso } : b,
        ),
      );
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
    clearAllKitchenBatchDrafts();
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
      markLocalSupplyMutation();
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
            broadcastSupplyLiveUpdate();
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
      markLocalSupplyMutation();
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
            broadcastSupplyLiveUpdate();
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
      markLocalSupplyMutation();
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
            broadcastSupplyLiveUpdate();
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
        audience: ["admin"],
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
    ): { ok: true } | { error: string } => {
      if (!canOperateKitchenProduction(actor.role)) {
        return { error: "You do not have permission to close a production run." };
      }
      const batch = batches.find((b) => b.id === batchId);
      if (!batch || isProductionBatchDeleted(batch)) {
        return { error: "Production batch not found" };
      }
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
        const onHand =
          line.source === "kitchen_stock"
            ? kitchenStock.find((k) => k.id === line.storeItemId)?.availablePortions ?? 0
            : kitchenRawOnHand(line.storeItemId);
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
              quantity: l.quantity,
            })),
        );
        const kitchenStockLines = materialLines.filter(
          (l) => l.quantity > 0 && l.source === "kitchen_stock",
        );
        if (kitchenStockLines.length) {
          setKitchenStock((prev) =>
            prev.map((k) => {
              const line = kitchenStockLines.find((l) => l.storeItemId === k.id);
              if (!line) return k;
              return {
                ...k,
                availablePortions: Math.max(0, k.availablePortions - line.quantity),
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
                    quantity: l.quantity,
                  })),
                deductedKitchenStock: materialLines
                  .filter((l) => l.quantity > 0 && l.source === "kitchen_stock")
                  .map((l) => ({
                    kitchenStockId: l.storeItemId,
                    quantity: l.quantity,
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
      persistSnapshotsNow();
      return { ok: true };
    },
    [
      batches,
      recipes,
      kitchenStock,
      kitchenRawOnHand,
      deductKitchenRawMaterials,
      recipeTotalCostWithLivePrices,
      recipeGrossMarginPctWithLivePrices,
      persistSnapshotsNow,
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
      if (!store) {
        return { error: "Item not found" };
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
        const next = normalizeBarStockRows(prev);
        const canonicalId = canonicalBarStockId(storeItemId);
        const idx = next.findIndex(
          (b) => b.storeItemId === storeItemId || b.id === canonicalId,
        );
        if (idx >= 0) {
          return normalizeBarStockRows(
            next.map((b, i) =>
              i === idx
                ? {
                    ...b,
                    id: canonicalId,
                    storeItemId,
                    name: store.name,
                    unit: store.unit,
                    quantityOnHand: b.quantityOnHand + qty,
                    unitsPerSale: Math.max(1, b.unitsPerSale || 1),
                  }
                : b,
            ),
          );
        }
        return normalizeBarStockRows([
          ...next,
          {
            id: canonicalId,
            storeItemId,
            name: store.name,
            quantityOnHand: qty,
            reorderLevel: store.reorderLevel,
            unitsPerSale: 1,
            unit: store.unit,
          },
        ]);
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
    return isMainBarIssueDestination(destination);
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

      const toMainBar = destinationCreditsBarStock(dest);

      if (toMainBar) {
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
      void persistSnapshotsNow();
      return { ok: true, issued: lines.length };
    },
    [issueFromStoreToDepartment, storeItems, persistSnapshotsNow],
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

  const setFnbItemCategory = useCallback(
    (
      fnbRawId: string,
      categoryId: string,
      categoryName: string,
      actor: Actor,
    ): { ok: true } | { error: string } => {
      if (!canManageFnbStore(role)) {
        return {
          error:
            "Only F&B, Admin, Manager, or Superadmin can assign drink categories",
        };
      }
      const row = fnbRawStock.find((f) => f.id === fnbRawId);
      if (!row) return { error: "F&B stock item not found" };
      const name = categoryName.trim();
      setFnbRawStock((prev) =>
        prev.map((f) =>
          f.id === fnbRawId
            ? {
                ...f,
                drinkCategoryId: categoryId || undefined,
                drinkCategoryName: name || undefined,
              }
            : f,
        ),
      );
      setActivityLog((a) =>
        log(
          a,
          "recipe_updated",
          actor,
          name
            ? `F&B category: ${row.name} → ${name} (${formatSupplyActorStamp(actor.name)})`
            : `F&B category cleared: ${row.name} (${formatSupplyActorStamp(actor.name)})`,
          fnbRawId,
        ),
      );
      schedulePersistSnapshots();
      notifyFnbDailyChanged();
      return { ok: true as const };
    },
    [fnbRawStock, role, schedulePersistSnapshots],
  );

  const transferFnbToMainBar = useCallback(
    (
      fnbRawId: string,
      qty: number,
      actor: Actor,
      opts?: { notes?: string },
    ):
      | { ok: true; barStockId: string; itemName: string; unit: string; unitPrice: number; categoryName: string; categoryId: string | null }
      | { error: string } => {
      if (!canManageFnbStore(role)) {
        return {
          error:
            "Only F&B, Admin, Manager, or Superadmin can move items from F&B Store to Main Bar",
        };
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        return { error: "Enter a quantity to move to Main Bar" };
      }
      const row = fnbRawStock.find((f) => f.id === fnbRawId);
      if (!row) return { error: "F&B stock item not found" };
      if (row.quantityOnHand < qty) {
        return {
          error: `Insufficient ${row.name} in F&B Store (${row.quantityOnHand} ${row.unit} on hand)`,
        };
      }

      const barStockId = canonicalBarStockId(row.storeItemId);
      const note = opts?.notes?.trim();
      const stamp = formatSupplyActorStamp(actor.name);

      markLocalSupplyMutation();

      setFnbRawStock((prev) =>
        prev.map((f) =>
          f.id === fnbRawId
            ? { ...f, quantityOnHand: Math.max(0, f.quantityOnHand - qty) }
            : f,
        ),
      );

      setBarStock((prev) => {
        const next = normalizeBarStockRows(prev)
        const idx = next.findIndex((b) => b.storeItemId === row.storeItemId)
        if (idx >= 0) {
          return normalizeBarStockRows(
            next.map((b, i) =>
              i === idx
                ? {
                    ...b,
                    id: barStockId,
                    name: row.name,
                    unit: row.unit,
                    quantityOnHand: b.quantityOnHand + qty,
                    unitsPerSale: Math.max(1, b.unitsPerSale || 1),
                  }
                : b,
            ),
          )
        }
        return normalizeBarStockRows([
          ...next,
          {
            id: barStockId,
            storeItemId: row.storeItemId,
            name: row.name,
            quantityOnHand: qty,
            reorderLevel: row.reorderLevel,
            unitsPerSale: 1,
            unit: row.unit,
          },
        ])
      });

      const movement: FnbMovement = {
        id: uid("fnbmv"),
        fnbRawId,
        storeItemId: row.storeItemId,
        itemName: row.name,
        quantity: qty,
        unit: row.unit,
        kind: "to_main_bar",
        note: note || undefined,
        actorName: actor.name,
        actorRole: actor.role,
        at: new Date().toISOString(),
      };
      setFnbMovements((prev) => [movement, ...prev]);

      const extra = note ? ` · ${note}` : "";
      setActivityLog((a) =>
        log(
          a,
          "fnb_transferred_bar",
          actor,
          `Moved ${qty} ${row.unit} ${row.name} F&B Store → Main Bar (${stamp})${extra}`,
          fnbRawId,
        ),
      );
      notifyFnbRawStockChanged();
      notifyBarStockChanged();
      notifyFnbDailyChanged();
      schedulePersistSnapshots();
      return {
        ok: true as const,
        barStockId,
        itemName: row.name,
        unit: row.unit,
        unitPrice: row.sellingPricePerPortion ?? 0,
        categoryName: row.drinkCategoryName?.trim() || "Beverages",
        categoryId: row.drinkCategoryId?.trim() || null,
      };
    },
    [fnbRawStock, role, schedulePersistSnapshots],
  );

  const saveFnbDailySheet = useCallback(
    (
      date: string,
      lines: FnbDailySheetLine[],
      actor: Actor,
    ): { ok: true; stamp: string } | { error: string } => {
      if (!canManageFnbStore(role)) {
        return {
          error:
            "Only F&B, Admin, Manager, or Superadmin can save the F&B daily inventory",
        };
      }
      const ymd = date.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        return { error: "Pick a valid date" };
      }

      const now = new Date().toISOString();
      const stamp = formatSupplyActorStamp(actor.name, now);
      const movements: FnbMovement[] = [];
      const nets = new Map<string, number>();
      const prices = new Map<string, number>();

      for (const line of lines) {
        const item = fnbRawStock.find((f) => f.id === line.itemId);
        if (!item) continue;
        const dComp =
          Math.max(0, line.complimentary) - Math.max(0, line.appliedComplimentary ?? 0);
        const dSold = Math.max(0, line.soldQty) - Math.max(0, line.appliedSold ?? 0);
        const dDmg = Math.max(0, line.damage) - Math.max(0, line.appliedDamage ?? 0);
        const net = dComp + dSold + dDmg;
        if (net > item.quantityOnHand + 1e-9) {
          return {
            error: `Insufficient ${item.name} in F&B Store for complimentary / sold / damage (need ${net}, have ${item.quantityOnHand} ${item.unit})`,
          };
        }
        nets.set(item.id, net);
        prices.set(item.id, Math.max(0, line.unitPrice));
        if (dComp > 0) {
          movements.push({
            id: uid("fnbmv"),
            fnbRawId: item.id,
            storeItemId: item.storeItemId,
            itemName: item.name,
            quantity: dComp,
            unit: item.unit,
            kind: "complimentary",
            note: line.complimentaryNote?.trim() || undefined,
            actorName: actor.name,
            actorRole: actor.role,
            at: now,
          });
        }
        if (dSold > 0) {
          movements.push({
            id: uid("fnbmv"),
            fnbRawId: item.id,
            storeItemId: item.storeItemId,
            itemName: item.name,
            quantity: dSold,
            unit: item.unit,
            kind: "sold",
            actorName: actor.name,
            actorRole: actor.role,
            at: now,
          });
        }
        if (dDmg > 0) {
          movements.push({
            id: uid("fnbmv"),
            fnbRawId: item.id,
            storeItemId: item.storeItemId,
            itemName: item.name,
            quantity: dDmg,
            unit: item.unit,
            kind: "damage",
            note: line.remark?.trim() || undefined,
            actorName: actor.name,
            actorRole: actor.role,
            at: now,
          });
        }
      }

      setFnbRawStock((prev) =>
        prev.map((item) => {
          const net = nets.get(item.id) ?? 0;
          const price = prices.get(item.id);
          const nextQty = Math.max(0, item.quantityOnHand - net);
          const nextPrice =
            price != null && price !== item.sellingPricePerPortion
              ? price
              : item.sellingPricePerPortion;
          if (nextQty === item.quantityOnHand && nextPrice === item.sellingPricePerPortion) {
            return item;
          }
          return {
            ...item,
            quantityOnHand: nextQty,
            sellingPricePerPortion: nextPrice,
          };
        }),
      );

      const persistedLines: FnbDailySheetLine[] = lines.map((l) => ({
        ...l,
        appliedComplimentary: Math.max(0, l.complimentary),
        appliedSold: Math.max(0, l.soldQty),
        appliedDamage: Math.max(0, l.damage),
      }));

      const sheet: FnbDailySheet = {
        date: ymd,
        lines: persistedLines,
        savedAt: now,
        savedBy: actor.name,
        savedByRole: actor.role,
      };

      setFnbDailySheets((prev) => {
        const idx = prev.findIndex((s) => s.date === ymd);
        if (idx >= 0) {
          return prev.map((s, i) => (i === idx ? sheet : s));
        }
        return [sheet, ...prev];
      });

      if (movements.length) {
        setFnbMovements((prev) => [...movements, ...prev]);
      }

      setActivityLog((a) =>
        log(
          a,
          "fnb_sheet_saved",
          actor,
          `F&B daily inventory saved for ${ymd} (${stamp})`,
          ymd,
        ),
      );
      notifyFnbRawStockChanged();
      notifyFnbDailyChanged();
      schedulePersistSnapshots();
      return { ok: true as const, stamp };
    },
    [fnbRawStock, role, schedulePersistSnapshots],
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
      let touchedBar = false;
      let touchedKitchen = false;
      markLocalSupplyMutation();

      for (const line of lines) {
        const link = resolveOutletItemStock(
          line.item,
          department,
          kitchenStock,
          barStock,
        );
        if (!link.tracked || !link.stockId) continue;
        const deduct = Math.max(1, link.portionsPerSale) * line.qty;
        if (link.source === "kitchen") {
          touchedKitchen = true;
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
          touchedBar = true;
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
      if (touchedBar) notifyBarStockChanged();
      if (touchedKitchen) notifyKitchenRawStockChanged();
      if (touchedBar || touchedKitchen) schedulePersistSnapshots();
    },
    [kitchenStock, barStock, schedulePersistSnapshots],
  );

  const draftLines = useMemo(() => {
    // Chef cart is only the kitchen draft PO — never the org/store basket snapshot.
    if (poWorkspaceOrigin === "kitchen") {
      const kitchenPo = getActivePurchaseOrder(
        purchaseOrders,
        "kitchen",
        workingPoId,
      );
      if (
        kitchenPo &&
        showsStoreDraftPurchaseList(kitchenPo) &&
        !isPurchaseOrderDeleted(kitchenPo)
      ) {
        return poLinesToBasketLines(kitchenPo.lines);
      }
      return [];
    }
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
  }, [
    activePurchaseOrder,
    basket,
    poWorkspaceOrigin,
    purchaseOrders,
    workingPoId,
  ]);

  const stats = useMemo(
    () => ({
      totalStoreItems: storeItems.length,
      stockAlerts: storeItems.filter((s) => s.quantityInStore <= s.reorderLevel)
        .length,
      basketTotal: draftLines.reduce((s, b) => s + b.qtyToBuy * b.unitPrice, 0),
      basketCount: draftLines.length,
      activeBatches: visibleProductionBatches(batches).filter(
        (b) => b.status === "in_progress",
      ).length,
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
    workingPoId,
    selectWorkingPurchaseOrder,
    setPurchaseWorkspaceOrigin,
    poWorkspaceOrigin,
    kitchenOrdersAtStore: listKitchenOrdersAtStore(purchaseOrders),
    ordersAwaitingAccountant: listOrdersAwaitingAccountant(purchaseOrders),
    ordersAwaitingManager: listOrdersAwaitingManager(purchaseOrders),
    addToBasket,
    setBasketLineQty,
    removeFromBasket,
    clearBasket,
    sendBasketForApproval,
    sendKitchenOrderToStore,
    submitBasketAsPo,
    // Hide soft-deleted tombstones from UI; keep them in state for cloud merge.
    purchaseOrders: visiblePurchaseOrders(purchaseOrders),
    mutatePurchaseOrderLine,
    accountantDecision,
    managerDecision,
    adminTestPoDecision,
    submitAddToStock,
    submitRetirement,
    accountantRetirementDecision,
    deleteActivePurchaseOrder,
    recipes,
    kitchenStock,
    kitchenRawStock,
    fnbRawStock,
    fnbDailySheets,
    fnbMovements,
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
    setFnbItemCategory,
    transferFnbToMainBar,
    saveFnbDailySheet,
    kickstartOutletMenuStock,
    issueRawToKitchenPortions,
    getOutletItemStock,
    validateOutletCart,
    deductOutletCart,
    batches: visibleProductionBatches(batches),
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
    fnbDailySheets: ctx.fnbDailySheets ?? [],
    fnbMovements: ctx.fnbMovements ?? [],
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
    setFnbItemCategory:
      ctx.setFnbItemCategory ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    transferFnbToMainBar:
      ctx.transferFnbToMainBar ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    saveFnbDailySheet:
      ctx.saveFnbDailySheet ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    accountantRetirementDecision:
      ctx.accountantRetirementDecision ??
      (() => ({ error: "Supply chain not ready — refresh the page" })),
    submitAddToStock:
      ctx.submitAddToStock ??
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
    sendKitchenOrderToStore:
      ctx.sendKitchenOrderToStore ??
      (() => ({ error: "Kitchen PO not ready — refresh the page" })),
    mutatePurchaseOrderLine:
      ctx.mutatePurchaseOrderLine ??
      (() => "Supply chain not ready — refresh the page"),
    selectWorkingPurchaseOrder: ctx.selectWorkingPurchaseOrder ?? (() => {}),
    setPurchaseWorkspaceOrigin: ctx.setPurchaseWorkspaceOrigin ?? (() => {}),
    poWorkspaceOrigin: ctx.poWorkspaceOrigin ?? "store",
    kitchenOrdersAtStore: ctx.kitchenOrdersAtStore ?? [],
    ordersAwaitingAccountant: ctx.ordersAwaitingAccountant ?? [],
    ordersAwaitingManager: ctx.ordersAwaitingManager ?? [],
  };
}
