'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSupplyChain } from '@/lib/supply-chain/supply-chain-context'
import type { BatchMaterialLine, StoreItem } from '@/lib/supply-chain/types'
import { canonicalRoleKey } from '@/lib/permissions'
import { formatNaira } from '@/lib/utils/currency'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Search, Trash2, ChefHat, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  clearKitchenBatchDraft,
  KITCHEN_BATCH_DRAFT_VERSION,
  loadKitchenBatchDraft,
  persistKitchenBatchDraft,
} from '@/lib/supply-chain/kitchen-batch-draft'
import {
  mergeUnitFactors,
  needsUnitFactor,
} from '@/lib/supply-chain/unit-factor-storage'
import { UnitConversionField } from '@/components/supply-chain/unit-conversion-field'
import { OutletCategorySearchField } from '@/components/supply-chain/outlet-category-search-field'
import { OutletMenuItemSearchField } from '@/components/supply-chain/outlet-menu-item-search-field'
import { outletStockSlug } from '@/lib/outlets/outlet-stock-slug'
import {
  defaultUnitForStoreItem,
  formatQuantityDisplay,
  materialCostForUnit,
  normalizeMeasurementUnit,
  parseQuantityInput,
  sanitizeQuantityInput,
  type MeasurementUnit,
} from '@/lib/supply-chain/measurement-units'
import { UnitSelect } from '@/components/supply-chain/unit-select'
import { toTitleCaseWords } from '@/lib/supply-chain/title-case'
import type { BatchOutletMenuSync } from '@/lib/supply-chain/batch-outlet-sync'
import {
  batchOutletMenuSyncLabel,
  normalizeBatchOutletMenuSync,
  shouldSyncBatchToOutlet,
} from '@/lib/supply-chain/batch-outlet-sync'
import { syncBatchToRestaurantOutlet } from '@/lib/supply-chain/sync-restaurant-outlet'
import { KITCHEN_BATCH_UNITS } from '@/lib/supply-chain/conversion-units'

const BATCH_CREATOR_ROLES = new Set(['superadmin', 'admin', 'manager'])

const numberInputValue = (value: number | null | undefined) =>
  value != null && Number(value) !== 0 ? String(value) : ''

type Props = {
  /** When set, builder edits an existing batch standard instead of creating new. */
  editRecipeId?: string | null
  onSaved?: () => void
  onCancel?: () => void
}

export function KitchenBatchBuilder({ editRecipeId, onSaved, onCancel }: Props = {}) {
  const { name, role } = useAuth()
  const {
    storeItems,
    kitchenRawStock,
    kitchenRawOnHand,
    recipes,
    openKitchenBatchFromMaterials,
    updateRecipe,
  } = useSupplyChain()
  const editing = Boolean(editRecipeId)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [addAsOptional, setAddAsOptional] = useState(false)
  const [batchName, setBatchName] = useState('')
  const [menuItemId, setMenuItemId] = useState<string | null>(null)
  const [linkedKitchenStockId, setLinkedKitchenStockId] = useState<string | null>(null)
  const [menuCategory, setMenuCategory] = useState('')
  const [menuCategoryId, setMenuCategoryId] = useState<string | null>(null)
  const [plannedPortions, setPlannedPortions] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [overheadLabour, setOverheadLabour] = useState('')
  const [overheadGas, setOverheadGas] = useState('')
  const [overheadOther, setOverheadOther] = useState('')
  const [outletMenuSync, setOutletMenuSync] = useState<BatchOutletMenuSync>('none')
  const [notes, setNotes] = useState('')
  const [cart, setCart] = useState<BatchMaterialLine[]>([])
  const [optionalCart, setOptionalCart] = useState<BatchMaterialLine[]>([])
  const [optionalIngredientsOpen, setOptionalIngredientsOpen] = useState(false)
  const [qtyInputMap, setQtyInputMap] = useState<Record<string, string>>({})
  const [factorMap, setFactorMap] = useState<Record<string, Record<string, number>>>({})

  useEffect(() => {
    if (editRecipeId) return
    const draft = loadKitchenBatchDraft()
    setSearch(draft.search)
    setMenuCategory(draft.menuCategory)
    setMenuCategoryId(draft.menuCategoryId)
    setBatchName(draft.batchName)
    setMenuItemId(draft.menuItemId)
    setLinkedKitchenStockId(draft.linkedKitchenStockId)
    setPlannedPortions(draft.plannedPortions)
    setSellingPrice(draft.sellingPrice)
    setOverheadLabour(draft.overheadLabour)
    setOverheadGas(draft.overheadGas)
    setOverheadOther(draft.overheadOther)
    setNotes(draft.notes)
    setCart(draft.cart.filter((c) => !c.optional))
    const draftOptionalCart = draft.cart.filter((c) => c.optional)
    setOptionalCart(draftOptionalCart)
    setOptionalIngredientsOpen(draftOptionalCart.length > 0)
    setQtyInputMap(
      Object.fromEntries(draft.cart.map((c) => [c.storeItemId, String(c.quantity)])),
    )
    setOutletMenuSync('none')
    setDraftLoaded(true)
  }, [editRecipeId])

  useEffect(() => {
    if (!editRecipeId) return
    const recipe = recipes.find((r) => r.id === editRecipeId)
    if (!recipe) return
    setBatchName(recipe.name)
    setMenuCategory(recipe.category)
    setPlannedPortions(numberInputValue(recipe.yieldPortions))
    setSellingPrice(numberInputValue(recipe.sellingPricePerPortion))
    setOverheadLabour(recipe.overheadLabour ? String(recipe.overheadLabour) : '')
    setOverheadGas(recipe.overheadGas ? String(recipe.overheadGas) : '')
    setOverheadOther(
      recipe.overheadOther || recipe.overheadCost
        ? String(recipe.overheadOther ?? recipe.overheadCost)
        : '',
    )
    setOutletMenuSync(
      normalizeBatchOutletMenuSync(recipe.outletMenuSync ?? recipe.fnbEligible),
    )
    setCart(
      recipe.ingredients
        .filter((ing) => !ing.optional)
        .map((ing) => ({
          storeItemId: ing.stockItemId,
          name: ing.name,
          unit: ing.unit,
          quantity: ing.quantity,
          unitCost: ing.quantity > 0 ? ing.cost / ing.quantity : 0,
          optional: false,
        })),
    )
    const optionalIngredients = recipe.ingredients
      .filter((ing) => ing.optional)
      .map((ing) => ({
        storeItemId: ing.stockItemId,
        name: ing.name,
        unit: ing.unit,
        quantity: ing.quantity,
        unitCost: ing.quantity > 0 ? ing.cost / ing.quantity : 0,
        optional: true,
      }))
    setOptionalCart(optionalIngredients)
    setOptionalIngredientsOpen(optionalIngredients.length > 0)
    setQtyInputMap(
      Object.fromEntries(
        recipe.ingredients.map((ing) => [ing.stockItemId, numberInputValue(ing.quantity)]),
      ),
    )
    setDraftLoaded(true)
  }, [editRecipeId, recipes])

  useEffect(() => {
    if (!draftLoaded || editing) return
    persistKitchenBatchDraft({
      draftVersion: KITCHEN_BATCH_DRAFT_VERSION,
      search,
      menuCategory,
      menuCategoryId,
      batchName,
      menuItemId,
      linkedKitchenStockId,
      plannedPortions,
      sellingPrice,
      overheadLabour,
      overheadGas,
      overheadOther,
      outletMenuSync,
      notes,
      cart: [...cart, ...optionalCart],
    })
  }, [
    draftLoaded,
    search,
    menuCategory,
    menuCategoryId,
    batchName,
    menuItemId,
    linkedKitchenStockId,
    plannedPortions,
    sellingPrice,
    overheadLabour,
    overheadGas,
    overheadOther,
    outletMenuSync,
    notes,
    cart,
    optionalCart,
    editing,
  ])

  const actor = { name: name ?? 'Kitchen', role: canonicalRoleKey(role) ?? 'staff' }
  const canCreateBatch = BATCH_CREATOR_ROLES.has(canonicalRoleKey(role) ?? '')

  const kitchenStoreItems = useMemo(
    () => storeItems.filter((s) => s.dept === 'kitchen'),
    [storeItems],
  )

  const [rawStockTick, setRawStockTick] = useState(0)

  useEffect(() => {
    const onRaw = () => setRawStockTick((t) => t + 1)
    window.addEventListener('frontbill:kitchen-raw-stock', onRaw)
    return () => window.removeEventListener('frontbill:kitchen-raw-stock', onRaw)
  }, [])

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return kitchenStoreItems.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 30)
    // rawStockTick keeps search/cart in sync after store issue-out without refresh
  }, [kitchenStoreItems, search, kitchenRawStock, rawStockTick])

  const addMaterial = (item: StoreItem, optional = false) => {
    if (optional) setOptionalIngredientsOpen(true)
    const unit = defaultUnitForStoreItem(item.unit)
    const setter = optional ? setOptionalCart : setCart
    setter((prev) => {
      const ex = prev.find((c) => c.storeItemId === item.id)
      if (ex) {
        const nextQty = ex.quantity + 1
        setQtyInputMap((m) => ({ ...m, [item.id]: String(nextQty) }))
        return prev.map((c) =>
          c.storeItemId === item.id ? { ...c, quantity: nextQty, optional } : c,
        )
      }
      setQtyInputMap((m) => ({ ...m, [item.id]: '1' }))
      return [
        ...prev,
        {
          storeItemId: item.id,
          name: item.name,
          unit,
          quantity: 1,
          unitCost: item.lastPrice,
          optional,
        },
      ]
    })
    if (!batchName.trim() && !menuItemId) setBatchName(item.name)
    setSearch('')
    setSearchOpen(false)
  }

  const removeLine = (storeItemId: string, optional = false) => {
    const setter = optional ? setOptionalCart : setCart
    setter((prev) => prev.filter((c) => c.storeItemId !== storeItemId))
    setQtyInputMap((m) => {
      const next = { ...m }
      delete next[storeItemId]
      return next
    })
  }

  const updateLineQty = (
    storeItemId: string,
    raw: string,
    unit: string,
    optional = false,
  ) => {
    const setter = optional ? setOptionalCart : setCart
    const parsed = parseQuantityInput(raw, normalizeMeasurementUnit(unit) as MeasurementUnit)
    if (!parsed || parsed.quantity <= 0) {
      removeLine(storeItemId, optional)
      return
    }
    setter((prev) =>
      prev.map((c) => {
        if (c.storeItemId !== storeItemId) return c
        const store = storeItems.find((s) => s.id === storeItemId)
        return {
          ...c,
          quantity: parsed.quantity,
          unit: parsed.unit,
          unitCost: store?.lastPrice ?? c.unitCost,
          optional,
        }
      }),
    )
    setQtyInputMap((m) => ({ ...m, [storeItemId]: raw.trim() || String(parsed.quantity) }))
  }

  const setLineUnit = (storeItemId: string, unit: string, optional = false) => {
    const setter = optional ? setOptionalCart : setCart
    setter((prev) =>
      prev.map((c) => (c.storeItemId === storeItemId ? { ...c, unit } : c)),
    )
  }

  const commitLineQty = (storeItemId: string, raw: string, unit: string, optional = false) => {
    updateLineQty(storeItemId, raw, unit, optional)
  }

  const handleLineQtyChange = (
    storeItemId: string,
    raw: string,
    unit: string,
    optional = false,
  ) => {
    const cleaned = sanitizeQuantityInput(raw)
    setQtyInputMap((m) => ({ ...m, [storeItemId]: cleaned }))
    const trimmed = cleaned.trim()
    if (!trimmed) return
    const parsed = parseQuantityInput(trimmed, normalizeMeasurementUnit(unit) as MeasurementUnit)
    if (!parsed || parsed.quantity <= 0) return
    const setter = optional ? setOptionalCart : setCart
    setter((prev) =>
      prev.map((c) => {
        if (c.storeItemId !== storeItemId) return c
        const store = storeItems.find((s) => s.id === storeItemId)
        return {
          ...c,
          quantity: parsed.quantity,
          unit: parsed.unit,
          unitCost: store?.lastPrice ?? c.unitCost,
          optional,
        }
      }),
    )
  }

  const itemFactors = (storeItemId: string, storeUnit: string) => {
    const item = storeItems.find((s) => s.id === storeItemId)
    return mergeUnitFactors(storeItemId, storeUnit, item?.unitFactors)
  }

  const lineCost = (line: BatchMaterialLine) => {
    const store = storeItems.find((s) => s.id === line.storeItemId)
    if (!store) return line.quantity * line.unitCost
    const factors = factorMap[line.storeItemId] ?? itemFactors(line.storeItemId, store.unit)
    return materialCostForUnit(
      line.quantity,
      line.unit,
      store.unit,
      store.lastPrice,
      factors,
    )
  }

  const ingredientCost = cart.reduce((sum, l) => sum + lineCost(l), 0)
  const overheadTotal =
    (Number(overheadLabour) || 0) + (Number(overheadGas) || 0) + (Number(overheadOther) || 0)
  const batchCost = ingredientCost + overheadTotal
  const planned = Number(plannedPortions) || 0
  const sell = Number(sellingPrice) || 0
  const revenue = planned * sell
  const costPerPortion = planned > 0 ? batchCost / planned : 0
  const marginPct =
    revenue > 0 ? Math.round(((revenue - batchCost) / revenue) * 1000) / 10 : 0

  const rawOnHand = (storeItemId: string) => kitchenRawOnHand(storeItemId)

  const syncToOutlet = async (
    name: string,
    category: string,
    kitchenStockId: string,
    unitPrice: number,
    sync: BatchOutletMenuSync,
  ) => {
    if (!shouldSyncBatchToOutlet(sync)) return { ok: true as const }
    const res = await syncBatchToRestaurantOutlet({
      batchName: name,
      categoryName: category,
      kitchenStockId,
      unitPrice,
      menuItemId,
      outletMenuSync: sync,
    })
    if (!res.ok) {
      toast.warning(`Saved locally but outlet sync failed: ${res.error}`)
    }
    return res
  }

  const resetForm = () => {
    setCart([])
    setOptionalCart([])
    setOptionalIngredientsOpen(false)
    setQtyInputMap({})
    setBatchName('')
    setMenuItemId(null)
    setLinkedKitchenStockId(null)
    setMenuCategory('')
    setMenuCategoryId(null)
    setPlannedPortions('')
    setSellingPrice('')
    setOverheadLabour('')
    setOverheadGas('')
    setOverheadOther('')
    setOutletMenuSync('none')
    setNotes('')
    setSearch('')
    clearKitchenBatchDraft()
  }

  const handleCreate = async () => {
    if (!canCreateBatch) {
      toast.error('Only Admin, Manager, or Superadmin can create a new production batch')
      return
    }
    if (!menuCategory.trim()) {
      toast.error('Menu category is required for the batch standard')
      return
    }
    const titledName = toTitleCaseWords(batchName)
    const titledCategory = toTitleCaseWords(menuCategory)
    const stockId =
      linkedKitchenStockId?.trim() || `ks-${outletStockSlug(titledName)}`

    const materialsWithCost = [...cart, ...optionalCart].map((m) => ({
      ...m,
      lineCost: lineCost(m),
    }))

    if (editing && editRecipeId) {
      const res = updateRecipe(
        editRecipeId,
        {
          name: titledName,
          category: titledCategory,
          yieldPortions: planned,
          sellingPricePerPortion: sell,
          overheadLabour: Number(overheadLabour) || 0,
          overheadGas: Number(overheadGas) || 0,
          overheadOther: Number(overheadOther) || 0,
          outletMenuSync,
          ingredients: materialsWithCost.map((m) => ({
            stockItemId: m.storeItemId,
            name: m.name,
            quantity: m.quantity,
            unit: m.unit,
            cost: m.lineCost ?? lineCost(m),
            optional: m.optional,
          })),
        },
        actor,
      )
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      await syncToOutlet(res.menuItemName, res.category, res.kitchenStockId, sell, res.outletMenuSync)
      toast.success(
        shouldSyncBatchToOutlet(res.outletMenuSync)
          ? `Batch "${titledName}" updated — ${batchOutletMenuSyncLabel(res.outletMenuSync)}`
          : `Batch "${titledName}" updated`,
      )
      onSaved?.()
      return
    }

    const res = openKitchenBatchFromMaterials(
      {
        batchName: titledName,
        menuCategory: titledCategory,
        plannedPortions: planned,
        sellingPricePerPortion: sell,
        materials: materialsWithCost,
        notes: notes.trim() || undefined,
        kitchenStockId: stockId,
        overheadLabour: Number(overheadLabour) || 0,
        overheadGas: Number(overheadGas) || 0,
        overheadOther: Number(overheadOther) || 0,
        outletMenuSync,
      },
      actor,
    )
    if ('error' in res) {
      toast.error(res.error)
      return
    }

    await syncToOutlet(titledName, titledCategory, res.kitchenStockId, sell, outletMenuSync)
    toast.success(
      shouldSyncBatchToOutlet(outletMenuSync)
        ? `Batch standard "${titledName}" saved — ${batchOutletMenuSyncLabel(outletMenuSync)}`
        : `Batch standard "${titledName}" saved (not listed on outlet POS yet)`,
    )
    resetForm()
    onSaved?.()
  }

  const renderMaterialLines = (lines: BatchMaterialLine[], optional: boolean) => (
    <ul className="grid gap-2 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {lines.map((line) => {
        const onHand = rawOnHand(line.storeItemId)
        const store = storeItems.find((s) => s.id === line.storeItemId)
        const inputVal = qtyInputMap[line.storeItemId] ?? numberInputValue(line.quantity)
        const factors =
          factorMap[line.storeItemId] ??
          (store ? itemFactors(line.storeItemId, store.unit) : {})
        const showFactor =
          store && needsUnitFactor(line.unit, store.unit, factors)
        return (
          <li
            key={`${optional ? 'opt-' : 'req-'}${line.storeItemId}`}
            className="rounded-lg border p-2 text-xs bg-background space-y-1.5"
          >
            <div className="flex justify-between gap-1 items-start">
              <p className="font-medium truncate text-xs leading-tight">
                {line.name}
                {optional ? (
                  <span className="ml-1 text-[10px] font-normal text-muted-foreground">(optional)</span>
                ) : null}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive shrink-0"
                onClick={() => removeLine(line.storeItemId, optional)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              Stock {onHand} {store?.unit ?? line.unit}
            </p>
            <div className="flex items-center gap-2">
              <Input
                className="h-8 w-14 shrink-0 text-center text-xs px-1.5"
                inputMode="decimal"
                placeholder="Qty"
                value={inputVal}
                onChange={(e) =>
                  handleLineQtyChange(line.storeItemId, e.target.value, line.unit, optional)
                }
                onBlur={(e) =>
                  commitLineQty(line.storeItemId, e.target.value, line.unit, optional)
                }
              />
              <UnitSelect
                storeUnit={store?.unit ?? line.unit}
                itemName={line.name}
                value={line.unit}
                units={[...KITCHEN_BATCH_UNITS]}
                onChange={(u) => {
                  setLineUnit(line.storeItemId, u, optional)
                  const raw = qtyInputMap[line.storeItemId]
                  if (raw?.trim()) commitLineQty(line.storeItemId, raw, u, optional)
                }}
                className="h-8 w-[76px] text-xs shrink-0"
              />
            </div>
            {store && (showFactor || line.unit !== store.unit) && (
              <UnitConversionField
                compact
                storeItemId={line.storeItemId}
                storeUnit={store.unit}
                selectedUnit={line.unit}
                factors={factors}
                onFactorsChange={(next) =>
                  setFactorMap((m) => ({ ...m, [line.storeItemId]: next }))
                }
              />
            )}
            <p className="text-[11px] text-muted-foreground truncate">
              {formatQuantityDisplay(line.quantity, line.unit, store?.unit, factors)}
            </p>
            <p className="text-xs font-semibold tabular-nums">
              {optional ? (
                <span className="text-muted-foreground font-normal">Not in portion cost</span>
              ) : (
                formatNaira(lineCost(line))
              )}
            </p>
          </li>
        )
      })}
    </ul>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,300px)_1fr] min-h-[min(72vh,720px)]">
      <div className="rounded-xl border flex flex-col overflow-hidden bg-card">
        <div className="p-4 border-b space-y-2">
          <h3 className="font-semibold text-sm">Search store items</h3>
          <p className="text-xs text-muted-foreground">
            Materials must be issued from Central Store → Kitchen first. Type to search kitchen
            stock.
          </p>
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="add-optional-material"
              checked={addAsOptional}
              onCheckedChange={(v) => setAddAsOptional(v === true)}
            />
            <Label htmlFor="add-optional-material" className="text-xs font-normal cursor-pointer">
              Add search results as optional (shown on recipe, not in portion cost)
            </Label>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9"
              placeholder="Rice, chicken, oil, maggi…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
              autoComplete="off"
            />
            {searchOpen && search.trim() && (
              <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover py-1 text-sm shadow-md">
                {searchResults.length === 0 ? (
                  <li className="px-3 py-2 text-muted-foreground">No items match</li>
                ) : (
                  searchResults.map((item) => {
                    const inRequired = cart.find((c) => c.storeItemId === item.id)
                    const inOptional = optionalCart.find((c) => c.storeItemId === item.id)
                    const reserved = (inRequired?.quantity ?? 0) + (inOptional?.quantity ?? 0)
                    const issued = kitchenRawOnHand(item.id)
                    const available = Math.max(0, issued - reserved)
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-muted"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addMaterial(item, addAsOptional)}
                        >
                          <span className="font-medium">{item.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {available} {item.unit} issued to kitchen
                            {inRequired ? ` · ${inRequired.quantity} in batch` : ''}
                            {inOptional ? ` · ${inOptional.quantity} optional` : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            )}
          </div>
        </div>
        <div className="flex-1 p-4 text-xs text-muted-foreground">
          {kitchenRawStock.length} material(s) issued to kitchen. Results appear as you type.
        </div>
      </div>

      <div className="rounded-xl border flex flex-col overflow-hidden bg-card min-h-[min(72vh,720px)]">
        <div className="border-b px-4 py-3 bg-muted/30 shrink-0">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <ChefHat className="h-4 w-4" />
            {editing ? 'Edit batch' : 'New batch'}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {editing
              ? 'Update ingredients, overhead, and selling price.'
              : 'Recipe definition — raw stock is not required. Saved automatically.'}
          </p>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4 space-y-6">
            <div>
              <h4 className="text-xs font-semibold mb-2">Required ingredients</h4>
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
                  <ChefHat className="h-8 w-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm font-medium text-muted-foreground">No required materials yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Search on the left to add ingredients that drive portion cost.
                  </p>
                </div>
              ) : (
                renderMaterialLines(cart, false)
              )}
            </div>
            <Collapsible
              open={optionalIngredientsOpen}
              onOpenChange={setOptionalIngredientsOpen}
              className="rounded-lg border bg-muted/20"
            >
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                >
                  <div>
                    <h4 className="text-xs font-semibold">Optional ingredients</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Listed on final recipe only; excluded from portions and production cost.
                      {optionalCart.length > 0 ? ` ${optionalCart.length} item(s) added.` : ''}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                      optionalIngredientsOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t p-3">
                {optionalCart.length === 0 ? (
                  <div className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
                    Tick &quot;Add search results as optional&quot; when adding garnish or extras.
                  </div>
                ) : (
                  renderMaterialLines(optionalCart, true)
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>
        </ScrollArea>

        <div className="border-t p-4 space-y-3 bg-muted/20 shrink-0">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <OutletMenuItemSearchField
                value={batchName}
                menuItemId={menuItemId}
                required
                onChange={(sel) => {
                  setBatchName(sel.name)
                  if (sel.menuItemId !== undefined) setMenuItemId(sel.menuItemId)
                  if (sel.kitchenStockId !== undefined) setLinkedKitchenStockId(sel.kitchenStockId)
                  if (sel.categoryName !== undefined) {
                    setMenuCategory(sel.categoryName)
                    setMenuCategoryId(sel.categoryId ?? null)
                  }
                  if (sel.sellingPrice !== undefined && sel.sellingPrice != null && sel.sellingPrice > 0) {
                    setSellingPrice(String(sel.sellingPrice))
                  }
                }}
              />
            </div>
            <div>
              <OutletCategorySearchField
                value={menuCategory}
                categoryId={menuCategoryId}
                onChange={(n, id) => {
                  setMenuCategory(n)
                  setMenuCategoryId(id)
                }}
                required
              />
            </div>
            <div>
              <Label className="text-xs">Planned portions</Label>
              <Input
                inputMode="decimal"
                placeholder="e.g. 6"
                className="h-9 mt-0.5"
                value={plannedPortions}
                onChange={(e) =>
                  setPlannedPortions(sanitizeQuantityInput(e.target.value))
                }
              />
            </div>
            <div>
              <Label className="text-xs">Overhead — labour (₦)</Label>
              <Input
                inputMode="decimal"
                placeholder="Labour"
                className="h-9 mt-0.5"
                value={overheadLabour}
                onChange={(e) => setOverheadLabour(sanitizeQuantityInput(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Overhead — gas (₦)</Label>
              <Input
                inputMode="decimal"
                placeholder="Gas"
                className="h-9 mt-0.5"
                value={overheadGas}
                onChange={(e) => setOverheadGas(sanitizeQuantityInput(e.target.value))}
              />
            </div>
            <div>
              <Label className="text-xs">Overhead — other (₦)</Label>
              <Input
                inputMode="decimal"
                placeholder="Other"
                className="h-9 mt-0.5"
                value={overheadOther}
                onChange={(e) => setOverheadOther(sanitizeQuantityInput(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <Label className="text-xs font-semibold">Outlet POS listing (optional)</Label>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Kitchen batches always supply Restaurant. Select an outlet to sell on POS, or leave
              unselected until you are ready.
            </p>
            <RadioGroup
              value={outletMenuSync === 'none' ? '' : outletMenuSync}
              onValueChange={(v) => {
                if (v === 'restaurant' || v === 'restaurant_fnb') {
                  setOutletMenuSync(v)
                }
              }}
            >
              <div className="flex items-start gap-2">
                <RadioGroupItem value="restaurant" id="batch-outlet-restaurant" className="mt-0.5" />
                <Label htmlFor="batch-outlet-restaurant" className="font-normal cursor-pointer leading-snug">
                  Restaurant outlet
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="restaurant_fnb" id="batch-outlet-fnb" className="mt-0.5" />
                <Label htmlFor="batch-outlet-fnb" className="font-normal cursor-pointer leading-snug">
                  Restaurant / F&amp;B outlet
                </Label>
              </div>
            </RadioGroup>
            {outletMenuSync !== 'none' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setOutletMenuSync('none')}
              >
                Clear outlet listing
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 items-end rounded-lg border bg-background p-3">
            <div className="space-y-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground">Batch cost (incl. overhead)</p>
              <p className="text-lg font-semibold tabular-nums">{formatNaira(batchCost)}</p>
              {planned > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Cost price / portion:{' '}
                  <span className="font-medium text-foreground">{formatNaira(costPerPortion)}</span>
                  {sell > 0
                    ? ` · margin vs sell ${Math.round(((sell - costPerPortion) / sell) * 1000) / 10}%`
                    : ''}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Enter planned portions to see cost / portion</p>
              )}
              {revenue > 0 && (
                <p className="text-xs text-emerald-700">
                  Est. revenue {formatNaira(revenue)} · margin {marginPct}%
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">Selling price / portion (₦)</Label>
              <Input
                inputMode="decimal"
                placeholder="Selling price"
                className="h-9 mt-0.5"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(sanitizeQuantityInput(e.target.value))}
              />
            </div>
          </div>
          {!canCreateBatch && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              Chefs can build the list; only Admin / Manager / Superadmin can create the batch.
            </p>
          )}
          <div className="flex gap-2">
            {onCancel && (
              <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              className="flex-1"
              disabled={!canCreateBatch || !batchName.trim() || !menuCategory.trim()}
              onClick={handleCreate}
            >
              {editing ? 'Save batch' : 'Create batch'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
