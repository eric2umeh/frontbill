'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Search, Check } from 'lucide-react'
import { toast } from 'sonner'

// Mock existing organizations for search
const mockOrganizations = [
  { name: 'Shell Nigeria Ltd', type: 'private' },
  { name: 'Federal Ministry of Health', type: 'government' },
  { name: 'United Nations Development Programme', type: 'ngo' },
  { name: 'Lagos State Government', type: 'government' },
  { name: 'TotalEnergies Nigeria', type: 'private' },
]

interface AddOrganizationModalProps {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function AddOrganizationModal({ open, onClose, onSuccess }: AddOrganizationModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    type: 'private',
    contactPerson: '',
    email: '',
    phone: '',
  })
  const [loading, setLoading] = useState(false)
  const [filteredOrgs, setFilteredOrgs] = useState<any[]>([])
  const [selectedOrg, setSelectedOrg] = useState<any>(null)

  useEffect(() => {
    if (formData.name.length > 2) {
      const filtered = mockOrganizations.filter(org => 
        org.name.toLowerCase().includes(formData.name.toLowerCase())
      ).slice(0, 5)
      setFilteredOrgs(filtered)

      const exactMatch = mockOrganizations.find(org => 
        org.name.toLowerCase() === formData.name.toLowerCase()
      )
      if (exactMatch && !selectedOrg) {
        setSelectedOrg(exactMatch)
        setFormData({ ...formData, type: exactMatch.type })
        setFilteredOrgs([])
        toast.success('Organization found in database!')
      }
    } else {
      setFilteredOrgs([])
    }
  }, [formData.name, selectedOrg])

  const handleSelectOrg = (org: any) => {
    setSelectedOrg(org)
    setFormData({ ...formData, name: org.name, type: org.type })
    setFilteredOrgs([])
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim() || !formData.contactPerson.trim()) {
      toast.error('Please fill in name and contact person')
      return
    }

    setLoading(true)
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500))
      
      console.log('[v0] Organization added:', formData)
      toast.success(`Organization "${formData.name}" added successfully!`)
      
      // Reset form
      setFormData({
        name: '',
        type: 'private',
        contactPerson: '',
        email: '',
        phone: '',
      })
      setSelectedOrg(null)
      setFilteredOrgs([])
      
      onClose()
      onSuccess?.()
    } catch (error: any) {
      toast.error(error.message || 'Failed to add organization')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Organization</DialogTitle>
          <DialogDescription>Search for existing organizations or add a new one</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name *</Label>
            <div className="relative">
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => {
                  setFormData({ ...formData, name: e.target.value })
                  setSelectedOrg(null)
                }}
                placeholder="Type to search or add new..."
                className="pr-8"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
            {filteredOrgs.length > 0 && (
              <Card className="mt-1 absolute z-10 w-full">
                <CardContent className="p-2">
                  {filteredOrgs.map((org) => (
                    <div
                      key={org.name}
                      className="p-2 hover:bg-accent rounded cursor-pointer"
                      onClick={() => handleSelectOrg(org)}
                    >
                      <div className="font-medium">{org.name}</div>
                      <div className="text-sm text-muted-foreground capitalize">{org.type}</div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {selectedOrg && (
              <p className="text-sm text-green-600 flex items-center gap-1">
                <Check className="h-3 w-3" /> Organization found in database
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Organization Type *</Label>
            <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="government">Government</SelectItem>
                <SelectItem value="private">Private</SelectItem>
                <SelectItem value="ngo">NGO</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPerson">Contact Person *</Label>
            <Input
              id="contactPerson"
              value={formData.contactPerson}
              onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
              placeholder="Full name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="contact@organization.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+234 800 000 0000"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Organization'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
