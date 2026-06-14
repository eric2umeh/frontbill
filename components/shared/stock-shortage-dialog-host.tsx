'use client'

import { useEffect, useState } from 'react'
import {
  closeStockShortageDialog,
  subscribeStockShortageDialog,
  type StockShortagePayload,
} from '@/lib/ui/stock-shortage-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function StockShortageDialogHost() {
  const [payload, setPayload] = useState<StockShortagePayload | null>(null)

  useEffect(() => subscribeStockShortageDialog(setPayload), [])

  return (
    <Dialog
      open={!!payload}
      onOpenChange={(open) => {
        if (!open) closeStockShortageDialog()
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{payload?.title ?? 'Not enough stock'}</DialogTitle>
        </DialogHeader>
        {payload && (
          <>
            <p className="text-sm text-muted-foreground">{payload.message}</p>
            <div className="rounded-lg border overflow-auto flex-1 min-h-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">On hand</TableHead>
                    <TableHead className="text-right">Need</TableHead>
                    <TableHead className="text-right">Short</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payload.items.map((line) => {
                    const short = Math.max(0, line.need - line.onHand)
                    return (
                      <TableRow key={`${line.name}-${line.unit}`}>
                        <TableCell className="font-medium">{line.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.onHand} {line.unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.need} {line.unit}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-destructive font-medium">
                          {short} {line.unit}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => closeStockShortageDialog()}>
                OK
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
