'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Lightbulb, TrendingUp, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface AIInsight {
  type: 'insights' | 'revenue' | 'audit'
  title: string
  data: any
  loading: boolean
}

export function AIInsightsPanel({ bookings = [], dailyData = {} }: { bookings?: any[]; dailyData?: any }) {
  const [insights, setInsights] = useState<AIInsight[]>([])
  const [loading, setLoading] = useState(false)

  const generateGuestInsights = async () => {
    if (!bookings.length) {
      toast.error('No booking data available')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/ai/guest-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guests: bookings }),
      })

      if (!response.ok) throw new Error('Failed to generate insights')
      const result = await response.json()

      setInsights((prev) => [
        ...prev.filter((i) => i.type !== 'insights'),
        {
          type: 'insights',
          title: 'Guest Analytics',
          data: result.insights,
          loading: false,
        },
      ])
      toast.success('Guest insights generated!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate insights')
    } finally {
      setLoading(false)
    }
  }

  const generateRevenueRecommendation = async () => {
    if (!bookings.length) {
      toast.error('No booking data available')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/ai/revenue-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookings,
          currentDate: new Date().toISOString(),
        }),
      })

      if (!response.ok) throw new Error('Failed to generate recommendations')
      const result = await response.json()

      setInsights((prev) => [
        ...prev.filter((i) => i.type !== 'revenue'),
        {
          type: 'revenue',
          title: 'Revenue Recommendations',
          data: result.recommendation,
          loading: false,
        },
      ])
      toast.success('Revenue recommendations generated!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate recommendations')
    } finally {
      setLoading(false)
    }
  }

  const generateNightAuditSummary = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/ai/night-audit-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyData: {
            checkouts: dailyData.checkouts || 5,
            checkIns: dailyData.checkIns || 8,
            occupancy: dailyData.occupancy || 75,
            revenue: dailyData.revenue || 1500000,
            pendingCheckouts: dailyData.pendingCheckouts || 2,
            expectedArrivals: dailyData.expectedArrivals || 3,
            notes: dailyData.notes || '',
          },
          date: new Date().toLocaleDateString(),
        }),
      })

      if (!response.ok) throw new Error('Failed to generate summary')
      const result = await response.json()

      setInsights((prev) => [
        ...prev.filter((i) => i.type !== 'audit'),
        {
          type: 'audit',
          title: 'Night Audit Summary',
          data: result.summary,
          loading: false,
        },
      ])
      toast.success('Night audit summary generated!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate summary')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <Button
          onClick={generateGuestInsights}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
          Guest Insights
        </Button>
        <Button
          onClick={generateRevenueRecommendation}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
          Revenue Tips
        </Button>
        <Button
          onClick={generateNightAuditSummary}
          disabled={loading}
          variant="outline"
          className="gap-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Audit Summary
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {insights.map((insight) => (
          <Card key={insight.type} className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="text-sm">{insight.title}</CardTitle>
              <CardDescription>AI-powered analysis</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {insight.loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Generating...</span>
                </div>
              ) : (
                <>
                  {insight.type === 'insights' && (
                    <div className="space-y-2 text-sm">
                      <div>
                        <span className="font-semibold">Guest Segment: </span>
                        {insight.data.guestSegment}
                      </div>
                      <div>
                        <span className="font-semibold">Avg Stay: </span>
                        {insight.data.averageStay} nights
                      </div>
                      <div>
                        <span className="font-semibold">Estimated LTV: </span>
                        {insight.data.estimatedLTV}
                      </div>
                      <div>
                        <p className="font-semibold text-xs mb-1">Recommendations:</p>
                        <ul className="space-y-1">
                          {insight.data.recommendations?.map((rec: string, i: number) => (
                            <li key={i} className="text-xs bg-white p-1 rounded">
                              • {rec}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {insight.type === 'revenue' && (
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <span className="font-semibold">Occupancy: </span>
                        <Badge variant="secondary">{insight.data.currentOccupancyRate}%</Badge>
                      </div>
                      <div>
                        <span className="font-semibold">Price Adjustment: </span>
                        <Badge className="ml-1">{insight.data.recommendedPriceAdjustment}</Badge>
                      </div>
                      <div>
                        <span className="font-semibold">Revenue Impact: </span>
                        {insight.data.potentialRevenueIncrease}
                      </div>
                      <div>
                        <p className="font-semibold text-xs mb-1">Action Items:</p>
                        <ul className="space-y-1">
                          {insight.data.actionItems?.map((item: string, i: number) => (
                            <li key={i} className="text-xs bg-white p-1 rounded">
                              • {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {insight.type === 'audit' && (
                    <div className="space-y-2 text-sm">
                      <div className="flex gap-2">
                        <span className="font-semibold">Check-ins: </span>
                        <Badge>{insight.data.totalCheckIns}</Badge>
                        <span className="font-semibold">Check-outs: </span>
                        <Badge variant="secondary">{insight.data.totalCheckouts}</Badge>
                      </div>
                      <div>
                        <span className="font-semibold">Occupancy: </span>
                        {insight.data.occupancyRate}%
                      </div>
                      <div>
                        <span className="font-semibold">Revenue: </span>
                        {insight.data.dayRevenue}
                      </div>
                      {insight.data.issues && insight.data.issues.length > 0 && (
                        <div>
                          <p className="font-semibold text-xs mb-1 text-red-600">Issues:</p>
                          <ul className="space-y-1">
                            {insight.data.issues.map((issue: string, i: number) => (
                              <li key={i} className="text-xs bg-red-100 p-1 rounded">
                                ⚠ {issue}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
