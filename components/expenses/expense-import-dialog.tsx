'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'

interface Props {
  open: boolean
  onClose: () => void
  userId: string
  onSuccess: () => void
}

export function ExpenseImportDialog({ open, onClose, userId, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)

  const handleFile = async (file: File) => {
    setLoading(true)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: false })
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        defval: '',
        raw: false,
      }) as string[][]

      const res = await fetch('/api/expenses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ caller_id: userId, rows }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Import failed')
        return
      }
      toast.success(
        `Imported ${json.imported_cells} expense cells (${json.imported_notes} day notes)`,
      )
      onSuccess()
      onClose()
    } catch (e: any) {
      toast.error(e.message || 'Could not read file')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import expenditure sheet</DialogTitle>
          <DialogDescription>
            Upload an Excel (.xlsx) or CSV export matching your daily expenditure template (DATE row,
            category columns, amounts per day).
          </DialogDescription>
        </DialogHeader>
        <Input
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={loading}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFile(f)
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
        </DialogFooter>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Importing…
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
