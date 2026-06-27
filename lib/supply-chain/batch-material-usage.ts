import { normalizeMeasurementUnit } from '@/lib/supply-chain/measurement-unit-core'
import { convertToStoreUnitsWithFactors, type UnitFactorMap } from '@/lib/supply-chain/unit-factor-storage'

export type BatchMaterialSource = 'raw' | 'kitchen_stock'

export type BatchMaterialUsageLine = {
  storeItemId: string
  name: string
  unit: string
  quantity: number
  source: BatchMaterialSource
}

export type BatchMaterialStockSnapshot = {
  quantityOnHand: number
  unit: string
  unitFactors?: UnitFactorMap
}

export type BatchMaterialStockUsage = {
  quantity: number
  unit: string
  onHand: number
}

export function resolveBatchMaterialStockUsage(
  line: BatchMaterialUsageLine,
  stock: BatchMaterialStockSnapshot | undefined,
): BatchMaterialStockUsage | null {
  if (!stock || !Number.isFinite(stock.quantityOnHand)) return null
  const stockUnit = normalizeMeasurementUnit(stock.unit || line.unit)
  const lineUnit = normalizeMeasurementUnit(line.unit)
  const converted = convertToStoreUnitsWithFactors(
    line.quantity,
    lineUnit,
    stockUnit,
    stock.unitFactors,
  )

  if (converted == null || !Number.isFinite(converted) || converted < 0) {
    return null
  }

  return {
    quantity: Math.round(converted * 1000) / 1000,
    unit: stockUnit,
    onHand: stock.quantityOnHand,
  }
}
