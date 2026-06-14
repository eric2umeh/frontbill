'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  unitFactorDefinition,
  writeUnitFactorOverride,
  type UnitFactorMap,
} from '@/lib/supply-chain/unit-factor-storage'
import { sanitizeQuantityInput } from '@/lib/supply-chain/measurement-units'

type Props = {
  storeItemId: string
  storeUnit: string
  selectedUnit: string
  factors: UnitFactorMap
  onFactorsChange: (next: UnitFactorMap) => void
  compact?: boolean
}

export function UnitConversionField({
  storeItemId,
  storeUnit,
  selectedUnit,
  factors,
  onFactorsChange,
  compact = false,
}: Props) {
  const def = unitFactorDefinition(storeUnit, selectedUnit)
  const [local, setLocal] = useState('')

  useEffect(() => {
    if (!def) {
      setLocal('')
      return
    }
    const existing = factors[def.storageKey]
    setLocal(existing != null && existing > 0 ? String(existing) : '')
  }, [def, factors, storeItemId, selectedUnit])

  if (!def) return null

  const commit = (raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return
    const next = writeUnitFactorOverride(storeItemId, def.storageKey, n)
    onFactorsChange(next)
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span className="shrink-0">{def.label}</span>
        <Input
          inputMode="decimal"
          className="h-6 w-12 px-1 text-center text-[10px]"
          placeholder="?"
          value={local}
          onChange={(e) => setLocal(sanitizeQuantityInput(e.target.value))}
          onBlur={(e) => commit(e.target.value)}
        />
        <span className="shrink-0">{def.suffix}</span>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-dashed bg-muted/30 px-2 py-1.5 space-y-1">
      <Label className="text-[10px] text-muted-foreground">
        Set pack size — {def.label} how many {def.suffix}?
      </Label>
      <div className="flex items-center gap-2">
        <span className="text-xs shrink-0">{def.label}</span>
        <Input
          inputMode="decimal"
          className="h-8 w-20 text-center"
          placeholder="Qty"
          value={local}
          onChange={(e) => setLocal(sanitizeQuantityInput(e.target.value))}
          onBlur={(e) => commit(e.target.value)}
        />
        <span className="text-xs shrink-0">{def.suffix}</span>
      </div>
    </div>
  )
}
