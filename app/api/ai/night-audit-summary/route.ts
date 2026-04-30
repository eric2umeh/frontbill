import { generateLocalNightAuditSummary } from '@/lib/ai/local-insights'

export async function POST(req: Request) {
  try {
    const { dailyData, date } = await req.json()

    return Response.json({
      summary: generateLocalNightAuditSummary(dailyData, date),
      generatedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error('Night audit summary error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
