import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage hotel information and system preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hotel Information</CardTitle>
          <CardDescription>
            Update your hotel details for documents and reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hotel_name">Hotel Name</Label>
              <Input id="hotel_name" placeholder="Grand Hotel" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hotel_email">Email</Label>
              <Input id="hotel_email" type="email" placeholder="info@hotel.com" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="hotel_address">Address</Label>
            <Input id="hotel_address" placeholder="123 Main Street, Lagos" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hotel_phone">Phone</Label>
              <Input id="hotel_phone" placeholder="+234 800 000 0000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" value="Nigerian Naira (₦)" disabled />
            </div>
          </div>
          <Separator />
          <Button>Save Changes</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            Manage staff accounts and permissions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            User roles: Admin, Manager, Front Desk, Accountant
          </p>
          <Button variant="outline">Manage Users</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>System Preferences</CardTitle>
          <CardDescription>
            Configure system behavior and notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email Notifications</p>
              <p className="text-sm text-muted-foreground">Receive alerts for important events</p>
            </div>
            <Button variant="outline" size="sm">Configure</Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Anomaly Detection</p>
              <p className="text-sm text-muted-foreground">Automatic flagging of suspicious transactions</p>
            </div>
            <Button variant="outline" size="sm">Configure</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
