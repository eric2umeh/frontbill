'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ROLE_DEFINITIONS, getPermissionGroups, type RoleKey, type Permission } from '@/lib/permissions'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { usePageData } from '@/hooks/use-page-data'
import { Loader2, Search, ShieldCheck, Check, X, Users, Edit2 } from 'lucide-react'

interface UserProfile {
  id: string
  full_name: string | null
  role: string
  avatar_url: string | null
  created_at: string
  email?: string
}

export default function UsersRolesPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const { initialLoading, startFetch, endFetch } = usePageData()
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const [search, setSearch] = useState('')
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [selectedRole, setSelectedRole] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [viewingRole, setViewingRole] = useState<RoleKey | null>(null)
  const router = useRouter()

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    startFetch()
    const supabase = createClient()
    if (!supabase) { endFetch(); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: myProfile } = await supabase
      .from('profiles').select('role, organization_id').eq('id', user.id).single()
    if (!myProfile) { endFetch(); return }

    setCurrentUserRole(myProfile.role || 'staff')

    if (!['admin', 'manager'].includes(myProfile.role || '')) {
      router.push('/dashboard')
      return
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, avatar_url, created_at')
      .eq('organization_id', myProfile.organization_id)
      .order('created_at', { ascending: true })

    if (error) { toast.error('Failed to load users'); endFetch(); return }

    setUsers(data || [])
    endFetch()
  }

  const updateUserRole = async () => {
    if (!editingUser || !selectedRole) return
    setSaving(true)
    const supabase = createClient()
    if (!supabase) { setSaving(false); return }

    const { error } = await supabase
      .from('profiles')
      .update({ role: selectedRole, updated_at: new Date().toISOString() })
      .eq('id', editingUser.id)

    if (error) {
      toast.error('Failed to update role')
    } else {
      toast.success(`${editingUser.full_name}'s role updated to ${ROLE_DEFINITIONS.find(r => r.key === selectedRole)?.label}`)
      setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, role: selectedRole } : u))
      setEditingUser(null)
    }
    setSaving(false)
  }

  const filteredUsers = useMemo(() =>
    users.filter(u =>
      (u.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      u.role.toLowerCase().includes(search.toLowerCase())
    ), [users, search])

  const permissionGroups = getPermissionGroups()

  const roleDef = viewingRole ? ROLE_DEFINITIONS.find(r => r.key === viewingRole) : null

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users & Roles</h1>
        <p className="text-muted-foreground">Manage staff access, roles and permissions for your hotel</p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" className="gap-2"><Users className="h-4 w-4" />Staff Users ({users.length})</TabsTrigger>
          <TabsTrigger value="roles" className="gap-2"><ShieldCheck className="h-4 w-4" />Roles & Permissions</TabsTrigger>
        </TabsList>

        {/* Users tab */}
        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Badge variant="outline" className="text-muted-foreground">{filteredUsers.length} users</Badge>
          </div>

          <div className="grid gap-3">
            {filteredUsers.map(user => {
              const role = ROLE_DEFINITIONS.find(r => r.key === user.role)
              return (
                <Card key={user.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {/* Avatar */}
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
                        {(user.full_name || 'U').charAt(0).toUpperCase()}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{user.full_name || 'Unnamed User'}</span>
                          <Badge className={role?.color || 'bg-gray-100 text-gray-800'}>
                            {role?.label || user.role}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Joined {new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      {/* Permissions quick-view */}
                      <div className="hidden md:flex items-center gap-1 flex-wrap max-w-xs">
                        {role && role.permissions.slice(0, 4).map(p => (
                          <Badge key={p} variant="outline" className="text-xs font-mono">{p}</Badge>
                        ))}
                        {role && role.permissions.length > 4 && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">+{role.permissions.length - 4} more</Badge>
                        )}
                      </div>
                      {/* Edit button — only admin can change roles */}
                      {currentUserRole === 'admin' && (
                        <Button variant="ghost" size="sm" className="gap-1.5 shrink-0"
                          onClick={() => { setEditingUser(user); setSelectedRole(user.role) }}>
                          <Edit2 className="h-3.5 w-3.5" />
                          Change Role
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {filteredUsers.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">No users found</div>
            )}
          </div>
        </TabsContent>

        {/* Roles tab */}
        <TabsContent value="roles" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            These are the standard hotel roles. Each role comes with a preset list of permissions. Click a role to view its full permission set.
          </p>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {ROLE_DEFINITIONS.map(role => (
              <Card key={role.key} className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setViewingRole(role.key as RoleKey)}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{role.label}</CardTitle>
                    <Badge className={role.color}>{role.key}</Badge>
                  </div>
                  <CardDescription className="text-xs">{role.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{role.permissions.length} permissions</span>
                    <span className="text-muted-foreground">
                      {users.filter(u => u.role === role.key).length} staff
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.keys(getPermissionGroups()).map(group => {
                      const groupPerms = permissionGroups[group]
                      const hasAny = groupPerms.some(p => role.permissions.includes(p.key as Permission))
                      return hasAny ? (
                        <Badge key={group} variant="outline" className="text-xs">{group}</Badge>
                      ) : null
                    })}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit role dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update role for <strong>{editingUser?.full_name}</strong>. This will immediately change their access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>New Role</Label>
              <Select value={selectedRole} onValueChange={setSelectedRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_DEFINITIONS.map(r => (
                    <SelectItem key={r.key} value={r.key}>
                      <div className="flex flex-col">
                        <span className="font-medium">{r.label}</span>
                        <span className="text-xs text-muted-foreground">{r.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedRole && (() => {
              const role = ROLE_DEFINITIONS.find(r => r.key === selectedRole)
              if (!role) return null
              return (
                <div className="border rounded-md p-3 bg-muted/30 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Permissions granted</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {Object.entries(permissionGroups).map(([group, perms]) => {
                      const granted = perms.filter(p => role.permissions.includes(p.key as Permission))
                      if (!granted.length) return null
                      return (
                        <div key={group}>
                          <p className="text-xs text-muted-foreground font-medium">{group}</p>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {granted.map(p => (
                              <Badge key={p.key} variant="outline" className="text-xs py-0">{p.label}</Badge>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setEditingUser(null)}>Cancel</Button>
              <Button onClick={updateUserRole} disabled={saving || selectedRole === editingUser?.role}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                Save Role
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View role permissions dialog */}
      <Dialog open={!!viewingRole} onOpenChange={(open) => !open && setViewingRole(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              {roleDef?.label} — Permission Set
            </DialogTitle>
            <DialogDescription>{roleDef?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {Object.entries(permissionGroups).map(([group, perms]) => (
              <div key={group}>
                <p className="text-sm font-semibold mb-2 border-b pb-1">{group}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {perms.map(p => {
                    const granted = roleDef?.permissions.includes(p.key as Permission)
                    return (
                      <div key={p.key} className={`flex items-center gap-2 text-sm rounded px-2 py-1 ${granted ? 'text-foreground' : 'text-muted-foreground opacity-50'}`}>
                        {granted
                          ? <Check className="h-3.5 w-3.5 text-green-600 shrink-0" />
                          : <X className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        }
                        {p.label}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
