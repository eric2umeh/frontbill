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
import { formatDistanceToNow } from 'date-fns'

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
}

export function Header({ user, onMenuClick }: HeaderProps) {
  const [loggingOut, setLoggingOut] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const router = useRouter()
  const { organizationId } = useAuth()

  const fetchNotifications = useCallback(async () => {
    const supabase = createClient()
    if (!supabase || !organizationId) return

    try {
      const { data } = await supabase
        .from('transactions')
        .select('id, description, amount, created_at, booking_id, guest_id, folio_id')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (data) {
        setNotifications(data.map((t) => ({
          ...t,
          booking_id: t.booking_id ?? null,
          guest_id: t.guest_id ?? null,
          folio_id: t.folio_id ?? null,
          read: readIds.has(t.id),
        })))
      }
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
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const [notifOpen, setNotifOpen] = useState(false)

  const handleNotificationClick = (n: Notification) => {
    // Mark as read
    setReadIds((prev) => new Set([...prev, n.id]))
    setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, read: true } : x))
    setNotifOpen(false)
    // Navigate to the most specific page
    if (n.booking_id) {
      router.push(`/bookings?id=${n.booking_id}`)
    } else if (n.guest_id) {
      router.push(`/guests?id=${n.guest_id}`)
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
                          <span className="text-xs font-medium text-primary">{formatNaira(n.amount)}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {n.booking_id ? 'View booking' : n.guest_id ? 'View guest' : 'View transactions'}
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
            <Link href="/settings" asChild>
              <DropdownMenuItem>
                <UserIcon className="mr-2 h-4 w-4" />
                <span>Profile & Settings</span>
              </DropdownMenuItem>
            </Link>
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
