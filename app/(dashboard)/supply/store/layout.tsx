import type { Metadata } from 'next'

export const metadata: Metadata = { title: "Central Store" }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
