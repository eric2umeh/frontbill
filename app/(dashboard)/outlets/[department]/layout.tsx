import type { Metadata } from 'next'
import { getOutletDepartment } from '@/lib/outlets/departments'

type Props = { params: Promise<{ department: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { department } = await params
  return { title: getOutletDepartment(department)?.label ?? 'Outlet' }
}

export default function OutletDepartmentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
