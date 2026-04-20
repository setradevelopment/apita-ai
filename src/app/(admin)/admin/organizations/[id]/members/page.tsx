import { createAdminClient } from '@/lib/supabase/admin'
import { OrgMembersClient } from './members-client'

export const dynamic = 'force-dynamic'

export default async function OrgMembersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: orgId } = await params
  const admin = createAdminClient()

  const [{ data: members }, { data: categories }, { data: positions }] = await Promise.all([
    admin
      .from('members')
      .select(`*, member_categories(category_id), member_category_positions(category_id, position_id)`)
      .eq('organization_id', orgId)
      .order('name'),
    admin
      .from('categories')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('display_order')
      .order('name'),
    admin.from('positions').select('id, name').eq('organization_id', orgId).order('name'),
  ])

  // Enriquece members com role do profile vinculado — precisa pro chip "Coord".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = ((members ?? []) as any[])
    .map((m) => m.user_id)
    .filter((id: string | null | undefined): id is string => Boolean(id))

  const { data: profiles } = userIds.length > 0
    ? await admin.from('profiles').select('id, role').in('id', userIds)
    : { data: [] as { id: string; role: string }[] }

  const roleByUserId = new Map<string, string>()
  for (const p of profiles ?? []) roleByUserId.set(p.id, p.role)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const membersWithRole = ((members ?? []) as any[]).map((m) => ({
    ...m,
    role: m.user_id ? (roleByUserId.get(m.user_id) ?? null) : null,
  }))

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <OrgMembersClient
        orgId={orgId}
        members={membersWithRole}
        categories={categories ?? []}
        positions={positions ?? []}
      />
    </div>
  )
}
