import { normalizeMeasurementUnit } from '@/lib/supply-chain/measurement-unit-core'
import {
  convertToStoreUnitsWithFactors,
  type UnitFactorMap,
} from '@/lib/supply-chain/unit-factor-storage'

/** How many store catalogue units are in one purchase unit (e.g. 1 bag → 50 kg). */
export function storeQtyPerPurchaseUnit(
  purchaseUnit: string,
  storeUnit: string,
  factors?: UnitFactorMap,
): number | null {
  return convertToStoreUnitsWithFactors(1, purchaseUnit, storeUnit, factors)
}

/** Derive price per purchase unit from catalogue price per store unit. */
export function purchaseUnitPriceFromStorePrice(
  storeUnitPrice: number,
  purchaseUnit: string,
  storeUnit: string,
  factors?: UnitFactorMap,
): number {
  if (!Number.isFinite(storeUnitPrice) || storeUnitPrice <= 0) return 0
  const from = normalizeMeasurementUnit(purchaseUnit)
  const store = normalizeMeasurementUnit(storeUnit)
  if (from === store) return storeUnitPrice
  const per = storeQtyPerPurchaseUnit(purchaseUnit, storeUnit, factors)
  if (per == null || per <= 0) return storeUnitPrice
  return Math.round(storeUnitPrice * per * 100) / 100
}

/** Convert an entered price (per purchase/conversion unit) to catalogue store-unit price. */
export function storeUnitPriceFromPurchasePrice(
  purchaseUnitPrice: number,
  purchaseUnit: string,
  storeUnit: string,
  factors?: UnitFactorMap,
): number {
  if (!Number.isFinite(purchaseUnitPrice) || purchaseUnitPrice <= 0) return 0
  const per = storeQtyPerPurchaseUnit(purchaseUnit, storeUnit, factors)
  if (per == null || per <= 0) return purchaseUnitPrice
  return Math.round((purchaseUnitPrice / per) * 100) / 100
}

/** When adding/editing catalogue items, price is often entered per bag/pack at market. */
export function storeUnitPriceFromEntryPrice(
  entryPrice: number,
  storeUnit: string,
  conversionUnit: string,
  unitFactors?: UnitFactorMap,
): number {
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return 0
  const per = storeQtyPerPurchaseUnit(conversionUnit, storeUnit, unitFactors)
  if (per == null || per <= 0) return entryPrice
  return Math.round((entryPrice / per) * 100) / 100
}
