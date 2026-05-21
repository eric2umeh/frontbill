'use client'

import { useEffect, useState } from 'react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  EVENT_TIME_HOURS,
  EVENT_TIME_MINUTES,
  formatEventTime,
  parseEventTimeString,
  type EventTimeParts,
} from '@/lib/utils/event-time-format'
import { X } from 'lucide-react'

const DEFAULT_PARTS: EventTimeParts = { hour12: 9, minute: 0, period: 'AM' }

type Props = {
  label: string
  value: string
  onChange: (value: string) => void
  optional?: boolean
  disabled?: boolean
}

export function EventTimeField({ label, value, onChange, optional, disabled }: Props) {
  const parsed = parseEventTimeString(value)
  const [hour12, setHour12] = useState(parsed?.hour12 ?? DEFAULT_PARTS.hour12)
  const [minute, setMinute] = useState(parsed?.minute ?? DEFAULT_PARTS.minute)
  const [period, setPeriod] = useState<'AM' | 'PM'>(parsed?.period ?? DEFAULT_PARTS.period)
  const [active, setActive] = useState(Boolean(parsed))

  useEffect(() => {
    const p = parseEventTimeString(value)
    if (p) {
      setHour12(p.hour12)
      setMinute(p.minute)
      setPeriod(p.period)
      setActive(true)
    } else if (!value) {
      setActive(false)
    }
  }, [value])

  const emit = (parts: EventTimeParts) => {
    onChange(formatEventTime(parts))
  }

  const enable = () => {
    setActive(true)
    emit({ hour12, minute, period })
  }

  const clear = () => {
    setActive(false)
    onChange('')
  }

  if (optional && !active && !value) {
    return (
      <div className="space-y-1">
        <Label className="text-muted-foreground">{label} (optional)</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start text-muted-foreground font-normal"
          disabled={disabled}
          onClick={enable}
        >
          Add time
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label>
          {label}
          {optional && <span className="text-muted-foreground font-normal"> (optional)</span>}
        </Label>
        {optional && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={disabled}
            onClick={clear}
            title="Clear time"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Select
          value={String(hour12)}
          disabled={disabled}
          onValueChange={(v) => {
            const h = Number(v)
            setHour12(h)
            emit({ hour12: h, minute, period })
          }}
        >
          <SelectTrigger className="w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TIME_HOURS.map((h) => (
              <SelectItem key={h} value={String(h)}>
                {h}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-sm">:</span>
        <Select
          value={String(minute).padStart(2, '0')}
          disabled={disabled}
          onValueChange={(v) => {
            const m = Number(v)
            setMinute(m)
            emit({ hour12, minute: m, period })
          }}
        >
          <SelectTrigger className="w-[72px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TIME_MINUTES.map((m) => (
              <SelectItem key={m} value={String(m).padStart(2, '0')}>
                {String(m).padStart(2, '0')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={period}
          disabled={disabled}
          onValueChange={(v: 'AM' | 'PM') => {
            setPeriod(v)
            emit({ hour12, minute, period: v })
          }}
        >
          <SelectTrigger className="w-[80px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AM">AM</SelectItem>
            <SelectItem value="PM">PM</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
