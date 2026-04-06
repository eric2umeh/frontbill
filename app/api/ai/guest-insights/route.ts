import { generateText, Output } from 'ai'
import { openai } from '@ai-sdk/openai'
import { z } from 'zod'

const guestInsightSchema = z.object({
  guestSegment: z.string().describe('Type of guest (business, leisure, corporate, etc.)'),
  averageStay: z.number().describe('Average length of stay in nights'),
  preferredRoomType: z.string().describe('Most preferred room type'),
  estimatedLTV: z.string().describe('Estimated lifetime value of this guest profile'),
  recommendations: z.array(z.string()).describe('Recommendations for improving guest experience'),
})

export async function POST(req: Request) {
  try {
    const { guests } = await req.json()

    // Prepare guest data summary for AI analysis
    const guestDataSummary = guests
      .slice(0, 10) // Analyze first 10 guests
      .map((g: any) => ({
        name: g.name,
        nights: g.nights,
        amount: g.amount,
        room: g.room,
        payment: g.payment,
      }))

    const prompt = `Analyze these hotel guest booking patterns and provide insights:
    
${JSON.stringify(guestDataSummary, null, 2)}

Provide insights about:
1. Guest segmentation (what types of guests are these?)
2. Average stay duration
3. Preferred room types
4. Estimated lifetime value of these guest profiles
5. Recommendations for improving guest retention and revenue`

    const result = await generateText({
      model: openai('gpt-4o-mini'),
      prompt,
      output: Output.object({ schema: guestInsightSchema }),
      system:
        'You are a hotel management expert analyzing guest booking patterns. Provide actionable insights for hotel revenue optimization.',
    })

    return Response.json({
      insights: result.object,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      },
    })
  } catch (error: any) {
    console.error('[v0] Guest insights error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
