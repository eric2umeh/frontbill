'use client'

import * as React from 'react'
import type { Matcher } from 'react-day-picker'
import { format, addDays, differenceInCalendarDays } from 'date-fns'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StayDateRangeFieldsProps {
  checkIn?: Date
  checkOut?: Date
  nights: number
  /** Checkout may be undefined after the guest picks check-in first (still in calendar). */
  onDatesChange: (checkIn: Date, checkOut: Date | undefined) => void
  onNightsChange?: (nights: number) => void
  disableCalendar?: Matcher
  /** When false, omit nights row (caller syncs elsewhere). */
  showNights?: boolean
  /** layout `card`: bordered block with „Stay Dates” title. `inline`: labels + picker only (for nested sections). */
  layout?: 'card' | 'inline'
  title?: string
  className?: string
}

/** One calendar picker: choose check-in then check-out in a single interaction. */
export function StayDateRangeFields({
  checkIn,
  checkOut,
  nights,
  onDatesChange,
  onNightsChange,
  disableCalendar,
  showNights = true,
  layout = 'card',
  title = 'Stay Dates',
  className,
}: StayDateRangeFieldsProps) {
  const [open, setOpen] = React.useState(false)
  const [nightsDraft, setNightsDraft] = React.useState(() => (nights < 1 ? '' : String(nights)))

  React.useEffect(() => {
    setNightsDraft(nights < 1 ? '' : String(nights))
  }, [nights])

  const inner = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Check-in Date *</Label>
        </div>
        <div className="space-y-2">
          <Label>Check-out Date *</Label>
        </div>
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" type="button" className="w-full justify-start text-left font-normal min-h-10 h-auto py-2">
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-70" aria-hidden />
            <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className={cn(!checkIn && 'text-muted-foreground')}>
                {checkIn ? format(checkIn, 'dd MMM yyyy') : 'Select check-in'}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className={cn(!checkOut && 'text-muted-foreground')}>
                {checkOut ? format(checkOut, 'dd MMM yyyy') : 'Select check-out'}
              </span>
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            numberOfMonths={1}
            defaultMonth={checkIn || checkOut || new Date()}
            selected={{ from: checkIn, to: checkOut }}
            onSelect={(range) => {
              if (!range?.from) return
              let from = range.from
              let to = range.to
              if (to && from) {
                if (to < from) {
                  const t = from
                  from = to
                  to = t
                }
                if (differenceInCalendarDays(to, from) < 1) {
                  to = addDays(from, 1)
                }
                onDatesChange(from, to)
                setOpen(false)
              } else {
                onDatesChange(from, undefined)
              }
            }}
            disabled={disableCalendar}
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {showNights && onNightsChange && (
        <div className="space-y-2">
          <Label>Number of Nights *</Label>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="1"
            value={nightsDraft}
            onChange={(e) => {
              const raw = e.target.value
              if (raw === '') {
                setNightsDraft('')
                return
              }
              if (!/^\d+$/.test(raw)) return
              setNightsDraft(raw)
              const n = parseInt(raw, 10)
              if (!Number.isNaN(n) && n >= 1) onNightsChange(n)
            }}
            onBlur={() => {
              const n = parseInt(nightsDraft, 10)
              if (nightsDraft.trim() === '' || Number.isNaN(n) || n < 1) {
                const fallback = nights >= 1 ? nights : 1
                setNightsDraft(String(fallback))
                onNightsChange(fallback)
                return
              }
              setNightsDraft(String(n))
              onNightsChange(n)
            }}
          />
        </div>
      )}
    </>
  )

  if (layout === 'inline') {
    return <div className={cn('space-y-4', className)}>{inner}</div>
  }

  return (
    <div className={cn('rounded-lg border p-4 space-y-4', className)}>
      <p className="text-sm font-semibold">{title}</p>
      {inner}
    </div>
  )
}
