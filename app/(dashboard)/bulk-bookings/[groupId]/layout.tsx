import type { Metadata } from 'next'

export const metadata: Metadata = { title: "Group booking" }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
