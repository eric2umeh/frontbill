'use client'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

export type GuestProfileFormValues = {
  name: string
  phone: string
  email: string
  address: string
  city: string
  country: string
  id_type: string
  id_number: string
}

type GuestProfileEditPanelProps = {
  values: GuestProfileFormValues
  onChange: (patch: Partial<GuestProfileFormValues>) => void
  onCancel: () => void
  onSave: () => void
  saving?: boolean
}

export function GuestProfileEditPanel({
  values,
  onChange,
  onCancel,
  onSave,
  saving = false,
}: GuestProfileEditPanelProps) {
  return (
    <Card className="border-2 border-primary bg-primary/5 shadow-md">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">Edit guest profile</CardTitle>
        <CardDescription>
          Update contact details and identification. Changing the full name also
          updates this guest&apos;s city ledger account title and transaction
          labels.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="guest-edit-name">Full Name</Label>
          <Input
            id="guest-edit-name"
            autoFocus
            className="text-lg font-semibold h-11"
            value={values.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="guest-edit-phone">Phone</Label>
            <Input
              id="guest-edit-phone"
              value={values.phone}
              onChange={(e) => onChange({ phone: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="guest-edit-email">Email</Label>
            <Input
              id="guest-edit-email"
              type="email"
              value={values.email}
              onChange={(e) => onChange({ email: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="guest-edit-address">Address</Label>
          <Input
            id="guest-edit-address"
            value={values.address}
            onChange={(e) => onChange({ address: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="guest-edit-city">City</Label>
            <Input
              id="guest-edit-city"
              value={values.city}
              onChange={(e) => onChange({ city: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="guest-edit-country">Country</Label>
            <Input
              id="guest-edit-country"
              value={values.country}
              onChange={(e) => onChange({ country: e.target.value })}
            />
          </div>
        </div>
        <Separator />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="guest-edit-id-type">ID Type</Label>
            <Input
              id="guest-edit-id-type"
              value={values.id_type}
              onChange={(e) => onChange({ id_type: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="guest-edit-id-number">ID Number</Label>
            <Input
              id="guest-edit-id-number"
              value={values.id_number}
              onChange={(e) => onChange({ id_number: e.target.value })}
            />
          </div>
        </div>
      </CardContent>
      <div className="flex flex-wrap justify-end gap-2 border-t px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </Card>
  )
}
