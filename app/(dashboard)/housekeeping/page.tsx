'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { LoadingSpinner } from '@/components/loading-screen'
import { hasPermission } from '@/lib/permissions'
import { canUpdateHousekeepingRoomStatus } from '@/lib/rooms/housekeeping-status-auth'
import {
  HOUSEKEEPING_STATUS_OPTIONS,
  getHousekeepingStatusDef,
  housekeepingStatusLabel,
} from '@/lib/rooms/housekeeping-status'
import { housekeeperAllowedNextStatuses } from '@/lib/rooms/housekeeping-status-transitions'
import { formatHousekeepingStatusUpdated } from '@/lib/rooms/format-housekeeping-status-updated'
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
  Sparkles, Search, Filter, CheckCircle2, Clock, AlertCircle,
  User, Bed, CalendarDays, ClipboardList, RefreshCw, ChevronDown, Package,
} from 'lucide-react'
import { RoomInventoryStatsStrip } from '@/components/shared/room-inventory-stats-strip'
import { OutletStoreIssuesPanel } from '@/components/outlets/outlet-store-issues-panel'
import { RoomStatusRemarksPanel } from '@/components/rooms/room-status-remarks-panel'
import { HousekeepingStatusAttribution } from '@/components/rooms/housekeeping-status-attribution'
import { reconcileRoomStatusesClient } from '@/lib/rooms/reconcile-room-status-client'
import {
  fetchRoomStatusRemarksClient,
  patchHousekeepingStatus,
} from '@/lib/rooms/update-room-status-client'
import type { RoomStatusRemark } from '@/lib/rooms/room-status-remarks'

type TaskStatus = 'pending' | 'in_progress' | 'done' | 'skipped'
type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

interface HousekeepingTask {
  id: string
  room_id: string
  room_number: string
  task_type: string
  status: TaskStatus
  priority: TaskPriority
  notes: string | null
  assigned_to: string | null
  assigned_name: string | null
  created_by: string | null
  created_by_name: string | null
  scheduled_date: string
  completed_at: string | null
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
  housekeeping_status: string | null
  housekeeping_status_updated_at: string | null
  housekeeping_status_updated_by_name: string | null
  room_type: string
}

function isMissingTableError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('schema cache') || m.includes('does not exist') || m.includes('could not find the table')
}

const TASK_TYPES = [
  'Full Clean', 'Turndown', 'Linen Change', 'Deep Clean',
  'Inspection', 'Departure Clean', 'Mid-Stay Clean', 'Touch-Up',
]

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; icon: any }> = {
  pending:     { label: 'Pending',     color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock },
  in_progress: { label: 'In Progress', color: 'bg-blue-100 text-blue-800 border-blue-200',       icon: RefreshCw },
  done:        { label: 'Done',        color: 'bg-green-100 text-green-800 border-green-200',     icon: CheckCircle2 },
  skipped:     { label: 'Skipped',     color: 'bg-gray-100 text-gray-600 border-gray-200',        icon: AlertCircle },
}

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string }> = {
  low:    { label: 'Low',    color: 'bg-gray-100 text-gray-600' },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-700' },
  high:   { label: 'High',   color: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700' },
}

export default function HousekeepingPage() {
  const { role, userId, organizationId, name: currentUserName } = useAuth()
  const canCreate = hasPermission(role, 'housekeeping:create')
  const canAssign = hasPermission(role, 'housekeeping:assign')
  const canReport = hasPermission(role, 'housekeeping:report')
  const canEditHousekeepingStatus = canUpdateHousekeepingRoomStatus(role)

  const [tasks, setTasks] = useState<HousekeepingTask[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterDate, setFilterDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [filterSearch, setFilterSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<string>('all')

  // Modals
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [statusChangeRoom, setStatusChangeRoom] = useState<Room | null>(null)
  const [statusComment, setStatusComment] = useState('')
  const [pendingRoomStatus, setPendingRoomStatus] = useState<string | null>(null)
  const [roomStatusSaving, setRoomStatusSaving] = useState(false)
  const [statusRemarks, setStatusRemarks] = useState<RoomStatusRemark[]>([])
  const [statusRemarksLoading, setStatusRemarksLoading] = useState(false)
  const [taskStatusModal, setTaskStatusModal] = useState<{ task: HousekeepingTask; newStatus: TaskStatus } | null>(null)
  const [taskStatusRemark, setTaskStatusRemark] = useState('')
  const [taskStatusSaving, setTaskStatusSaving] = useState(false)

  // New task form
  const [taskForm, setTaskForm] = useState({
    room_id: '', task_type: 'Full Clean', priority: 'normal' as TaskPriority,
    notes: '', assigned_to: '', scheduled_date: format(new Date(), 'yyyy-MM-dd'),
  })
  const [saving, setSaving] = useState(false)

  // Daily report form
  const [report, setReport] = useState({ summary: '', issues: '', rooms_cleaned: '' })
  const [reportSaving, setReportSaving] = useState(false)

  useEffect(() => {
    fetchAll()
  }, [organizationId])

  const fetchAll = async () => {
    if (!organizationId) return
    setLoading(true)
    await reconcileRoomStatusesClient()
    const supabase = createClient()

    const [tasksRes, roomsRes, staffRes] = await Promise.all([
      supabase
        .from('housekeeping_tasks')
        .select('*')
        .eq('organization_id', organizationId)
        .order('scheduled_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('rooms')
        .select('id, room_number, status, housekeeping_status, housekeeping_status_updated_at, housekeeping_status_updated_by_name, room_type')
        .eq('organization_id', organizationId)
        .order('room_number'),
      supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('organization_id', organizationId)
        .in('role', ['housekeeper', 'admin', 'manager']),
    ])

    if (tasksRes.error) {
      if (!isMissingTableError(tasksRes.error.message)) {
        console.warn('[housekeeping] tasks load:', tasksRes.error.message)
      }
    }
    if (roomsRes.error) {
      toast.error(roomsRes.error.message)
    }

    setTasks(tasksRes.error ? [] : tasksRes.data || [])
    setRooms(roomsRes.data || [])
    setStaff(staffRes.data || [])
    setLoading(false)
  }

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filterStatus !== 'all' && t.status !== filterStatus) return false
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false
      if (filterDate && t.scheduled_date !== filterDate) return false
      if (filterSearch) {
        const q = filterSearch.toLowerCase()
        if (!t.room_number?.toLowerCase().includes(q) && !t.task_type?.toLowerCase().includes(q) && !t.assigned_name?.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [tasks, filterStatus, filterDate, filterSearch, filterPriority])

  const stats = useMemo(() => {
    const today = tasks.filter(t => t.scheduled_date === filterDate)
    return {
      total: today.length,
      pending: today.filter(t => t.status === 'pending').length,
      in_progress: today.filter(t => t.status === 'in_progress').length,
      done: today.filter(t => t.status === 'done').length,
    }
  }, [tasks, filterDate])

  const handleCreateTask = async () => {
    if (!taskForm.room_id) return toast.error('Please select a room')
    setSaving(true)
    try {
      const supabase = createClient()
      const room = rooms.find(r => r.id === taskForm.room_id)
      const assignedStaff = staff.find(s => s.id === taskForm.assigned_to)
      const { error } = await supabase.from('housekeeping_tasks').insert([{
        organization_id: organizationId,
        room_id: taskForm.room_id,
        room_number: room?.room_number,
        task_type: taskForm.task_type,
        priority: taskForm.priority,
        notes: taskForm.notes || null,
        assigned_to: taskForm.assigned_to || null,
        assigned_name: assignedStaff?.full_name || null,
        created_by: userId,
        created_by_name: currentUserName,
        scheduled_date: taskForm.scheduled_date,
        status: 'pending',
      }])
      if (error) {
        if (isMissingTableError(error.message)) {
          throw new Error(
            'Housekeeping tasks table is not set up. Ask your administrator to run scripts/078_housekeeping_tables_and_room_status.sql in Supabase.',
          )
        }
        throw error
      }
      toast.success('Task created')
      setNewTaskOpen(false)
      setTaskForm({ room_id: '', task_type: 'Full Clean', priority: 'normal', notes: '', assigned_to: '', scheduled_date: format(new Date(), 'yyyy-MM-dd') })
      fetchAll()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmTaskStatus = async () => {
    if (!taskStatusModal) return
    const { task, newStatus } = taskStatusModal
    const remark = taskStatusRemark.trim()
    setTaskStatusSaving(true)
    try {
      const supabase = createClient()
      const patch: { status: TaskStatus; completed_at: string | null; notes?: string } = {
        status: newStatus,
        completed_at: newStatus === 'done' ? new Date().toISOString() : null,
      }
      if (remark) {
        const prefix = `[${STATUS_CONFIG[newStatus].label}]`
        patch.notes = task.notes ? `${task.notes}\n${prefix} ${remark}` : `${prefix} ${remark}`
      }
      const { error } = await supabase.from('housekeeping_tasks').update(patch).eq('id', task.id)
      if (error) {
        if (isMissingTableError(error.message)) {
          throw new Error(
            'Housekeeping tasks table is not set up. Ask your administrator to run scripts/078_housekeeping_tables_and_room_status.sql in Supabase.',
          )
        }
        throw error
      }
      toast.success(remark ? 'Status and remark saved' : 'Status updated')
      setTasks(prev =>
        prev.map(t =>
          t.id === task.id
            ? { ...t, status: newStatus, notes: patch.notes ?? t.notes, completed_at: patch.completed_at }
            : t,
        ),
      )
      setTaskStatusModal(null)
      setTaskStatusRemark('')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not update task')
    } finally {
      setTaskStatusSaving(false)
    }
  }

  const openRoomStatusModal = (room: Room) => {
    setStatusChangeRoom(room)
    setPendingRoomStatus(null)
    setStatusComment('')
    setStatusRemarks([])
    setStatusRemarksLoading(true)
    void fetchRoomStatusRemarksClient(room.id)
      .then(setStatusRemarks)
      .catch(() => setStatusRemarks([]))
      .finally(() => setStatusRemarksLoading(false))
  }

  const allowedRoomStatusTargets = useMemo(() => {
    if (!statusChangeRoom) return []
    const keys = housekeeperAllowedNextStatuses(statusChangeRoom.housekeeping_status)
    return HOUSEKEEPING_STATUS_OPTIONS.filter((opt) => keys.includes(opt.key))
  }, [statusChangeRoom])

  const closeRoomStatusModal = () => {
    setStatusChangeRoom(null)
    setPendingRoomStatus(null)
    setStatusComment('')
    setStatusRemarks([])
    setStatusRemarksLoading(false)
  }

  const handleConfirmRoomStatusChange = async () => {
    if (!statusChangeRoom || !pendingRoomStatus) {
      toast.error('Select the next room status')
      return
    }
    if (pendingRoomStatus === statusChangeRoom.housekeeping_status) {
      toast.error('Choose a different status from the current one')
      return
    }
    const allowed = housekeeperAllowedNextStatuses(statusChangeRoom.housekeeping_status)
    if (!allowed.includes(pendingRoomStatus as (typeof allowed)[number])) {
      toast.error('That status change is not allowed for housekeeping')
      return
    }
    if (!canEditHousekeepingStatus) {
      toast.error('Only Housekeeping staff can change room status.')
      return
    }
    if (!organizationId) {
      toast.error('Organization not loaded')
      return
    }

    setRoomStatusSaving(true)
    try {
      const room = statusChangeRoom
      const remark = statusComment.trim()
      const result = await patchHousekeepingStatus({
        room_id: room.id,
        room_number: room.room_number,
        housekeeping_status: pendingRoomStatus,
        remark: remark || undefined,
        scheduled_date: filterDate,
      })
      if (!result.ok) throw new Error(result.message)

      toast.success(
        remark
          ? `Room status saved · ${formatHousekeepingStatusUpdated({
              updatedAt: result.housekeeping_status_updated_at,
              updatedByName: result.housekeeping_status_updated_by_name ?? currentUserName,
            })}`
          : formatHousekeepingStatusUpdated({
              updatedAt: result.housekeeping_status_updated_at,
              updatedByName: result.housekeeping_status_updated_by_name ?? currentUserName,
            }) ?? 'Room status updated',
      )
      setRooms((prev) =>
        prev.map((r) =>
          r.id === room.id
            ? {
                ...r,
                housekeeping_status: result.housekeeping_status,
                housekeeping_status_updated_at:
                  result.housekeeping_status_updated_at ?? new Date().toISOString(),
                housekeeping_status_updated_by_name:
                  result.housekeeping_status_updated_by_name ?? currentUserName ?? null,
              }
            : r,
        ),
      )
      await fetchAll()
      closeRoomStatusModal()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not update room status')
    } finally {
      setRoomStatusSaving(false)
    }
  }

  const handleSubmitReport = async () => {
    if (!report.summary.trim()) return toast.error('Please add a summary')
    setReportSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('housekeeping_reports').insert([{
        organization_id: organizationId,
        submitted_by: userId,
        submitted_by_name: currentUserName,
        report_date: filterDate,
        summary: report.summary,
        issues: report.issues || null,
        rooms_cleaned: report.rooms_cleaned ? parseInt(report.rooms_cleaned) : null,
      }])
      if (error) {
        if (isMissingTableError(error.message)) {
          throw new Error(
            'Housekeeping tasks table is not set up. Ask your administrator to run scripts/078_housekeeping_tables_and_room_status.sql in Supabase.',
          )
        }
        throw error
      }
      toast.success('Daily report submitted')
      setReport({ summary: '', issues: '', rooms_cleaned: '' })
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
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2 min-w-0">
            <Sparkles className="h-7 w-7 shrink-0 text-teal-500" />
            Housekeeping
          </h1>
          <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
            <RoomInventoryStatsStrip />
            {canReport && (
              <Button variant="outline" onClick={() => setReportOpen(true)}>
                <ClipboardList className="mr-2 h-4 w-4" />
                Daily Report
              </Button>
            )}
          </div>
        </div>
        <p className="text-muted-foreground text-sm">Manage cleaning tasks, room status and daily reports</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Today', value: stats.total, color: 'text-foreground' },
          { label: 'Pending',     value: stats.pending,     color: 'text-yellow-600' },
          { label: 'In Progress', value: stats.in_progress, color: 'text-blue-600' },
          { label: 'Done',        value: stats.done,        color: 'text-green-600' },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Task Board</TabsTrigger>
          <TabsTrigger value="rooms">Room Status</TabsTrigger>
          <TabsTrigger value="from_store" className="gap-1.5">
            <Package className="h-3.5 w-3.5" />
            Items from Store
          </TabsTrigger>
        </TabsList>

        {/* Task Board */}
        <TabsContent value="tasks" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input placeholder="Search room, task, assignee..." className="pl-9 h-9" value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date</label>
              <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="h-9 text-sm" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-sm w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => (
                  <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="h-9 text-sm w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map(p => (
                  <SelectItem key={p} value={p}>{PRIORITY_CONFIG[p].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(filterStatus !== 'all' || filterPriority !== 'all' || filterSearch) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setFilterSearch('') }}>
                Clear
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {filteredTasks.length} of {tasks.length} tasks
          </p>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3" role="status" aria-label="Loading">
              <LoadingSpinner size="lg" />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Sparkles className="h-8 w-8 opacity-30" />
              <p className="text-sm">No tasks found for the selected filters</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTasks.map(task => {
                const sc = STATUS_CONFIG[task.status]
                const pc = PRIORITY_CONFIG[task.priority]
                const StatusIcon = sc.icon
                return (
                  <Card key={task.id} className="relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-1 h-full ${task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-orange-400' : task.priority === 'normal' ? 'bg-blue-400' : 'bg-gray-300'}`} />
                    <CardContent className="pt-4 pb-4 pl-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-sm">Room {task.room_number}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{task.task_type}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant="outline" className={`text-xs ${sc.color}`}>
                            <StatusIcon className="mr-1 h-3 w-3" />{sc.label}
                          </Badge>
                          <Badge variant="secondary" className={`text-xs ${pc.color}`}>{pc.label}</Badge>
                        </div>
                      </div>

                      {task.assigned_name && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <User className="h-3 w-3" /> {task.assigned_name}
                        </div>
                      )}

                      {task.notes && <p className="text-xs text-muted-foreground line-clamp-2">{task.notes}</p>}

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />{format(parseISO(task.scheduled_date), 'dd MMM')}
                        </span>
                        <Select
                          value={task.status}
                          onValueChange={(v) => {
                            const next = v as TaskStatus
                            if (next === task.status) return
                            setTaskStatusRemark('')
                            setTaskStatusModal({ task, newStatus: next })
                          }}
                        >
                          <SelectTrigger className="h-7 text-xs w-32 pr-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => (
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
          <p className="text-sm text-muted-foreground">
            Housekeeping floor statuses are visible to all staff with room access. Only Housekeepers
            can change them here — abbreviations: OOO, O, V, Compl, L/in, R/s, C/O, S/O.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {rooms.map(room => {
              const hk = getHousekeepingStatusDef(room.housekeeping_status)
              const displayLabel = hk
                ? `${hk.label} (${hk.abbr})`
                : room.housekeeping_status
                  ? housekeepingStatusLabel(room.housekeeping_status)
                  : 'Not set'
              const displayColor = hk?.color ?? 'bg-muted text-muted-foreground border-border'
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
                    {canEditHousekeepingStatus ? (
                      <button
                        type="button"
                        onClick={() => openRoomStatusModal(room)}
                        className={`w-full rounded-md px-3 py-1.5 text-xs font-medium flex items-center justify-between ${displayColor} hover:opacity-80 transition-opacity`}
                      >
                        <span>{displayLabel}</span>
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    ) : (
                      <div
                        className={`w-full rounded-md px-3 py-1.5 text-xs font-medium flex items-center justify-between ${displayColor}`}
                      >
                        <span>{displayLabel}</span>
                      </div>
                    )}
                    {room.housekeeping_status ? (
                      <HousekeepingStatusAttribution
                        updatedAt={room.housekeeping_status_updated_at}
                        updatedByName={room.housekeeping_status_updated_by_name}
                      />
                    ) : null}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="from_store" className="space-y-4">
          <OutletStoreIssuesPanel destination="housekeeping" />
        </TabsContent>
      </Tabs>

      {/* New Task Modal */}
      <Dialog open={newTaskOpen} onOpenChange={setNewTaskOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Housekeeping Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Room</Label>
              <Select value={taskForm.room_id} onValueChange={v => setTaskForm(f => ({ ...f, room_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                <SelectContent>
                  {rooms.map(r => (
                    <SelectItem key={r.id} value={r.id}>Room {r.room_number} — {r.status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Task Type</Label>
                <Select value={taskForm.task_type} onValueChange={v => setTaskForm(f => ({ ...f, task_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={taskForm.priority} onValueChange={v => setTaskForm(f => ({ ...f, priority: v as TaskPriority }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_CONFIG) as TaskPriority[]).map(p => (
                      <SelectItem key={p} value={p}>{PRIORITY_CONFIG[p].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Scheduled Date</Label>
              <Input type="date" value={taskForm.scheduled_date} onChange={e => setTaskForm(f => ({ ...f, scheduled_date: e.target.value }))} />
            </div>
            {canAssign && (
              <div className="space-y-2">
                <Label>Assign To</Label>
                <Select value={taskForm.assigned_to} onValueChange={v => setTaskForm(f => ({ ...f, assigned_to: v }))}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {staff.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name} ({s.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea placeholder="Special instructions..." value={taskForm.notes} onChange={e => setTaskForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTaskOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateTask} disabled={saving}>{saving ? 'Saving...' : 'Create Task'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Task status + remark */}
      <Dialog
        open={!!taskStatusModal}
        onOpenChange={(open) => {
          if (!open) {
            setTaskStatusModal(null)
            setTaskStatusRemark('')
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {taskStatusModal
                ? `Update task — Room ${taskStatusModal.task.room_number}`
                : 'Update task'}
            </DialogTitle>
          </DialogHeader>
          {taskStatusModal && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {taskStatusModal.task.task_type} →{' '}
                <span className="font-medium text-foreground">
                  {STATUS_CONFIG[taskStatusModal.newStatus].label}
                </span>
              </p>
              <div className="space-y-2">
                <Label>Remark / comment</Label>
                <Textarea
                  placeholder="Optional note for this status change…"
                  value={taskStatusRemark}
                  onChange={(e) => setTaskStatusRemark(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTaskStatusModal(null)
                setTaskStatusRemark('')
              }}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleConfirmTaskStatus()} disabled={taskStatusSaving}>
              {taskStatusSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Room status + remark */}
      <Dialog open={!!statusChangeRoom} onOpenChange={(open) => !open && closeRoomStatusModal()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {statusChangeRoom ? `Update Room ${statusChangeRoom.room_number} Status` : 'Update room'}
            </DialogTitle>
          </DialogHeader>
          {statusChangeRoom && (
            <div className="space-y-4">
              {statusChangeRoom.housekeeping_status ? (
                <HousekeepingStatusAttribution
                  updatedAt={statusChangeRoom.housekeeping_status_updated_at}
                  updatedByName={statusChangeRoom.housekeeping_status_updated_by_name}
                  className="text-xs"
                />
              ) : null}
              <RoomStatusRemarksPanel remarks={statusRemarks} loading={statusRemarksLoading} />
              {statusChangeRoom.housekeeping_status ? (
                <p className="text-xs text-muted-foreground">
                  Current:{' '}
                  <span className="font-medium">
                    {housekeepingStatusLabel(statusChangeRoom.housekeeping_status)}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No housekeeping status yet — wait for front desk checkout.
                </p>
              )}
              {allowedRoomStatusTargets.length === 0 ? (
                <p className="text-sm text-muted-foreground rounded-md border border-dashed p-3">
                  No status changes available. Occupied, reservation, and other front-desk
                  statuses are updated by the system after checkout or check-in.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {allowedRoomStatusTargets.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setPendingRoomStatus(opt.key)}
                      className={`rounded-lg px-3 py-2.5 text-xs font-medium text-left transition-all hover:scale-[1.02] active:scale-95 ${opt.color} ${pendingRoomStatus === opt.key ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                      title={opt.description}
                    >
                      <span className="block">{opt.label}</span>
                      <span className="block text-[10px] font-normal opacity-80">{opt.abbr}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <Label>Remark / comment</Label>
                <Textarea
                  placeholder="Add note for this room status change…"
                  value={statusComment}
                  onChange={(e) => setStatusComment(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">
                  Saved on the task board as a housekeeping log entry.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeRoomStatusModal} disabled={roomStatusSaving}>
              Cancel
            </Button>
            <Button onClick={() => void handleConfirmRoomStatusChange()} disabled={roomStatusSaving || !pendingRoomStatus || allowedRoomStatusTargets.length === 0}>
              {roomStatusSaving ? 'Saving…' : 'Update status'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Daily Report Modal */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Daily Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Report Date</Label>
              <Input type="date" value={filterDate} readOnly className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Rooms Cleaned</Label>
              <Input type="number" min="0" placeholder="e.g. 12" value={report.rooms_cleaned} onChange={e => setReport(r => ({ ...r, rooms_cleaned: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Summary</Label>
              <Textarea placeholder="Describe today's housekeeping activities..." value={report.summary} onChange={e => setReport(r => ({ ...r, summary: e.target.value }))} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Issues / Notes</Label>
              <Textarea placeholder="Any issues, damaged items, or follow-ups..." value={report.issues} onChange={e => setReport(r => ({ ...r, issues: e.target.value }))} rows={2} />
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
