'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Paperclip, X } from 'lucide-react'

export type FolioRemarksAttachmentsValue = {
  remarks: string
  files: File[]
}

type Props = {
  value: FolioRemarksAttachmentsValue
  onChange: (next: FolioRemarksAttachmentsValue) => void
  disabled?: boolean
  remarksLabel?: string
  remarksPlaceholder?: string
  compact?: boolean
}

export function FolioRemarksAttachmentsField({
  value,
  onChange,
  disabled,
  remarksLabel = 'Remarks / comments (optional)',
  remarksPlaceholder = 'ID copy details, guest request, internal note for approvers…',
  compact,
}: Props) {
  const inputId = useId()

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return
    const next = [...value.files]
    for (let i = 0; i < list.length; i++) {
      const f = list[i]
      if (!next.some((x) => x.name === f.name && x.size === f.size)) {
        next.push(f)
      }
    }
    onChange({ ...value, files: next })
  }

  const removeFile = (index: number) => {
    onChange({ ...value, files: value.files.filter((_, i) => i !== index) })
  }

  return (
    <div
      className={
        compact
          ? 'space-y-3'
          : 'space-y-3 rounded-lg border border-dashed bg-muted/30 p-4'
      }
    >
      <div className="flex items-start gap-2">
        <Paperclip className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          Optional remarks or photos (ID, payment slip, etc.) for managers and night audit.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${inputId}-remarks`}>{remarksLabel}</Label>
        <Textarea
          id={`${inputId}-remarks`}
          value={value.remarks}
          onChange={(e) => onChange({ ...value, remarks: e.target.value })}
          placeholder={remarksPlaceholder}
          rows={compact ? 2 : 3}
          disabled={disabled}
          className="resize-none"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${inputId}-files`}>Attach file(s) (optional)</Label>
        <Input
          id={`${inputId}-files`}
          type="file"
          accept="image/*,.pdf,application/pdf"
          multiple
          disabled={disabled}
          className="cursor-pointer bg-background"
          onChange={(e) => {
            addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <p className="text-xs text-muted-foreground">Images or PDF, up to 8 MB each.</p>
      </div>

      {value.files.length > 0 && (
        <ul className="space-y-1">
          {value.files.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              className="flex items-center justify-between gap-2 text-xs rounded-md border bg-background px-2 py-1.5"
            >
              <span className="truncate" title={f.name}>
                {f.name}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                disabled={disabled}
                onClick={() => removeFile(i)}
                aria-label="Remove file"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
