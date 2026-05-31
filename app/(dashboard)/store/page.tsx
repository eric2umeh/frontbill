import { redirect } from 'next/navigation'

/** Legacy store URL → supply chain revamp */
export default function LegacyStoreRedirect() {
  redirect('/supply/store')
}
