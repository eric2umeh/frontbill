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
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { usePageData } from '@/hooks/use-page-data'
import {
  Loader2, Search, ShieldCheck, Check, X, Users, Edit2, Plus,
  Trash2, Eye, EyeOff, KeyRound,
} from 'lucide-react'

interface UserProfile {
  id: string
  full_name: string | null
  role: string
  avatar_url: string | null
  created_at: string
  email?: string
}

// ---- Add User state shape ----
interface AddUserForm {
  full_name: string
  email: string
  password: string
  role: string
}

const EMPTY_ADD_FORM: AddUserForm = { full_name: '', email: '', password: '', role: '' }

export default function UsersRolesPage() {
  const [users, setUsers] = useState<UserProfile[]>([])
  const { initialLoading, startFetch, endFetch } = usePageData()
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [currentUserRole, setCurrentUserRole] = useState<string>('')
  const [search, setSearch] = useState('')

  // Edit role/name/password dialog
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [editForm, setEditForm] = useState({ role: '', full_name: '', password: '', confirmPassword: '' })
  const [showEditPassword, setShowEditPassword] = useState(false)
  const [saving, setSaving] = useState(false)

  // Add user dialog
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<AddUserForm>(EMPTY_ADD_FORM)
  const [showAddPassword, setShowAddPassword] = useState(false)
  const [adding, setAdding] = useState(false)

  // Delete confirm
  const [deletingUser, setDeletingUser] = useState<UserProfile | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Roles view
  const [viewingRole, setViewingRole] = useState<RoleKey | null>(null)

  const router = useRouter()

  useEffect(() => { fetchUsers() }, [])

  const fetchUsers = async () => {
    startFetch()
    const supabase = createClient()
    if (!supabase) { endFetch(); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    setCurrentUserId(user.id)

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

  // ---- Add user ----
  const handleAddUser = async () => {
    if (!addForm.full_name.trim() || !addForm.email.trim() || !addForm.password || !addForm.role) {
      toast.error('Please fill in all fields')
      return
    }
    if (addForm.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...addForm, caller_id: currentUserId }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to create user'); return }

      toast.success(`${addForm.full_name} added successfully`)
      setUsers(prev => [...prev, { ...json.user, avatar_url: null }])
      setAddOpen(false)
      setAddForm(EMPTY_ADD_FORM)
    } catch {
      toast.error('Network error, please try again')
    } finally {
      setAdding(false)
    }
  }

  // ---- Edit user (role + name + optional password) ----
  const openEdit = (user: UserProfile) => {
    setEditingUser(user)
    setEditForm({ role: user.role, full_name: user.full_name || '', password: '', confirmPassword: '' })
    setShowEditPassword(false)
  }

  const handleUpdateUser = async () => {
    if (!editingUser) return
    if (editForm.password && editForm.password !== editForm.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (editForm.password && editForm.password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    try {
      const body: Record<string, string> = {}
      if (editForm.role !== editingUser.role) body.role = editForm.role
      if (editForm.full_name !== (editingUser.full_name || '')) body.full_name = editForm.full_name
      if (editForm.password) body.password = editForm.password

      if (Object.keys(body).length === 0) {
        toast.info('No changes to save')
        setSaving(false)
        return
      }

      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...body, caller_id: currentUserId }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to update user'); return }

      toast.success(`${editForm.full_name || editingUser.full_name} updated`)
      setUsers(prev => prev.map(u => u.id === editingUser.id
        ? { ...u, role: editForm.role, full_name: editForm.full_name || u.full_name }
        : u
      ))
      setEditingUser(null)
    } catch {
      toast.error('Network error, please try again')
    } finally {
      setSaving(false)
    }
  }

  // ---- Delete user ----
  const handleDeleteUser = async () => {
    if (!deletingUser) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/users/${deletingUser.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ caller_id: currentUserId }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to delete user'); return }

      toast.success(`${deletingUser.full_name} removed`)
      setUsers(prev => prev.filter(u => u.id !== deletingUser.id))
      setDeletingUser(null)
    } catch {
      toast.error('Network error, please try again')
    } finally {
      setDeleting(false)
    }
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
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Staff Users ({users.length})
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Roles & Permissions
          </TabsTrigger>
        </TabsList>

        {/* ---- Users tab ---- */}
        <TabsContent value="users" className="mt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
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
            {currentUserRole === 'admin' && (
              <Button size="sm" className="gap-2 ml-auto" onClick={() => { setAddOpen(true); setAddForm(EMPTY_ADD_FORM) }}>
                <Plus className="h-4 w-4" />
                Add User
              </Button>
            )}
          </div>

          <div className="grid gap-3">
            {filteredUsers.map(user => {
              const role = ROLE_DEFINITIONS.find(r => r.key === user.role)
              const isCurrentUser = user.id === currentUserId
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
                          {isCurrentUser && (
                            <Badge variant="secondary" className="text-xs">You</Badge>
                          )}
                          <Badge className={role?.color || 'bg-gray-100 text-gray-800'}>
                            {role?.label || user.role}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Added {new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </div>
                      </div>
                      {/* Permissions quick-view */}
                      <div className="hidden md:flex items-center gap-1 flex-wrap max-w-xs">
                        {role && role.permissions.slice(0, 4).map(p => (
                          <Badge key={p} variant="outline" className="text-xs font-mono">{p}</Badge>
                        ))}
                        {role && role.permissions.length > 4 && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            +{role.permissions.length - 4} more
                          </Badge>
                        )}
                      </div>
                      {/* Actions — only admin, cannot act on self */}
                      {currentUserRole === 'admin' && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => openEdit(user)}>
                            <Edit2 className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          {!isCurrentUser && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => setDeletingUser(user)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </Button>
                          )}
                        </div>
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

        {/* ---- Roles tab ---- */}
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

      {/* ======== ADD USER DIALOG ======== */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!adding) { setAddOpen(o); if (!o) setAddForm(EMPTY_ADD_FORM) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a staff account. The user can log in immediately with the email and password you provide.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="add-name">Full Name</Label>
              <Input
                id="add-name"
                placeholder="e.g. James Okafor"
                value={addForm.full_name}
                onChange={(e) => setAddForm(p => ({ ...p, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">Email Address</Label>
              <Input
                id="add-email"
                type="email"
                placeholder="james@yourhotel.com"
                value={addForm.email}
                onChange={(e) => setAddForm(p => ({ ...p, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-password">Password</Label>
              <div className="relative">
                <Input
                  id="add-password"
                  type={showAddPassword ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  value={addForm.password}
                  onChange={(e) => setAddForm(p => ({ ...p, password: e.target.value }))}
                  className="pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowAddPassword(v => !v)}
                >
                  {showAddPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm(p => ({ ...p, role: v }))}>
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

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={adding}>Cancel</Button>
              <Button onClick={handleAddUser} disabled={adding}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                Add User
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======== EDIT USER DIALOG ======== */}
      <Dialog open={!!editingUser} onOpenChange={(o) => { if (!saving) { if (!o) setEditingUser(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update details for <strong>{editingUser?.full_name}</strong>. Leave password blank to keep it unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input
                id="edit-name"
                value={editForm.full_name}
                onChange={(e) => setEditForm(p => ({ ...p, full_name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm(p => ({ ...p, role: v }))}>
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

            {editForm.role && (() => {
              const role = ROLE_DEFINITIONS.find(r => r.key === editForm.role)
              if (!role) return null
              return (
                <div className="border rounded-md p-3 bg-muted/30 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Permissions granted</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
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

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" />
                  Change Password
                  <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                </Label>
                <button
                  type="button"
                  className="text-xs text-primary underline"
                  onClick={() => setShowEditPassword(v => !v)}
                >
                  {showEditPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <Input
                type={showEditPassword ? 'text' : 'password'}
                placeholder="Leave blank to keep current password"
                value={editForm.password}
                onChange={(e) => setEditForm(p => ({ ...p, password: e.target.value }))}
              />
              {editForm.password && (
                <Input
                  type={showEditPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={editForm.confirmPassword}
                  onChange={(e) => setEditForm(p => ({ ...p, confirmPassword: e.target.value }))}
                  className="mt-2"
                />
              )}
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <Button variant="outline" onClick={() => setEditingUser(null)} disabled={saving}>Cancel</Button>
              <Button onClick={handleUpdateUser} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======== DELETE CONFIRM DIALOG ======== */}
      <Dialog open={!!deletingUser} onOpenChange={(o) => { if (!deleting && !o) setDeletingUser(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove User</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently remove <strong>{deletingUser?.full_name}</strong>? This action cannot be undone and will revoke their access immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setDeletingUser(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Remove User
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======== VIEW ROLE PERMISSIONS DIALOG ======== */}
      <Dialog open={!!viewingRole} onOpenChange={(o) => !o && setViewingRole(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              {roleDef?.label} - Permission Set
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
