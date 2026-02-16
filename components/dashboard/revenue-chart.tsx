'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNaira } from '@/lib/utils/currency'

// Mock data for demonstration
const data = [
  { day: 'Mon', revenue: 125000, payments: 100000 },
  { day: 'Tue', revenue: 185000, payments: 150000 },
  { day: 'Wed', revenue: 210000, payments: 180000 },
  { day: 'Thu', revenue: 165000, payments: 140000 },
  { day: 'Fri', revenue: 245000, payments: 220000 },
  { day: 'Sat', revenue: 310000, payments: 280000 },
  { day: 'Sun', revenue: 275000, payments: 250000 },
]

export function RevenueChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Weekly Revenue Overview
        </CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  )
}
