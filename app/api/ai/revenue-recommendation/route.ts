import { generateText, Output } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const revenueRecommendationSchema = z.object({
  currentOccupancyRate: z.number().describe('Current occupancy percentage'),
  recommendedPriceAdjustment: z.string().describe('Percentage to adjust prices'),
  reasoning: z.string().describe('Why this adjustment is recommended'),
  potentialRevenueIncrease: z.string().describe('Estimated revenue impact'),
  seasonalTrends: z.array(z.string()).describe('Key seasonal trends identified'),
  actionItems: z.array(z.string()).describe('Specific actions to implement'),
})

export async function POST(req: Request) {
  try {
    const { bookings, currentDate } = await req.json()

    const summary = {
      totalBookings: bookings.length,
      upcomingBookings: bookings.filter((b: any) => new Date(b.checkIn) > new Date(currentDate)).length,
      avgRoomRate: Math.round(bookings.reduce((sum: number, b: any) => sum + b.amount, 0) / bookings.length),
      occupancyPattern: bookings.slice(0, 7).map((b: any) => ({ date: b.checkIn, occupied: true })),
    }

    const prompt = `Based on hotel occupancy and booking data, provide revenue optimization recommendations:

Current Data:
- Total Bookings: ${summary.totalBookings}
- Upcoming Bookings: ${summary.upcomingBookings}
- Average Room Rate: ₦${summary.avgRoomRate}
- Current Date: ${currentDate}

Booking Data: ${JSON.stringify(summary.occupancyPattern)}

Provide:
1. Current occupancy rate estimate
2. Recommended price adjustment (as percentage)
3. Reasoning for the adjustment
4. Estimated revenue increase potential
5. Seasonal trends observed
6. Specific action items to implement`

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      output: Output.object({ schema: revenueRecommendationSchema }),
      system:
        'You are a hotel revenue management expert. Analyze booking patterns and provide data-driven pricing recommendations to maximize occupancy and revenue.',
    })

    return Response.json({
      recommendation: result.object,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
    })
  } catch (error: any) {
    console.error('Revenue recommendation error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
