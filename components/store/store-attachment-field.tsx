'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Paperclip } from 'lucide-react'

type Props = {
  label: string
  description?: string
  file: File | null
  onFileChange: (f: File | null) => void
  disabled?: boolean
}

export function StoreAttachmentField({ label, description, file, onFileChange, disabled }: Props) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-4">
      <div className="flex items-start gap-2">
        <Paperclip className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="space-y-1 flex-1">
          <Label htmlFor="store-attach-input">{label}</Label>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <Input
        id="store-attach-input"
        type="file"
        accept="image/*,.pdf,application/pdf"
        disabled={disabled}
        className="cursor-pointer bg-background"
        onChange={(e) => {
          const f = e.target.files?.[0]
          onFileChange(f || null)
        }}
      />
      {file ? (
        <p className="text-xs text-muted-foreground truncate" title={file.name}>
          Selected: {file.name}
        </p>
      ) : null}
    </div>
  )
}
