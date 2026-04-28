import { generateLocalRevenueRecommendation } from '@/lib/ai/local-insights'

export async function POST(req: Request) {
  try {
    const { bookings, currentDate } = await req.json()

    return Response.json({
      recommendation: generateLocalRevenueRecommendation(bookings || [], currentDate),
    })
  } catch (error: any) {
    console.error('Revenue recommendation error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
