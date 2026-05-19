'use client'

import { use } from 'react'
import { notFound } from 'next/navigation'
import { isOutletDepartmentKey } from '@/lib/outlets/departments'
import { canAccessOutletDepartment } from '@/lib/outlets/access'
import { useAuth } from '@/lib/auth-context'
import { OutletWorkspace } from '@/components/outlets/outlet-workspace'

export default function OutletDepartmentPage({
  params,
}: {
  params: Promise<{ department: string }>
}) {
  const { department } = use(params)
  const { role } = useAuth()

  if (!isOutletDepartmentKey(department) || !canAccessOutletDepartment(role, department)) {
    notFound()
  }

  return <OutletWorkspace department={department} />
}
