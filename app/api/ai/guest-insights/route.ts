import { generateLocalGuestInsights } from '@/lib/ai/local-insights'

export async function POST(req: Request) {
  try {
    const { guests } = await req.json()

    return Response.json({
      insights: generateLocalGuestInsights(guests || []),
    })
  } catch (error: any) {
    console.error('Guest insights error:', error)
    return Response.json({ error: error.message }, { status: 500 })
  }
}
