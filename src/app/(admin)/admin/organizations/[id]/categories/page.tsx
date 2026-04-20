import { createAdminClient } from '@/lib/supabase/admin'
import { getPlan, type PlanId } from '@/lib/plans'
import { OrgCategoriesClient } from './categories-client'

export const dynamic = 'force-dynamic'

export default async function OrgCategoriesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orgId } = await params
  const admin = createAdminClient()

  const [{ data: org }, { data: categories }] = await Promise.all([
    admin.from('organizations').select('plan').eq('id', orgId).single(),
    admin
      .from('categories')
      .select('*')
      .eq('organization_id', orgId)
      .order('display_order')
      .order('name'),
  ])

  const plan = ((org?.plan as string) ?? 'basic') as PlanId
  const planDef = getPlan(plan)
  const categoryList = categories ?? []

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <OrgCategoriesClient
        orgId={orgId}
        categories={categoryList}
        planName={planDef.name}
        categoryCount={categoryList.length}
        maxCategories={planDef.max_categories}
      />
    </div>
  )
}
