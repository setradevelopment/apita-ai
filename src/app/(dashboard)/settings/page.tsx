import { Suspense } from 'react'
import { getSessionContext } from '@/lib/auth/session'
import { adminListUsers, type PlatformUser } from '@/app/actions/admin-users'
import { getPlan } from '@/lib/plans'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const { supabase, orgId, plan, role } = await getSessionContext()

  // Atleta não tem acesso a configurações. Por enquanto, toda config é
  // gerencial (categorias, posições, limites de plano, usuários). Se no
  // futuro houver preferências pessoais do atleta, criamos uma área
  // específica — mas neste momento, gate total é mais honesto que mostrar
  // uma tela vazia.
  if (role === 'member') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center fade-in">
        <div className="max-w-md text-center space-y-3 px-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 ring-1 ring-rose-200">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6 text-rose-600">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h1 className="text-xl font-semibold font-heading">Sem permissão</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            As configurações são exclusivas pra contratante e coordenadores.
            Volte ao{' '}
            <a href="/dashboard" className="text-primary underline hover:no-underline">
              Dashboard
            </a>{' '}
            pra acompanhar seus treinos e pagamentos.
          </p>
        </div>
      </div>
    )
  }

  const categoriesQuery = supabase
    .from('categories')
    .select('*')
    .order('display_order')
    .order('name')
  const positionsQuery = supabase.from('positions').select('*').order('name')

  if (orgId) {
    categoriesQuery.eq('organization_id', orgId)
    positionsQuery.eq('organization_id', orgId)
  }

  // Count active members for plan enforcement
  const activeMembersQuery = orgId
    ? supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('active', true)
    : null

  const orgQuery = orgId
    ? supabase.from('organizations').select('logo_url, slug').eq('id', orgId).single()
    : null

  const [{ data: categories }, { data: positions }, activeMembersResult, orgResult] =
    await Promise.all([
      categoriesQuery,
      positionsQuery,
      activeMembersQuery ?? Promise.resolve({ count: 0 }),
      orgQuery ?? Promise.resolve({ data: null }),
    ])

  // Only admins/coordinators can list users — gracefully degrade for others
  let users: PlatformUser[] = []
  try {
    users = await adminListUsers()
  } catch {
    // Non-admin user: users section will be hidden
  }

  const planDef = getPlan(plan)
  const categoryCount = categories?.length ?? 0
  const activeMemberCount = activeMembersResult?.count ?? 0
  const isSuperAdmin = role === 'super_admin'
  const isAdmin = role === 'admin' || isSuperAdmin
  const orgRow = orgResult?.data as { logo_url: string | null; slug: string | null } | null
  const orgLogoUrl = orgRow?.logo_url ?? null
  const orgSlug = orgRow?.slug ?? null

  return (
    <Suspense>
      <SettingsClient
        categories={categories ?? []}
        positions={positions ?? []}
        users={users}
        planName={planDef.name}
        categoryCount={categoryCount}
        maxCategories={planDef.max_categories}
        memberCount={activeMemberCount}
        maxMembers={planDef.max_members}
        bypassLimits={isSuperAdmin}
        orgLogoUrl={orgLogoUrl}
        orgSlug={orgSlug}
        isAdmin={isAdmin}
      />
    </Suspense>
  )
}
