export const dynamic = 'force-dynamic'

import { getSessionContext } from '@/lib/auth/session'
import { parseMonthParam } from '@/lib/month'
import { OperationalOverview } from '@/components/dashboard/operational-overview'

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; cat?: string }>
}) {
  const { m, cat } = await searchParams
  const { month, year } = parseMonthParam(m)
  const selectedCategoryId = cat || null

  const { supabase, orgId } = await getSessionContext()

  if (!orgId) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Usuário não vinculado a uma organização.
      </div>
    )
  }

  return (
    <OperationalOverview
      supabase={supabase}
      orgId={orgId}
      month={month}
      year={year}
      selectedCategoryId={selectedCategoryId}
      // admin-facing links stay under /dashboard routes (default props)
    />
  )
}
