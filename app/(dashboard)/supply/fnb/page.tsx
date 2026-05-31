import { redirect } from 'next/navigation'

/** F&B sales use the full outlet POS (room charge, fees, settle/open bills). */
export default function SupplyFnbPage() {
  redirect('/outlets')
}
