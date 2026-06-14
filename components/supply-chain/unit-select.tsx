'use client'

import {
  DEFAULT_MEASUREMENT_UNIT,
  MEASUREMENT_UNITS,
  normalizeMeasurementUnit,
  formatUnitLabel,
  unitOptionsForStoreItem,
} from '@/lib/supply-chain/measurement-units'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  value: string
  onChange: (unit: string) => void
  className?: string
  disabled?: boolean
  /** When set, show store unit + related alternatives only. */
  storeUnit?: string
  itemName?: string
  /** Override full unit list. */
  units?: string[]
}

export function UnitSelect({
  value,
  onChange,
  className,
  disabled,
  storeUnit,
  itemName,
  units,
}: Props) {
  const normalized = normalizeMeasurementUnit(value)
  const options = units?.length
    ? [...new Set(units.map(normalizeMeasurementUnit))].sort()
    : storeUnit
      ? unitOptionsForStoreItem(storeUnit, itemName)
      : [...MEASUREMENT_UNITS]

  const safeValue = options.includes(normalized)
    ? normalized
    : (options[0] ?? DEFAULT_MEASUREMENT_UNIT)

  return (
    <Select value={safeValue} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={className ?? 'h-8 w-[88px] text-xs'}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((u) => (
          <SelectItem key={u} value={u} className="text-xs">
            {formatUnitLabel(u)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
