import { generateText, Output } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const nightAuditSummarySchema = z.object({
  totalCheckouts: z.number().describe('Total number of checkouts for the day'),
  totalCheckIns: z.number().describe('Total number of check-ins for the day'),
  occupancyRate: z.number().describe('Overall occupancy percentage'),
  dayRevenue: z.string().describe('Total revenue for the day'),
  keyHighlights: z.array(z.string()).describe('Key highlights and notable events'),
  issues: z.array(z.string()).nullable().describe('Any issues or concerns that need attention'),
  recommendations: z.array(z.string()).describe('Recommendations for next day operations'),
  staffNotes: z.string().describe('Summary of important operational notes for staff'),
})

export async function POST(req: Request) {
  try {
    const { dailyData, date } = await req.json()

    const prompt = `Generate an automated night audit summary for a hotel based on this daily data:

Date: ${date}
Total Check-outs: ${dailyData.checkouts}
Total Check-ins: ${dailyData.checkIns}
Room Occupancy: ${dailyData.occupancy}%
Daily Revenue: ₦${dailyData.revenue}
Pending Checkouts: ${dailyData.pendingCheckouts}
Expected Arrivals: ${dailyData.expectedArrivals}
Special Notes: ${dailyData.notes || 'None'}

Please provide:
1. Summary of check-outs and check-ins
2. Overall occupancy rate
3. Daily revenue summary
4. Key highlights (high occupancy, VIP guests, special events, etc.)
5. Any issues requiring attention
6. Recommendations for next day
7. Staff operational notes for handover`

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      output: Output.object({ schema: nightAuditSummarySchema }),
      system:
        'You are a hotel night audit manager. Generate clear, professional summaries of daily hotel operations for staff handover and management review.',
    })

    return Response.json({
      summary: result.object,
      generatedAt: new Date().toISOString(),
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
    })
  } catch (error: any) {
    console.error('[v0] Night audit summary error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
