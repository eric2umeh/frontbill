'use client'

import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { OUTLET_ITEM_TAGS } from '@/lib/outlets/types'
import { formatOutletItemTagLabel } from '@/lib/outlets/item-display'
import { X } from 'lucide-react'

export type OutletItemMetaValue = {
  description: string
  tags: string[]
}

type Props = {
  value: OutletItemMetaValue
  onChange: (next: OutletItemMetaValue) => void
  descriptionId?: string
}

export function OutletItemMetaFields({ value, onChange, descriptionId = 'outlet-item-description' }: Props) {
  const [customTag, setCustomTag] = useState('')

  const presetKeys = new Set(OUTLET_ITEM_TAGS.map((t) => t.key))
  const selected = value.tags ?? []

  const togglePreset = (key: string) => {
    const has = selected.includes(key)
    const next = has ? selected.filter((t) => t !== key) : [...selected, key]
    onChange({ ...value, tags: next })
  }

  const removeTag = (key: string) => {
    onChange({ ...value, tags: selected.filter((t) => t !== key) })
  }

  const addCustomTag = () => {
    const raw = customTag.trim()
    if (!raw) return
    const key = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (!key || selected.includes(key)) {
      setCustomTag('')
      return
    }
    onChange({ ...value, tags: [...selected, key] })
    setCustomTag('')
  }

  const customOnly = selected.filter((t) => !presetKeys.has(t as (typeof OUTLET_ITEM_TAGS)[number]['key']))

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="space-y-1">
        <Label htmlFor={descriptionId}>POS description (optional)</Label>
        <Textarea
          id={descriptionId}
          rows={2}
          placeholder="Short line under the item name on Take order (e.g. Served chilled, 330ml)"
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">Leave blank to show no description on the POS card.</p>
      </div>

      <div className="space-y-2">
        <Label>Display tags (optional)</Label>
        <p className="text-xs text-muted-foreground">Pills shown on the POS menu card. Tap to toggle.</p>
        <div className="flex flex-wrap gap-1.5">
          {OUTLET_ITEM_TAGS.map((t) => {
            const on = selected.includes(t.key)
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => togglePreset(t.key)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                  on
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-muted/50 text-muted-foreground border-transparent hover:border-amber-300',
                )}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Custom tag (e.g. Spicy)"
            value={customTag}
            onChange={(e) => setCustomTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCustomTag()
              }
            }}
          />
          <Button type="button" variant="secondary" size="sm" onClick={addCustomTag}>
            Add tag
          </Button>
        </div>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((key) => (
              <Badge key={key} variant="secondary" className="gap-1 pr-1 text-xs">
                {formatOutletItemTagLabel(key)}
                <button
                  type="button"
                  className="rounded-full hover:bg-muted-foreground/20 p-0.5"
                  onClick={() => removeTag(key)}
                  aria-label={`Remove ${key}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {customOnly.length > 0 && (
          <p className="text-[10px] text-muted-foreground">
            Custom: {customOnly.map(formatOutletItemTagLabel).join(', ')}
          </p>
        )}
      </div>
    </div>
  )
}
