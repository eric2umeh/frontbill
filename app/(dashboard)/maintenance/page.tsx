'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { hasPermission } from '@/lib/permissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import {
  Wrench, Plus, Search, CheckCircle2, Clock, AlertCircle,
  User, Bed, CalendarDays, ClipboardList, RefreshCw, ChevronDown, Zap,
  Droplets, Flame, Wind, Package, AlertTriangle,
} from 'lucide-react'

type OrderStatus = 'open' | 'in_progress' | 'resolved' | 'deferred'
type OrderPriority = 'low' | 'normal' | 'high' | 'critical'

interface MaintenanceTask {
  id: string
  room_id: string
  room_number: string
  issue_type: string
  description: string | null
  status: OrderStatus
  priority: OrderPriority
  notes: string | null
  assigned_to: string | null
  assigned_name: string | null
  created_by: string | null
  created_by_name: string | null
  scheduled_date: string
  resolved_at: string | null
  estimated_cost: number | null
  created_at: string
}

interface StaffMember {
  id: string
  full_name: string
  role: string
}

interface Room {
  id: string
  room_number: string
  status: string
  room_type: string
}

const ISSUE_CATEGORIES = [
  { value: 'plumbing',     label: 'Plumbing',      icon: Droplets },
  { value: 'electrical',   label: 'Electrical',    icon: Zap },
  { value: 'hvac',         label: 'HVAC / AC',     icon: Wind },
  { value: 'amenity',      label: 'Amenity',       icon: Package },
  { value: 'furniture',    label: 'Furniture',     icon: Bed },
  { value: 'gas',          label: 'Gas / Heating', icon: Flame },
  { value: 'structural',   label: 'Structural',    icon: AlertTriangle },
  { value: 'general',      label: 'General Repair',icon: Wrench },
]

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; icon: any }> = {
  open:        { label: 'Open',        color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800 border-blue-200',       icon: RefreshCw },
  resolved:    { label: 'Resolved',    color: 'bg-green-100 text-green-800 border-green-200',    icon: CheckCircle2 },
  deferred:    { label: 'Deferred',    color: 'bg-gray-100 text-gray-600 border-gray-200',       icon: AlertCircle },
}

const PRIORITY_CONFIG: Record<OrderPriority, { label: string; color: string }> = {
  low:      { label: 'Low',      color: 'bg-gray-100 text-gray-600' },
  normal:   { label: 'Normal',   color: 'bg-blue-100 text-blue-700' },
  high:     { label: 'High',     color: 'bg-orange-100 text-orange-700' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700' },
}

const ROOM_STATUS_OPTIONS = [
  { value: 'available',    label: 'Available',    color: 'bg-green-100 text-green-800' },
  { value: 'occupied',     label: 'Occupied',     color: 'bg-blue-100 text-blue-800' },
  { value: 'cleaning',     label: 'Cleaning',     color: 'bg-yellow-100 text-yellow-800' },
  { value: 'maintenance',  label: 'Maintenance',  color: 'bg-red-100 text-red-800' },
  { value: 'reserved',     label: 'Reserved',     color: 'bg-purple-100 text-purple-800' },
  { value: 'out_of_order', label: 'Out of Order', color: 'bg-gray-200 text-gray-700' },
]

export default function MaintenancePage() {
  const { role, userId, organizationId, name: currentUserName } = useAuth()
  const canCreate = hasPermission(role, 'maintenance:create')
  const canAssign = hasPermission(role, 'maintenance:assign')
  const canReport = hasPermission(role, 'maintenance:report')

  const [tasks, setTasks] = useState<MaintenanceTask[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [filterSearch, setFilterSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterIssueType, setFilterIssueType] = useState<string>('all')

  // Modals
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [statusChangeRoom, setStatusChangeRoom] = useState<Room | null>(null)

  // New work order form
  const [orderForm, setOrderForm] = useState({
    room_id: '', issue_type: 'general', priority: 'normal' as OrderPriority,
    description: '', notes: '', assigned_to: '',
    scheduled_date: format(new Date(), 'yyyy-MM-dd'),
    estimated_cost: '',
  })
  const [saving, setSaving] = useState(false)

  // Daily report
  const [report, setReport] = useState({ summary: '', issues_resolved: '', parts_used: '', notes: '' })
  const [reportSaving, setReportSaving] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [organizationId])

  const fetchAll = async () => {
    if (!organizationId) return
    setLoading(true)
    const supabase = createClient()

    const [tasksRes, roomsRes, staffRes] = await Promise.all([
      supabase
        .from('maintenance_tasks')
        .select('*')
        .eq('organization_id', organizationId)
        .order('scheduled_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('rooms')
        .select('id, room_number, status, room_type')
        .eq('organization_id', organizationId)
        .order('room_number'),
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('organization_id', organizationId)
        .in('role', ['maintenance', 'admin', 'manager']),
    ])

    setTasks(tasksRes.data || [])
    setRooms(roomsRes.data || [])
    setStaff(staffRes.data || [])
    setLoading(false)
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false
      if (filterIssueType !== 'all' && t.issue_type !== filterIssueType) return false
      if (filterDate && t.scheduled_date !== filterDate) return false
      if (filterSearch) {
        const q = filterSearch.toLowerCase()
        if (!t.room_number?.toLowerCase().includes(q) && !t.issue_type?.toLowerCase().includes(q) && !t.assigned_name?.toLowerCase().includes(q) && !t.description?.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [tasks, filterStatus, filterDate, filterSearch, filterPriority, filterIssueType])

  const stats = useMemo(() => {
    const today = tasks.filter(t => t.scheduled_date === filterDate)
    return {
      total: today.length,
      open: today.filter(t => t.status === 'open').length,
      in_progress: today.filter(t => t.status === 'in_progress').length,
      resolved: today.filter(t => t.status === 'resolved').length,
      critical: tasks.filter(t => t.priority === 'critical' && t.status !== 'resolved').length,
    }
  }, [tasks, filterDate])

  const handleCreateOrder = async () => {
    if (!orderForm.room_id) return toast.error('Please select a room')
    if (!orderForm.description.trim()) return toast.error('Please describe the issue')
    setSaving(true)
    try {
      const supabase = createClient()
      const room = rooms.find(r => r.id === orderForm.room_id)
      const assignedStaff = staff.find(s => s.id === orderForm.assigned_to)
      const { error } = await supabase.from('maintenance_tasks').insert([{
        organization_id: organizationId,
        room_id: orderForm.room_id,
        room_number: room?.room_number,
        issue_type: orderForm.issue_type,
        description: orderForm.description,
        priority: orderForm.priority,
        notes: orderForm.notes || null,
        assigned_to: orderForm.assigned_to || null,
        assigned_name: assignedStaff?.full_name || null,
        created_by: userId,
        created_by_name: currentUserName,
        scheduled_date: orderForm.scheduled_date,
        estimated_cost: orderForm.estimated_cost ? parseFloat(orderForm.estimated_cost) : null,
        status: 'open',
      }])
      if (error) throw error

      // Auto-set room to 'maintenance' status if critical or high priority
      if (['critical', 'high'].includes(orderForm.priority)) {
        await supabase.from('rooms').update({ status: 'maintenance' }).eq('id', orderForm.room_id)
        setRooms(prev => prev.map(r => r.id === orderForm.room_id ? { ...r, status: 'maintenance' } : r))
      }

      toast.success('Work order created')
      setNewOrderOpen(false)
      setOrderForm({ room_id: '', issue_type: 'general', priority: 'normal', description: '', notes: '', assigned_to: '', scheduled_date: format(new Date(), 'yyyy-MM-dd'), estimated_cost: '' })
      fetchAll()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateStatus = async (taskId: string, newStatus: OrderStatus) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('maintenance_tasks')
      .update({ status: newStatus, resolved_at: newStatus === 'resolved' ? new Date().toISOString() : null })
      .eq('id', taskId)
    if (error) return toast.error(error.message)
    toast.success('Status updated')
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t))
  }

  const handleRoomStatusChange = async (roomId: string, newStatus: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('rooms').update({ status: newStatus }).eq('id', roomId)
    if (error) return toast.error(error.message)
    toast.success('Room status updated')
    setRooms(prev => prev.map(r => r.id === roomId ? { ...r, status: newStatus } : r))
    setStatusChangeRoom(null)
  }

  const handleSubmitReport = async () => {
    if (!report.summary.trim()) return toast.error('Please add a summary')
    setReportSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('maintenance_reports').insert([{
        organization_id: organizationId,
        submitted_by: userId,
        submitted_by_name: currentUserName,
        report_date: filterDate,
        summary: report.summary,
        issues_resolved: report.issues_resolved || null,
        parts_used: report.parts_used || null,
        notes: report.notes || null,
      }])
      if (error) throw error
      toast.success('Maintenance report submitted')
      setReport({ summary: '', issues_resolved: '', parts_used: '', notes: '' })
      setReportOpen(false)
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setReportSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="h-7 w-7 text-orange-500" />
            Maintenance
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage work orders, room repairs and maintenance reports</p>
        </div>
        <div className="flex items-center gap-2">
          {canReport && (
            <Button variant="outline" onClick={() => setReportOpen(true)}>
              <ClipboardList className="mr-2 h-4 w-4" />
              Daily Report
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setNewOrderOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Work Order
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Today Total', value: stats.total,       color: 'text-foreground' },
          { label: 'Open',        value: stats.open,        color: 'text-yellow-600' },
          { label: 'In Progress', value: stats.in_progress, color: 'text-blue-600' },
          { label: 'Resolved',    value: stats.resolved,    color: 'text-green-600' },
          { label: 'Critical',    value: stats.critical,    color: 'text-red-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">Work Orders</TabsTrigger>
          <TabsTrigger value="rooms">Room Status</TabsTrigger>
        </TabsList>

        {/* Work Orders Tab */}
        <TabsContent value="orders" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search room, issue, assignee..." className="pl-9 h-9" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date</label>
              <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="h-9 text-sm" />
            </div>
            <Select value={filterIssueType} onValueChange={setFilterIssueType}>
              <SelectTrigger className="h-9 text-sm w-36"><SelectValue placeholder="Issue Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {ISSUE_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-sm w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {(Object.keys(STATUS_CONFIG) as OrderStatus[]).map(s => (
                  <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="h-9 text-sm w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {(Object.keys(PRIORITY_CONFIG) as OrderPriority[]).map(p => (
                  <SelectItem key={p} value={p}>{PRIORITY_CONFIG[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(filterStatus !== 'all' || filterPriority !== 'all' || filterSearch || filterIssueType !== 'all') && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setFilterSearch(''); setFilterIssueType('all') }}>
                Clear
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {filteredTasks.length} of {tasks.length} work orders
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Loading work orders...
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Wrench className="h-8 w-8 opacity-30" />
              <p className="text-sm">No work orders found for the selected filters</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTasks.map(task => {
                const sc = STATUS_CONFIG[task.status]
                const pc = PRIORITY_CONFIG[task.priority]
                const StatusIcon = sc.icon
                const issueCategory = ISSUE_CATEGORIES.find(c => c.value === task.issue_type)
                const IssueIcon = issueCategory?.icon ?? Wrench
                return (
                  <Card key={task.id} className="relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-1 h-full ${task.priority === 'critical' ? 'bg-red-500' : task.priority === 'high' ? 'bg-orange-400' : task.priority === 'normal' ? 'bg-blue-400' : 'bg-gray-300'}`} />
                    <CardContent className="pt-4 pb-4 pl-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm">Room {task.room_number}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <IssueIcon className="h-3 w-3 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground">{issueCategory?.label ?? task.issue_type}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={`text-xs ${sc.color}`}>
                            <StatusIcon className="mr-1 h-3 w-3" />{sc.label}
                          </Badge>
                          <Badge variant="secondary" className={`text-xs ${pc.color}`}>{pc.label}</Badge>
                        </div>
                      </div>

                      {task.description && (
                        <p className="text-xs text-foreground/80 line-clamp-2">{task.description}</p>
                      )}

                      {task.assigned_name && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <User className="h-3 w-3" /> {task.assigned_name}
                        </div>
                      )}

                      {task.estimated_cost && (
                        <p className="text-xs text-muted-foreground">Est. cost: ₦{task.estimated_cost.toLocaleString()}</p>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />{format(parseISO(task.scheduled_date), 'dd MMM')}
                        </span>
                        <Select
                          value={task.status}
                          onValueChange={(v) => handleUpdateStatus(task.id, v as OrderStatus)}
                        >
                          <SelectTrigger className="h-7 text-xs w-32 pr-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_CONFIG) as OrderStatus[]).map(s => (
                              <SelectItem key={s} value={s} className="text-xs">{STATUS_CONFIG[s].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* Room Status Panel */}
        <TabsContent value="rooms" className="space-y-4">
          <p className="text-sm text-muted-foreground">Click any room status badge to quickly update it.</p>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {rooms.map(room => {
              const sc = ROOM_STATUS_OPTIONS.find(o => o.value === room.status)
              return (
                <Card key={room.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">Room {room.room_number}</p>
                        <p className="text-xs text-muted-foreground">{room.room_type}</p>
                      </div>
                      <Bed className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <button
                      onClick={() => setStatusChangeRoom(room)}
                      className={`w-full rounded-md px-3 py-1.5 text-xs font-medium flex items-center justify-between ${sc?.color ?? 'bg-gray-100 text-gray-600'} hover:opacity-80 transition-opacity`}
                    >
                      <span>{sc?.label ?? room.status}</span>
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* New Work Order Modal */}
      <Dialog open={newOrderOpen} onOpenChange={setNewOrderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Room</Label>
              <Select value={orderForm.room_id} onValueChange={v => setOrderForm(f => ({ ...f, room_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                <SelectContent>
                  {rooms.map(r => <SelectItem key={r.id} value={r.id}>Room {r.room_number} — {r.status}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Issue Type</Label>
                <Select value={orderForm.issue_type} onValueChange={v => setOrderForm(f => ({ ...f, issue_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ISSUE_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={orderForm.priority} onValueChange={v => setOrderForm(f => ({ ...f, priority: v as OrderPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_CONFIG) as OrderPriority[]).map(p => (
                      <SelectItem key={p} value={p}>{PRIORITY_CONFIG[p].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description of Issue</Label>
              <Textarea placeholder="Describe the problem in detail..." value={orderForm.description} onChange={e => setOrderForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Scheduled Date</Label>
                <Input type="date" value={orderForm.scheduled_date} onChange={e => setOrderForm(f => ({ ...f, scheduled_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Est. Cost (₦)</Label>
                <Input type="number" min="0" placeholder="0.00" value={orderForm.estimated_cost} onChange={e => setOrderForm(f => ({ ...f, estimated_cost: e.target.value }))} />
              </div>
            </div>
            {canAssign && (
              <div className="space-y-2">
                <Label>Assign To</Label>
                <Select value={orderForm.assigned_to} onValueChange={v => setOrderForm(f => ({ ...f, assigned_to: v }))}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {staff.map(s => <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.role})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Additional Notes</Label>
              <Textarea placeholder="Parts needed, access requirements..." value={orderForm.notes} onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            {['critical', 'high'].includes(orderForm.priority) && orderForm.room_id && (
              <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-2">
                Room will be automatically set to "Maintenance" status due to {orderForm.priority} priority.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOrderOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateOrder} disabled={saving}>{saving ? 'Saving...' : 'Create Work Order'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Room Status Quick-Change Modal */}
      {statusChangeRoom && (
        <Dialog open={!!statusChangeRoom} onOpenChange={() => setStatusChangeRoom(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Update Room {statusChangeRoom.room_number} Status</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-2">
              {ROOM_STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleRoomStatusChange(statusChangeRoom.id, opt.value)}
                  className={`rounded-lg px-4 py-3 text-sm font-medium text-left transition-all hover:scale-105 active:scale-95 ${opt.color} ${statusChangeRoom.status === opt.value ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                >
                  {opt.label}
                  {statusChangeRoom.status === opt.value && (
                    <span className="block text-xs font-normal opacity-70 mt-0.5">Current</span>
                  )}
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Daily Report Modal */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Maintenance Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Report Date</Label>
              <Input type="date" value={filterDate} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Summary of Work Done</Label>
              <Textarea placeholder="Describe maintenance activities today..." value={report.summary} onChange={e => setReport(r => ({ ...r, summary: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Issues Resolved</Label>
              <Textarea placeholder="List rooms and issues resolved..." value={report.issues_resolved} onChange={e => setReport(r => ({ ...r, issues_resolved: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Parts / Materials Used</Label>
              <Input placeholder="e.g. 2x faucet washers, 1x circuit breaker" value={report.parts_used} onChange={e => setReport(r => ({ ...r, parts_used: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Pending / Follow-up Notes</Label>
              <Textarea placeholder="Items that need follow-up..." value={report.notes} onChange={e => setReport(r => ({ ...r, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitReport} disabled={reportSaving}>{reportSaving ? 'Submitting...' : 'Submit Report'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
