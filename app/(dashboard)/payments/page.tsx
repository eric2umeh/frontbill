'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { PaymentsTable } from '@/components/payments/payments-table'
import { Button } from '@/components/ui/button'
import { Plus, Download, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatNaira } from '@/lib/utils/currency'
import { toast } from 'sonner'

interface Payment {
  id: string
  booking_id: string
  amount: number
  method: string
  payment_date: string
  created_at: string
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    fetchPayments()
  }, [])

  const fetchPayments = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      if (!supabase) {
        // No Supabase configured - show empty state
        setPayments([])
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        toast.error('Organization not found')
        return
      }

      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('payment_date', { ascending: false })

      if (error) throw error
      setPayments(data || [])
    } catch (error: any) {
      console.error('Error fetching payments:', error)
      toast.error('Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        toast.error('Organization not found')
        return
      }

      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .order('payment_date', { ascending: false })

      if (error) throw error
      setPayments(data || [])
    } catch (error: any) {
      console.error('Error fetching payments:', error)
      toast.error('Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const cashPayments = payments.filter(p => p.method === 'cash').reduce((sum, p) => sum + Number(p.amount), 0)
  const posPayments = payments.filter(p => p.method === 'pos').reduce((sum, p) => sum + Number(p.amount), 0)
  const transferPayments = payments.filter(p => p.method === 'transfer').reduce((sum, p) => sum + Number(p.amount), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Track all payment transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Received</div>
            <div className="text-2xl font-bold text-green-600">{formatNaira(totalReceived)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Cash</div>
            <div className="text-2xl font-bold">{formatNaira(cashPayments)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">POS</div>
            <div className="text-2xl font-bold">{formatNaira(posPayments)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Transfer</div>
            <div className="text-2xl font-bold">{formatNaira(transferPayments)}</div>
          </CardContent>
        </Card>
      </div>

      <PaymentsTable payments={payments} />
    </div>
  )
}

  const totalReceived = payments.reduce((sum, p) => sum + Number(p.amount), 0)
  const cashPayments = payments.filter(p => p.payment_method === 'cash').reduce((sum, p) => sum + Number(p.amount), 0)
  const posPayments = payments.filter(p => p.payment_method === 'pos').reduce((sum, p) => sum + Number(p.amount), 0)
  const transferPayments = payments.filter(p => p.payment_method === 'transfer').reduce((sum, p) => sum + Number(p.amount), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
          <p className="text-muted-foreground">
            Track all payment transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Record Payment
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Received</div>
            <div className="text-2xl font-bold text-green-600">{formatNaira(totalReceived)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Cash</div>
            <div className="text-2xl font-bold">{formatNaira(cashPayments)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">POS</div>
            <div className="text-2xl font-bold">{formatNaira(posPayments)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Transfer</div>
            <div className="text-2xl font-bold">{formatNaira(transferPayments)}</div>
          </CardContent>
        </Card>
      </div>

      <PaymentsTable payments={payments} />
    </div>
  )
}
