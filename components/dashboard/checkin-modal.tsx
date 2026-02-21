'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Search, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface CheckinModalProps {
  open: boolean
  onClose: () => void
}

export function CheckinModal({ open, onClose }: CheckinModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Please enter a guest name or booking ID')
      return
    }

    setSearching(true)
    
    // Simulate search
    setTimeout(() => {
      toast.info('Guest search feature - navigate to Reservations to check in')
      setSearching(false)
      onClose()
    }, 1000)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Check-in Guest</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="search">Search Guest or Booking ID</Label>
            <div className="flex gap-2">
              <Input
                id="search"
                placeholder="Enter name, phone, or booking ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Button onClick={handleSearch} disabled={searching}>
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-3">
              Or navigate to:
            </p>
            <div className="space-y-2">
              <Link href="/reservations">
                <Button variant="outline" className="w-full justify-start">
                  Go to Reservations
                </Button>
              </Link>
              <Link href="/bookings">
                <Button variant="outline" className="w-full justify-start">
                  View All Bookings
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
