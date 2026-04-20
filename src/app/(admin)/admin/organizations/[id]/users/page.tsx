import { createAdminClient } from '@/lib/supabase/admin'
import { adminListUsers } from '@/app/actions/admin-users'
import { getPlan, type PlanId } from '@/lib/plans'
import { OrgUsersClient } from './users-client'

export const dynamic = 'force-dynamic'

export default async function OrgUsersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ id?: string }>
}) {
  const { id: orgId } = await params
  const { id: initialUserId } = await searchParams

  const admin = createAdminClient()

  const [
    { data: org },
    { data: categories },
    { data: positions },
    { count: activeMemberCount },
    users,
  ] = await Promise.all([
    admin.from('organizations').select('plan, slug').eq('id', orgId).single(),
    admin
      .from('categories')
      .select('*')
      .eq('organization_id', orgId)
      .order('display_order')
      .order('name'),
    admin.from('positions').select('*').eq('organization_id', orgId).order('name'),
    admin
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('active', true),
    adminListUsers({ forOrgId: orgId }),
  ])

  const plan = ((org?.plan as string) ?? 'basic') as PlanId
  const planDef = getPlan(plan)
  const orgSlug = ((org?.slug as string) ?? null)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <OrgUsersClient
        orgId={orgId}
        users={users}
        categories={categories ?? []}
        positions={positions ?? []}
        initialUserId={initialUserId}
        planName={planDef.name}
        memberCount={activeMemberCount ?? 0}
        maxMembers={planDef.max_members}
        orgSlug={orgSlug}
      />
    </div>
  )
}
