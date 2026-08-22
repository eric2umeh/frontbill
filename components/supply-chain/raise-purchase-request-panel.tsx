'use client'

import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { storeItemDepartments } from '@/lib/supply-chain/types'
import { formatNaira } from '@/lib/utils/currency'
import { DeptPill } from '@/lib/supply-chain/supply-ui'
import { PaginatedListShell } from '@/components/shared/paginated-list-shell'
import {
  defaultUnitForStoreItem,
  parseQuantityValue,
  sanitizeQuantityInput,
} from '@/lib/supply-chain/measurement-units'
import { purchaseUnitPriceFromStorePrice } from '@/lib/supply-chain/purchase-unit-pricing'
import {
  getStockLevel,
  stockLevelNumberPillClass,
} from '@/lib/supply-chain/stock-level-ui'
import { DraftBasketSidebar } from '@/components/supply-chain/draft-basket-sidebar'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RESPONSIVE_HIDE_MD } from '@/lib/ui/responsive-table'
import { UnitSelect } from '@/components/supply-chain/unit-select'
import { UnitConversionField } from '@/components/supply-chain/unit-conversion-field'
import { useRaisePurchaseRequest } from '@/lib/supply-chain/use-raise-purchase-request'

type Props = {
  activeTab: string
}

export function RaisePurchaseRequestPanel({ activeTab }: Props) {
  const flow = useRaisePurchaseRequest(activeTab)
  const {
    DEPTS,
    DEPT_LABELS,
    dept,
    setDept,
    filtered,
    deptCatalogCounts,
    storeItems,
    qtyMap,
    purchaseUnitMap,
    purchasePriceMap,
    basket,
    stats,
    purchaseLocked,
    kitchenAwaitingStore,
    raiseSeedSearch,
    factorsFor,
    toStoreQty,
    unitLabel,
    needsUnitFactor,
    commitPurchaseQty,
    handlePurchaseQtyChange,
    handleClearBasket,
    handleRemoveFromBasket,
    handleBasketQtyChange,
    handleBasketPriceChange,
    handleSendToAccountant,
    updateStoreItemDirect,
    setFactorMap,
    setPurchaseUnitMap,
    setPurchasePriceMap,
    actor,
  } = flow

  const basketSidebar = (
    <DraftBasketSidebar
      basket={basket}
      total={stats.basketTotal}
      readOnly={purchaseLocked}
      hideClear={kitchenAwaitingStore}
      onClear={handleClearBasket}
      onRemove={handleRemoveFromBasket}
      onQtyChange={handleBasketQtyChange}
      onPriceChange={handleBasketPriceChange}
      sendLabel="Send to accountant"
      onSend={
        !purchaseLocked && basket.length > 0 ? handleSendToAccountant : undefined
      }
    />
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-3 gap-y-3 overflow-visible">
        {DEPTS.map((d) => (
          <DeptPill
            key={d}
            dept={d}
            label={DEPT_LABELS[d]}
            active={dept === d}
            count={d === 'all' ? storeItems.length : deptCatalogCounts[d]}
            onClick={() => setDept(d)}
          />
        ))}
      </div>
          {purchaseLocked && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/50 dark:bg-sky-950/20 p-3 text-sm text-muted-foreground mb-4">
              A purchase order is already in the approval pipeline. You can add items again after the
              accountant rejects it or once the current PO is retired.
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(400px,440px)]">
            <div className="rounded-xl border">
              <div className="border-b px-4 py-2 text-sm text-muted-foreground">
                Type a quantity to add to the active purchase list. Review lines in the draft basket, then send to the accountant.
              </div>
              <div className="p-3">
                <PaginatedListShell
                  items={filtered}
                  pageSize={15}
                  resetKey={dept}
                  seedSearch={raiseSeedSearch}
                  searchPlaceholder="Search items to purchase…"
                  searchKeys={['name']}
                  emptyMessage="No items match your search."
                >
                  {(pageItems) => (
                    <>
                      <div className="md:hidden space-y-2">
                        {pageItems.map((item) => {
                          const rawQty = qtyMap[item.id] ?? ''
                          const purchaseUnit =
                            purchaseUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit)
                          const qty = parseQuantityValue(rawQty)
                          const storeQty =
                            qty > 0 ? toStoreQty(item, qty, purchaseUnit) : null
                          const factors = factorsFor(item)
                          const defaultPurchasePrice = purchaseUnitPriceFromStorePrice(
                            item.lastPrice,
                            purchaseUnit,
                            item.unit,
                            factors,
                          )
                          const price = Number(purchasePriceMap[item.id]) > 0
                            ? Number(purchasePriceMap[item.id])
                            : defaultPurchasePrice
                          const level = getStockLevel(item.quantityInStore, item.reorderLevel)
                          const inBasket = basket.some((b) => b.stockItemId === item.id)
                          return (
                            <div
                              data-raise-po-item={item.id}
                              key={item.id}
                              className={cn(
                                'rounded-lg border p-3 space-y-2 scroll-mt-24 transition-shadow',
                                inBasket && 'bg-sky-50/50 dark:bg-sky-950/20',
                              )}
                            >
                              <p className="font-medium text-sm">
                                {!(price > 0) && (
                                  <AlertTriangle
                                    className="mr-1 inline h-3.5 w-3.5 -mt-0.5 text-sky-700 dark:text-sky-300"
                                    aria-label="Unit price is ₦0"
                                  />
                                )}
                                {item.name} ({unitLabel(item.unit)})
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {storeItemDepartments(item).map((d) => (
                                  <Badge key={d} variant="outline" className="text-[10px]">
                                    {DEPT_LABELS[d]}
                                  </Badge>
                                ))}
                              </div>
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">In store</span>
                                <span className={stockLevelNumberPillClass(level)}>
                                  {item.quantityInStore}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1">
                                  <Input
                                    inputMode="decimal"
                                    disabled={purchaseLocked}
                                    className="h-8 w-20 text-right"
                                    value={rawQty}
                                    onChange={(e) => handlePurchaseQtyChange(item, e.target.value)}
                                    onBlur={(e) => {
                                      if (!e.currentTarget.isConnected) return
                                      commitPurchaseQty(item, e.target.value)
                                    }}
                                  />
                                  <UnitSelect
                                    storeUnit={item.unit}
                                    itemName={item.name}
                                    disabled={purchaseLocked}
                                    value={purchaseUnit}
                                    onChange={(u) => {
                                      setPurchaseUnitMap((m) => ({ ...m, [item.id]: u }))
                                      if (rawQty.trim()) commitPurchaseQty(item, rawQty, u)
                                    }}
                                  />
                                </div>
                                <Input
                                  inputMode="decimal"
                                  disabled={purchaseLocked}
                                  data-raise-po-price="1"
                                  className="h-8 w-24 text-right"
                                  placeholder={`₦/${unitLabel(purchaseUnit)}`}
                                  value={purchasePriceMap[item.id] ?? ''}
                                  onChange={(e) =>
                                    setPurchasePriceMap((m) => ({
                                      ...m,
                                      [item.id]: sanitizeQuantityInput(e.target.value),
                                    }))
                                  }
                                  onBlur={(e) => {
                                    if (!e.currentTarget.isConnected) return
                                    if (rawQty.trim()) {
                                      commitPurchaseQty(
                                        item,
                                        rawQty,
                                        undefined,
                                        e.target.value,
                                      )
                                    }
                                  }}
                                />
                                {!(price > 0) && (
                                  <span className="text-[10px] font-medium text-sky-800 dark:text-sky-200 whitespace-nowrap">
                                    Warning: ₦0 unit price
                                  </span>
                                )}
                                <span className="text-sm font-medium tabular-nums">
                                  {storeQty != null && storeQty > 0
                                    ? formatNaira(qty * price)
                                    : '—'}
                                </span>
                              </div>
                              {storeQty != null && storeQty > 0 && purchaseUnit !== item.unit && (
                                <p className="text-[11px] text-muted-foreground">
                                  Receives {storeQty} {unitLabel(item.unit)} into store
                                  {price > 0
                                    ? ` · ${formatNaira(item.lastPrice)}/${unitLabel(item.unit)} in store`
                                    : ''}
                                </p>
                              )}
                              {needsUnitFactor(purchaseUnit, item.unit, factorsFor(item)) && (
                                <UnitConversionField
                                  compact
                                  storeItemId={item.id}
                                  storeUnit={item.unit}
                                  selectedUnit={purchaseUnit}
                                  factors={factorsFor(item)}
                                  onFactorsChange={(next) => {
                                    setFactorMap((m) => ({ ...m, [item.id]: next }))
                                    updateStoreItemDirect(item.id, { unitFactors: next }, actor)
                                    if (rawQty.trim()) commitPurchaseQty(item, rawQty)
                                  }}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="hidden md:block overflow-x-auto">
                        <Table className="table-fixed w-full">
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[30%] px-2">Item</TableHead>
                              <TableHead className={`w-[14%] px-2 ${RESPONSIVE_HIDE_MD}`}>Dept</TableHead>
                              <TableHead className="w-[10%] px-2 text-right">In Store</TableHead>
                              <TableHead className="w-[22%] px-2 text-right">Qty / unit</TableHead>
                              <TableHead className={`w-[12%] px-2 text-right ${RESPONSIVE_HIDE_MD}`}>
                                Unit Price
                              </TableHead>
                              <TableHead className="w-[12%] px-2 text-right">Line total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pageItems.map((item) => {
                              const rawQty = qtyMap[item.id] ?? ''
                              const purchaseUnit =
                                purchaseUnitMap[item.id] ?? defaultUnitForStoreItem(item.unit)
                              const qty = parseQuantityValue(rawQty)
                              const storeQty =
                                qty > 0 ? toStoreQty(item, qty, purchaseUnit) : null
                              const defaultPurchasePrice = purchaseUnitPriceFromStorePrice(
                                item.lastPrice,
                                purchaseUnit,
                                item.unit,
                                factorsFor(item),
                              )
                              const price = Number(purchasePriceMap[item.id]) > 0
                                ? Number(purchasePriceMap[item.id])
                                : defaultPurchasePrice
                              const level = getStockLevel(item.quantityInStore, item.reorderLevel)
                              const inBasket = basket.some((b) => b.stockItemId === item.id)
                              return (
                                <TableRow
                                  data-raise-po-item={item.id}
                                  key={item.id}
                                  className={cn(
                                    'scroll-mt-24 transition-shadow',
                                    inBasket && 'bg-sky-50/50 dark:bg-sky-950/20',
                                  )}
                                >
                                  <TableCell className="px-2 py-1.5">
                                    <div className="flex items-start gap-1 min-w-0">
                                      {!(price > 0) && (
                                        <AlertTriangle
                                          className="h-3.5 w-3.5 shrink-0 mt-0.5 text-sky-700 dark:text-sky-300"
                                          aria-label="Unit price is ₦0"
                                        />
                                      )}
                                      <span className="truncate text-sm">
                                        {item.name} ({unitLabel(item.unit)})
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell className={`px-2 py-1.5 ${RESPONSIVE_HIDE_MD}`}>
                                    <div className="flex flex-wrap gap-0.5">
                                      {storeItemDepartments(item).map((d) => (
                                        <Badge key={d} variant="outline" className="text-[10px] px-1">
                                          {DEPT_LABELS[d]}
                                        </Badge>
                                      ))}
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-2 py-1.5 text-right">
                                    <span className={stockLevelNumberPillClass(level)}>
                                      {item.quantityInStore}
                                    </span>
                                  </TableCell>
                                  <TableCell className="px-2 py-1.5 text-right">
                                    <div className="flex items-center justify-end gap-1">
                                      <Input
                                        inputMode="decimal"
                                        disabled={purchaseLocked}
                                        className="h-8 w-[4.25rem] text-right text-xs px-1.5"
                                        value={rawQty}
                                        onChange={(e) =>
                                          handlePurchaseQtyChange(item, e.target.value)
                                        }
                                        onBlur={(e) => {
                                          if (!e.currentTarget.isConnected) return
                                          commitPurchaseQty(item, e.target.value)
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.currentTarget.blur()
                                            commitPurchaseQty(item, e.currentTarget.value)
                                          }
                                        }}
                                      />
                                      <UnitSelect
                                        storeUnit={item.unit}
                                        itemName={item.name}
                                        disabled={purchaseLocked}
                                        value={purchaseUnit}
                                        onChange={(u) => {
                                          setPurchaseUnitMap((m) => ({ ...m, [item.id]: u }))
                                          if (rawQty.trim()) commitPurchaseQty(item, rawQty, u)
                                        }}
                                      />
                                    </div>
                                    {storeQty != null && storeQty > 0 && purchaseUnit !== item.unit && (
                                      <p className="mt-1 text-[10px] text-muted-foreground">
                                        Receives {storeQty} {unitLabel(item.unit)}
                                      </p>
                                    )}
                                    {needsUnitFactor(purchaseUnit, item.unit, factorsFor(item)) && (
                                      <UnitConversionField
                                        compact
                                        storeItemId={item.id}
                                        storeUnit={item.unit}
                                        selectedUnit={purchaseUnit}
                                        factors={factorsFor(item)}
                                        onFactorsChange={(next) => {
                                          setFactorMap((m) => ({ ...m, [item.id]: next }))
                                          updateStoreItemDirect(item.id, { unitFactors: next }, actor)
                                          if (rawQty.trim()) commitPurchaseQty(item, rawQty)
                                        }}
                                      />
                                    )}
                                  </TableCell>
                                  <TableCell className={`px-2 py-1.5 text-right ${RESPONSIVE_HIDE_MD}`}>
                                    <div className="flex flex-wrap items-center justify-end gap-x-1 gap-y-0.5">
                                      <Input
                                        inputMode="decimal"
                                        disabled={purchaseLocked}
                                        data-raise-po-price="1"
                                        className="h-8 w-[5.5rem] text-right text-xs px-1.5"
                                        placeholder={formatNaira(defaultPurchasePrice)}
                                        value={purchasePriceMap[item.id] ?? ''}
                                        onChange={(e) =>
                                          setPurchasePriceMap((m) => ({
                                            ...m,
                                            [item.id]: sanitizeQuantityInput(e.target.value),
                                          }))
                                        }
                                        onBlur={(e) => {
                                          if (!e.currentTarget.isConnected) return
                                          if (rawQty.trim()) {
                                            commitPurchaseQty(
                                              item,
                                              rawQty,
                                              undefined,
                                              e.target.value,
                                            )
                                          }
                                        }}
                                      />
                                      {!(price > 0) ? (
                                        <span className="text-[10px] font-medium text-amber-800 dark:text-amber-200 whitespace-nowrap">
                                          Set price
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                          {`per ${unitLabel(purchaseUnit)}${
                                            storeQty != null && storeQty > 0
                                              ? ` · ${formatNaira(item.lastPrice)}/${unitLabel(item.unit)} in store`
                                              : ''
                                          }`}
                                        </span>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="px-2 py-1.5 text-right tabular-nums text-sm">
                                    {storeQty != null && storeQty > 0
                                      ? formatNaira(qty * price)
                                      : '—'}
                                  </TableCell>
                                </TableRow>
                              )
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </>
                  )}
                </PaginatedListShell>
              </div>
            </div>
            {basketSidebar}
          </div>

    </div>
  )
}
