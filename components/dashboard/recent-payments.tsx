import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CreditCard } from 'lucide-react'
import { formatDateTime } from '@/lib/utils/date'
import { formatNaira } from '@/lib/utils/currency'

export async function RecentPayments() {
  const supabase = await createClient()
  const { data: payments } = await supabase
    .from('payments')
    .select('*, guest:guests(*)')
    .order('payment_date', { ascending: false })
    .limit(5)

  const methodColors: Record<string, string> = {
    cash: 'bg-green-100 text-green-800',
    pos: 'bg-blue-100 text-blue-800',
    transfer: 'bg-purple-100 text-purple-800',
    cheque: 'bg-orange-100 text-orange-800',
    credit: 'bg-yellow-100 text-yellow-800',
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Recent Payments
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {payments?.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No payments yet
            </p>
          ) : (
            payments?.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
              >
                <div className="space-y-1">
                  <p className="font-medium text-sm">
                    {payment.guest?.first_name} {payment.guest?.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(payment.payment_date)}
                  </p>
                  <Badge className={methodColors[payment.payment_method]} variant="secondary">
                    {payment.payment_method.toUpperCase()}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-sm text-green-600">
                    {formatNaira(payment.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {payment.payment_reference}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
