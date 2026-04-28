'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bell, Menu, LogOut, User as UserIcon, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { formatNaira } from '@/lib/utils/currency'
import { addDays, formatDistanceToNow, setHours, setMinutes } from 'date-fns'

interface DashboardUser {
  id: string
  email: string
  name: string
  role: string
}

interface HeaderProps {
  user: DashboardUser
  onMenuClick?: () => void
}

interface Notification {
  id: string
  description: string
  amount: number
  created_at: string
  read: boolean
  booking_id: string | null
  guest_id: string | null
  folio_id: string | null
  type?: 'transaction' | 'reservation' | 'checkout' | 'overdue_checkout' | 'balance' | 'room'
  actionLabel?: string
}

export function Header({ user, onMenuClick }: HeaderProps) {
  const [loggingOut, setLoggingOut] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [notifOpen, setNotifOpen] = useState(false)
  const router = useRouter()
  const { organizationId } = useAuth()
  const notificationStorageKey = `frontbill-read-notifications-${organizationId || user.id}`

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(notificationStorageKey)
      if (saved) setReadIds(new Set(JSON.parse(saved)))
    } catch {
      setReadIds(new Set())
    }
  }, [notificationStorageKey])

  const persistReadIds = (ids: Set<string>) => {
    try {
      window.localStorage.setItem(notificationStorageKey, JSON.stringify(Array.from(ids)))
    } catch {
      // Ignore storage failures; notifications still work for this session.
    }
  }

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient()
    if (!supabase || !organizationId) return

    try {
      const now = new Date()
      const toLocalDateStr = (date: Date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }
      const today = toLocalDateStr(now)
      const tomorrow = toLocalDateStr(addDays(now, 1))
      const checkoutReminderTime = setMinutes(setHours(now, 11), 30)
      const checkinReminderTime = setMinutes(setHours(now, 9), 0)
      const eveningReminderTime = setMinutes(setHours(now, 21), 0)

      const [transactionsRes, checkinsRes, tomorrowCheckinsRes, checkoutsRes, tomorrowCheckoutsRes, overdueRes, balancesRes, roomsRes] = await Promise.all([
        supabase
        .from('transactions')
        .select('id, description, amount, created_at, booking_id, guest_id, folio_id')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(8),
        supabase
          .from('bookings')
          .select('id, folio_id, check_in, check_out, balance, status, guests:guest_id(id, name), rooms:room_id(room_number)')
          .eq('organization_id', organizationId)
          .eq('status', 'reserved')
          .eq('check_in', today),
        supabase
          .from('bookings')
          .select('id, folio_id, check_in, check_out, balance, status, guests:guest_id(id, name), rooms:room_id(room_number)')
          .eq('organization_id', organizationId)
          .eq('status', 'reserved')
          .eq('check_in', tomorrow),
        supabase
          .from('bookings')
          .select('id, folio_id, check_in, check_out, balance, status, guests:guest_id(id, name), rooms:room_id(room_number)')
          .eq('organization_id', organizationId)
          .in('status', ['confirmed', 'checked_in'])
          .eq('check_out', today),
        supabase
          .from('bookings')
          .select('id, folio_id, check_in, check_out, balance, status, guests:guest_id(id, name), rooms:room_id(room_number)')
          .eq('organization_id', organizationId)
          .in('status', ['confirmed', 'checked_in'])
          .eq('check_out', tomorrow),
        supabase
          .from('bookings')
          .select('id, folio_id, check_in, check_out, balance, status, guests:guest_id(id, name), rooms:room_id(room_number)')
          .eq('organization_id', organizationId)
          .in('status', ['confirmed', 'checked_in'])
          .lt('check_out', today),
        supabase
          .from('bookings')
          .select('id, folio_id, check_in, check_out, balance, status, guests:guest_id(id, name), rooms:room_id(room_number)')
          .eq('organization_id', organizationId)
          .gt('balance', 0)
          .in('status', ['confirmed', 'checked_in', 'reserved']),
        supabase
          .from('rooms')
          .select('id, room_number, status, updated_at')
          .eq('organization_id', organizationId)
          .in('status', ['cleaning', 'maintenance']),
      ])

      const getGuestName = (booking: any) => Array.isArray(booking.guests) ? booking.guests[0]?.name : booking.guests?.name
      const getGuestId = (booking: any) => Array.isArray(booking.guests) ? booking.guests[0]?.id : booking.guests?.id
      const getRoomNumber = (booking: any) => Array.isArray(booking.rooms) ? booking.rooms[0]?.room_number : booking.rooms?.room_number

      const transactionNotifications: Notification[] = (transactionsRes.data || []).map((t: any) => ({
        id: `transaction-${t.id}`,
        description: t.description || 'Transaction recorded',
        amount: Number(t.amount || 0),
        created_at: t.created_at,
        booking_id: t.booking_id ?? null,
        guest_id: t.guest_id ?? null,
        folio_id: t.folio_id ?? null,
        read: readIds.has(`transaction-${t.id}`),
        type: 'transaction',
        actionLabel: t.booking_id ? 'View booking' : 'View transactions',
      }))

      const checkinNotifications: Notification[] = now >= checkinReminderTime
        ? (checkinsRes.data || []).map((b: any) => ({
            id: `checkin-${b.id}`,
            description: `${getGuestName(b) || 'Guest'} is due to check in today at 1pm${getRoomNumber(b) ? ` - Room ${getRoomNumber(b)}` : ''}`,
            amount: Number(b.balance || 0),
            created_at: `${today}T09:00:00`,
            booking_id: b.id,
            guest_id: getGuestId(b) ?? null,
            folio_id: b.folio_id ?? null,
            read: readIds.has(`checkin-${b.id}`),
            type: 'reservation',
            actionLabel: 'View reservation',
          }))
        : []

      const tomorrowCheckinNotifications: Notification[] = now >= eveningReminderTime
        ? (tomorrowCheckinsRes.data || []).map((b: any) => ({
            id: `checkin-tomorrow-${b.id}`,
            description: `${getGuestName(b) || 'Guest'} is due to check in tomorrow at 1pm${getRoomNumber(b) ? ` - Room ${getRoomNumber(b)}` : ''}`,
            amount: Number(b.balance || 0),
            created_at: `${today}T21:00:00`,
            booking_id: b.id,
            guest_id: getGuestId(b) ?? null,
            folio_id: b.folio_id ?? null,
            read: readIds.has(`checkin-tomorrow-${b.id}`),
            type: 'reservation',
            actionLabel: 'View reservation',
          }))
        : []

      const checkoutNotifications: Notification[] = now >= checkoutReminderTime
        ? (checkoutsRes.data || []).map((b: any) => ({
            id: `checkout-${b.id}`,
            description: `${getGuestName(b) || 'Guest'} checkout is due by 12pm today${getRoomNumber(b) ? ` - Room ${getRoomNumber(b)}` : ''}`,
            amount: Number(b.balance || 0),
            created_at: `${today}T11:30:00`,
            booking_id: b.id,
            guest_id: getGuestId(b) ?? null,
            folio_id: b.folio_id ?? null,
            read: readIds.has(`checkout-${b.id}`),
            type: 'checkout',
            actionLabel: 'View booking',
          }))
        : []

      const tomorrowCheckoutNotifications: Notification[] = now >= eveningReminderTime
        ? (tomorrowCheckoutsRes.data || []).map((b: any) => ({
            id: `checkout-tomorrow-${b.id}`,
            description: `${getGuestName(b) || 'Guest'} is due to check out tomorrow by 12pm${getRoomNumber(b) ? ` - Room ${getRoomNumber(b)}` : ''}`,
            amount: Number(b.balance || 0),
            created_at: `${today}T21:00:00`,
            booking_id: b.id,
            guest_id: getGuestId(b) ?? null,
            folio_id: b.folio_id ?? null,
            read: readIds.has(`checkout-tomorrow-${b.id}`),
            type: 'checkout',
            actionLabel: 'View booking',
          }))
        : []

      const overdueNotifications: Notification[] = (overdueRes.data || []).map((b: any) => ({
        id: `overdue-${b.id}`,
        description: `${getGuestName(b) || 'Guest'} is overdue for checkout since ${b.check_out}${getRoomNumber(b) ? ` - Room ${getRoomNumber(b)}` : ''}`,
        amount: Number(b.balance || 0),
        created_at: now.toISOString(),
        booking_id: b.id,
        guest_id: getGuestId(b) ?? null,
        folio_id: b.folio_id ?? null,
        read: readIds.has(`overdue-${b.id}`),
        type: 'overdue_checkout',
        actionLabel: 'View booking',
      }))

      const balanceNotifications: Notification[] = (balancesRes.data || []).map((b: any) => ({
        id: `balance-${b.id}`,
        description: `${getGuestName(b) || 'Guest'} has an outstanding balance`,
        amount: Number(b.balance || 0),
        created_at: now.toISOString(),
        booking_id: b.id,
        guest_id: getGuestId(b) ?? null,
        folio_id: b.folio_id ?? null,
        read: readIds.has(`balance-${b.id}`),
        type: 'balance',
        actionLabel: 'Settle balance',
      }))

      const roomNotifications: Notification[] = (roomsRes.data || []).map((room: any) => ({
        id: `room-${room.id}-${room.status}`,
        description: `Room ${room.room_number} is marked ${String(room.status).replace('_', ' ')}`,
        amount: 0,
        created_at: room.updated_at || now.toISOString(),
        booking_id: null,
        guest_id: null,
        folio_id: null,
        read: readIds.has(`room-${room.id}-${room.status}`),
        type: 'room',
        actionLabel: 'View rooms',
      }))

      const combined = [
        ...overdueNotifications,
        ...checkoutNotifications,
        ...tomorrowCheckoutNotifications,
        ...checkinNotifications,
        ...tomorrowCheckinNotifications,
        ...balanceNotifications,
        ...roomNotifications,
        ...transactionNotifications,
      ]

      setNotifications(combined.slice(0, 20))
    } catch (error) {
      console.error('Error fetching notifications:', error)
    }
  }, [organizationId, readIds])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAllRead = () => {
    const allIds = new Set(notifications.map((n) => n.id))
    setReadIds(allIds)
    persistReadIds(allIds)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const handleNotificationClick = (n: Notification) => {
    // Mark as read
    setReadIds((prev) => {
      const next = new Set([...prev, n.id])
      persistReadIds(next)
      return next
    })
    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x))
    setNotifOpen(false)
    // Navigate to the most specific page
    if (n.booking_id) {
      router.push(`/bookings/${n.booking_id}`)
    } else if (n.guest_id) {
      router.push(`/accounts/guest-${n.guest_id}`)
    } else if (n.type === 'room') {
      router.push('/rooms')
    } else {
      router.push(`/transactions`)
    }
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      const supabase = createClient()
      if (!supabase) {
        toast.error('Unable to logout')
        setLoggingOut(false)
        return
      }

      const { error } = await supabase.auth.signOut()
      if (error) throw error

      toast.success('Logged out successfully')
      router.push('/auth/login')
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'Failed to logout')
      setLoggingOut(false)
    }
  }

  const initials = user.email
    ?.split('@')[0]
    .slice(0, 2)
    .toUpperCase() || 'U'

  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:px-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenuClick}>
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">Welcome back,</h2>
          <p className="text-lg font-semibold">{user.name}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h4 className="text-sm font-semibold">Notifications</h4>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs text-muted-foreground" onClick={markAllRead}>
                  Mark all read
                </Button>
              )}
            </div>
            <ScrollArea className="h-[300px]">
              {notifications.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                  No new notifications
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-gray-300' : 'bg-blue-500'}`} />
                      <div className="flex-1 space-y-1">
                        <p className="text-sm leading-snug">{n.description || 'Transaction recorded'}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-primary">{n.amount ? formatNaira(n.amount) : n.type?.replace('_', ' ') || 'Notice'}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {n.actionLabel || (n.booking_id ? 'View booking' : n.guest_id ? 'View guest' : 'View transactions')}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-10 w-10 rounded-full">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user.role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <UserIcon className="mr-2 h-4 w-4" />
                <span>Profile & Settings</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive" disabled={loggingOut}>
              {loggingOut ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-4 w-4" />
              )}
              <span>{loggingOut ? 'Logging out...' : 'Log out'}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
