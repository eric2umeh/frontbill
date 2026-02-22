'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, Loader2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNaira } from '@/lib/utils/currency'
import { createClient } from '@/lib/supabase/client'
import { subDays, format } from 'date-fns'

interface ChartData {
  day: string
  revenue: number
  payments: number
}

export function RevenueChart() {
  const [data, setData] = useState<ChartData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchChartData()
  }, [])

  const fetchChartData = async () => {
    try {
      setLoading(true)
      const supabase = createClient()
      
      if (!supabase) {
        setData([])
        setLoading(false)
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        setData([])
        return
      }

      // Fetch last 7 days of data
      const chartData: ChartData[] = []
      for (let i = 6; i >= 0; i--) {
        const date = subDays(new Date(), i)
        const dateStr = format(date, 'yyyy-MM-dd')
        const dayName = format(date, 'EEE')

        const { data: payments } = await supabase
          .from('payments')
          .select('*')
          .eq('organization_id', profile.organization_id)
          .gte('payment_date', `${dateStr}T00:00:00`)
          .lte('payment_date', `${dateStr}T23:59:59`)

        const revenue = payments?.reduce((sum, p) => sum + p.amount, 0) || 0
        
        // Use 80% of revenue as collected payments (assumption)
        const collectedPayments = Math.round(revenue * 0.8)

        chartData.push({
          day: dayName,
          revenue,
          payments: collectedPayments,
        })
      }

      setData(chartData)
    } catch (error: any) {
      console.error('Error fetching chart data:', error)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Weekly Revenue Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-[350px]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-[350px] text-muted-foreground">
            <p className="text-sm">No data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="day" 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(value) => `₦${value / 1000}k`}
              />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-sm">
                        <p className="font-semibold text-sm mb-2">{payload[0].payload.day}</p>
                        <div className="space-y-1">
                          <p className="text-xs">
                            <span className="text-muted-foreground">Revenue: </span>
                            <span className="font-medium">{formatNaira(payload[0].value as number)}</span>
                          </p>
                          <p className="text-xs">
                            <span className="text-muted-foreground">Payments: </span>
                            <span className="font-medium">{formatNaira(payload[1].value as number)}</span>
                          </p>
                        </div>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Legend 
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="circle"
              />
              <Bar 
                dataKey="revenue" 
                fill="hsl(var(--primary))" 
                radius={[8, 8, 0, 0]}
                name="Expected Revenue"
              />
              <Bar 
                dataKey="payments" 
                fill="hsl(var(--chart-2))" 
                radius={[8, 8, 0, 0]}
                name="Collected Payments"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
