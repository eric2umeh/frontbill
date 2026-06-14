import { redirect } from 'next/navigation'

export default function AnalyticsIndexPage() {
  redirect('/transactions/analytics/revenue')
}
