'use client'

import {
  DEPT_LABELS,
  STORE_DEPT_PICKER_OPTIONS_SORTED,
  type SupplyDept,
} from '@/lib/supply-chain/types'
import { cn } from '@/lib/utils'

type Dept = Exclude<SupplyDept, 'all'>

type Props = {
  value: Dept[]
  onChange: (depts: Dept[]) => void
  className?: string
}

export function StoreDeptMultiSelect({ value, onChange, className }: Props) {
  const toggle = (dept: Dept) => {
    if (value.includes(dept)) {
      onChange(value.filter((d) => d !== dept))
      return
    }
    onChange([...value, dept])
  }

  return (
    <div className={cn('rounded-md border p-2 max-h-48 overflow-y-auto', className)}>
      <p className="text-[10px] text-muted-foreground mb-2 px-1">
        Select one or more — stock qty is shared across selected departments.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {STORE_DEPT_PICKER_OPTIONS_SORTED.map((dept) => {
          const checked = value.includes(dept)
          return (
            <label
              key={dept}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/60',
                checked && 'bg-primary/10',
              )}
            >
              <input
                type="checkbox"
                className="rounded border-input"
                checked={checked}
                onChange={() => toggle(dept)}
              />
              <span>{DEPT_LABELS[dept]}</span>
            </label>
          )
        })}
      </div>
    </div>
  )
}
