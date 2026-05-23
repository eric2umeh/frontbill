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
  type EventOtherServiceKey,
  type EventOtherServiceLine,
} from '@/lib/events/event-other-services'
import { formatNaira } from '@/lib/utils/currency'

type PriceMap = Partial<Record<EventOtherServiceKey, string>>

type Props = {
  lines: EventOtherServiceLine[]
  onChange: (lines: EventOtherServiceLine[]) => void
  /** Which service row is focused in the secondary dropdown (optional filter). */
  activeType: EventOtherServiceKey | ''
  onActiveTypeChange: (type: EventOtherServiceKey | '') => void
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
  lines,
  onChange,
  activeType,
  onActiveTypeChange,
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

  const visibleOptions = activeType
    ? EVENT_OTHER_SERVICE_OPTIONS.filter((o) => o.value === activeType)
    : EVENT_OTHER_SERVICE_OPTIONS

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div>
        <Label className="text-sm font-medium">Other services</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          Choose a service type, then enter the price for each item you need.
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Service type</Label>
        <Select
          value={activeType || 'all'}
          onValueChange={(v) =>
            onActiveTypeChange(v === 'all' ? '' : (v as EventOtherServiceKey))
          }
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="All services" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All services</SelectItem>
            {EVENT_OTHER_SERVICE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

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

      {lines.length > 0 && (
        <p className="text-sm font-medium">
          Other services total: <span className="tabular-nums">{formatNaira(total)}</span>
        </p>
      )}
    </div>
  )
}
