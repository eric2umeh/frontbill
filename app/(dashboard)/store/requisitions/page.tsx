import { redirect } from 'next/navigation'

export default function StoreRequisitionsListRedirectPage() {
  redirect('/store?tab=requisitions')
}
