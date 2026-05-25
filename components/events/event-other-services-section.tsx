'use client'

import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  EVENT_OTHER_SERVICE_OPTIONS,
  sumEventOtherServices,
  type EventOtherServiceChoice,
  type EventOtherServiceKey,
  type EventOtherServiceLine,
} from '@/lib/events/event-other-services'
import { formatNaira } from '@/lib/utils/currency'

type PriceMap = Partial<Record<EventOtherServiceKey, string>>

type Props = {
  choice: EventOtherServiceChoice
  onChoiceChange: (choice: EventOtherServiceChoice) => void
  lines: EventOtherServiceLine[]
  onChange: (lines: EventOtherServiceLine[]) => void
  priceByType: PriceMap
  onPriceByTypeChange: (next: PriceMap) => void
  disabled?: boolean
}

function linesFromPriceMap(priceByType: PriceMap): EventOtherServiceLine[] {
  const lines: EventOtherServiceLine[] = []
  for (const opt of EVENT_OTHER_SERVICE_OPTIONS) {
    const amount = Math.max(0, Number(priceByType[opt.value]) || 0)
    if (amount > 0) lines.push({ type: opt.value, amount })
  }
  return lines
}

export function priceMapFromLines(lines: EventOtherServiceLine[]): PriceMap {
  const map: PriceMap = {}
  for (const line of lines) {
    map[line.type] = String(line.amount)
  }
  return map
}

export function EventOtherServicesSection({
  choice,
  onChoiceChange,
  lines,
  onChange,
  priceByType,
  onPriceByTypeChange,
  disabled,
}: Props) {
  const total = useMemo(() => sumEventOtherServices(lines), [lines])

  const setPrice = (type: EventOtherServiceKey, value: string) => {
    const next = { ...priceByType, [type]: value }
    onPriceByTypeChange(next)
    onChange(linesFromPriceMap(next))
  }

  const handleChoiceChange = (value: string) => {
    const next = value as EventOtherServiceChoice
    onChoiceChange(next)
    if (next === 'none') {
      onPriceByTypeChange({})
      onChange([])
    }
  }

  const visibleOptions =
    choice === 'multiple'
      ? EVENT_OTHER_SERVICE_OPTIONS
      : choice !== 'none'
        ? EVENT_OTHER_SERVICE_OPTIONS.filter((o) => o.value === choice)
        : []

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="space-y-1">
        <Label className="text-sm font-medium">Other services (optional)</Label>
        <p className="text-xs text-muted-foreground">
          All service prices are shown below — enter amounts only for what applies, or choose None.
        </p>
      </div>

      <Select value={choice} onValueChange={handleChoiceChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Multiple services" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="multiple">Multiple services</SelectItem>
          {EVENT_OTHER_SERVICE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
          <SelectItem value="none">None</SelectItem>
        </SelectContent>
      </Select>

      {choice !== 'none' && visibleOptions.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {visibleOptions.map((opt) => (
            <div key={opt.value} className="space-y-1">
              <Label className="text-xs">{opt.label} (₦)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={priceByType[opt.value] ?? ''}
                onChange={(e) => setPrice(opt.value, e.target.value)}
                placeholder="0"
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Other services add-on:{' '}
          <span className="font-medium text-foreground">{formatNaira(total)}</span>
        </p>
      )}
    </div>
  )
}
