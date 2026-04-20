import { getSessionContext } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { MembersClient } from './members-client'
import { PendingMembersClient } from './pending-members-client'
import { MembersTabs } from './members-tabs'

/**
 * Página `/members` com abas:
 *   • **Ativos** (default) — members com `approved_at != NULL`. Lista
 *     completa de atletas, colunas customizáveis, sort, export, etc.
 *   • **Pendentes** — members com `approved_at IS NULL`. Dialog de
 *     aprovação vincula categoria/posição obrigatórias. Aba some se 0.
 *
 * A aba é controlada via querystring `?tab=pending`. Default (sem qs) = ativos.
 * Escolhi querystring em vez de rota aninhada (`/members/pending`) pra
 * permitir deep-linking do sino no header com `?id=` pré-selecionando o
 * atleta a revisar.
 */
export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; id?: string }>
}) {
  const { supabase, orgId, role } = await getSessionContext()
  const sp = await searchParams
  const wantsPendingTab = sp.tab === 'pending'

  // Gate de role: lista de membros é ferramenta gerencial. Atleta não tem
  // permissão — ele acompanha colegas apenas via /categories/[id] (com
  // ranking de assiduidade, sem dados financeiros dos outros).
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
            A lista de membros é exclusiva pra contratante e coordenadores.
            Você pode ver seus colegas nas suas categorias via{' '}
            <a href="/dashboard" className="text-primary underline hover:no-underline">
              Dashboard
            </a>.
          </p>
        </div>
      </div>
    )
  }

  const membersQuery = supabase
    .from('members')
    .select(`
      *,
      member_categories(category_id),
      member_category_positions(category_id, position_id)
    `)
    .order('name')
  const categoriesQuery = supabase
    .from('categories')
    .select('id, name')
    .order('display_order')
    .order('name')
  const positionsQuery = supabase.from('positions').select('id, name').order('name')

  if (orgId) {
    membersQuery.eq('organization_id', orgId)
    categoriesQuery.eq('organization_id', orgId)
    positionsQuery.eq('organization_id', orgId)
  }

  const [{ data: members }, { data: categories }, { data: positions }] = await Promise.all([
    membersQuery,
    categoriesQuery,
    positionsQuery,
  ])

  // Separa aprovados vs pendentes pelo flag `approved_at`. Essa é a única
  // diferença conceitual entre as duas abas — as listas usam a mesma base.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allMembers = (members ?? []) as any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const approvedMembers = allMembers.filter((m: any) => m.approved_at)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingMembers = allMembers.filter((m: any) => !m.approved_at)
  const pendingCount = pendingMembers.length

  // Só admin/coord aprovam pendentes. Se atleta/contratante "rebaixado"
  // cair aqui, ignoramos a aba pendentes (não renderizamos).
  const canApprove = role === 'admin' || role === 'coordinator'

  // Resolve a aba efetiva. Se pediu pendentes mas não tem permissão ou
  // não há pendentes, cai em ativos silenciosamente — evita tela vazia.
  const activeTab: 'active' | 'pending' =
    wantsPendingTab && canApprove && pendingCount > 0 ? 'pending' : 'active'

  // ── Enriquecimento com role + email (só pros aprovados — pendentes
  // usam fluxo próprio e já têm email no auth.user via listPendingMembers) ─
  const userIds = approvedMembers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => m.user_id)
    .filter((id: string | null | undefined): id is string => Boolean(id))

  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('id, role').in('id', userIds)
    : { data: [] as { id: string; role: string }[] }

  const roleByUserId = new Map<string, string>()
  for (const p of profiles ?? []) roleByUserId.set(p.id, p.role)

  const emailByUserId = new Map<string, string>()
  if (userIds.length > 0) {
    const admin = createAdminClient()
    const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const userIdSet = new Set(userIds)
    for (const u of authList?.users ?? []) {
      if (userIdSet.has(u.id) && u.email) emailByUserId.set(u.id, u.email)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const approvedWithRole = approvedMembers.map((m: any) => ({
    ...m,
    role: m.user_id ? (roleByUserId.get(m.user_id) ?? null) : null,
    email: m.user_id ? (emailByUserId.get(m.user_id) ?? null) : null,
  }))

  // ── Para a aba pendentes, também precisamos dos emails (via admin) ───
  const pendingUserIds = pendingMembers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => m.user_id)
    .filter((id: string | null | undefined): id is string => Boolean(id))
  const pendingEmailById = new Map<string, string>()
  if (pendingUserIds.length > 0 && canApprove) {
    const admin = createAdminClient()
    const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const set = new Set(pendingUserIds)
    for (const u of authList?.users ?? []) {
      if (set.has(u.id) && u.email) pendingEmailById.set(u.id, u.email)
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pendingEnriched = pendingMembers.map((m: any) => ({
    id: m.id,
    name: m.name,
    email: m.user_id ? (pendingEmailById.get(m.user_id) ?? null) : null,
    dob: m.dob,
    cpf: m.cpf,
    rg: m.rg,
    created_at: m.created_at,
    origin_neighborhood: m.origin_neighborhood,
    destination_neighborhood: m.destination_neighborhood,
  }))

  return (
    <div className="space-y-5 fade-in">
      <div>
        <h2 className="text-xl font-semibold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Membros
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Cadastre e gerencie os atletas do clube
        </p>
      </div>

      {/* Abas. Só renderiza "Pendentes" quando há pelo menos um E o usuário
          tem permissão de aprovar — caso contrário, a tela inteira só tem
          ativos (sem UI de abas, mais limpo). */}
      {canApprove && pendingCount > 0 ? (
        <>
          <MembersTabs activeTab={activeTab} pendingCount={pendingCount} />
          {activeTab === 'pending' ? (
            <PendingMembersClient
              pending={pendingEnriched}
              categories={categories ?? []}
              positions={positions ?? []}
              initialSelectedId={sp.id ?? null}
            />
          ) : (
            <MembersClient
              members={approvedWithRole}
              categories={categories ?? []}
              positions={positions ?? []}
            />
          )}
        </>
      ) : (
        <MembersClient
          members={approvedWithRole}
          categories={categories ?? []}
          positions={positions ?? []}
        />
      )}
    </div>
  )
}
