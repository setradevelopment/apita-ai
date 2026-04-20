export const dynamic = 'force-dynamic'

import { getSessionContext } from '@/lib/auth/session'
import { ensureTrainingsForMonth } from '@/app/actions/trainings'
import { parseMonthParam } from '@/lib/month'
import { TrainingsClient } from './trainings-client'
import { MonthSelector } from '@/components/admin/month-selector'

export default async function TrainingsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; cat?: string }>
}) {
  const { m, cat: catParam } = await searchParams
  const { month, year } = parseMonthParam(m)

  const { supabase, orgId, role } = await getSessionContext()

  // Gate de role: Gerenciador de Treinos é ferramenta operacional do
  // coord/admin (marcar presença, pagamentos). Atleta não tem permissão —
  // ele acompanha seus próprios pagamentos em /financials.
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
            O Gerenciador de Treinos é exclusivo pra contratante e coordenadores.
            Você pode consultar seus pagamentos em{' '}
            <a href="/financials" className="text-primary underline hover:no-underline">
              Financeiro
            </a>.
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
  if (orgId) categoriesQuery.eq('organization_id', orgId)
  const { data: categories } = await categoriesQuery

  if (!categories || categories.length === 0) {
    return (
      <div className="space-y-4 fade-in">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Gerenciador de Treinos
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Controle de ocorrência, presença e pagamentos por treino
            </p>
          </div>
          <MonthSelector month={month} year={year} />
        </div>
        <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma categoria cadastrada. Crie categorias em <strong>Configurações</strong>.
          </p>
        </div>
      </div>
    )
  }

  await Promise.all(
    categories.map((cat) =>
      ensureTrainingsForMonth(cat.id, cat.days_of_week, month, year)
    )
  )

  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const startDate = `${year}-${mm}-01`
  const endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`

  const trainingsQuery = supabase
    .from('trainings')
    .select('*')
    .in('category_id', categories.map((c) => c.id))
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date')
  if (orgId) trainingsQuery.eq('organization_id', orgId)
  const { data: allTrainings } = await trainingsQuery

  const memberCategoriesQuery = supabase
    .from('member_categories')
    .select('member_id, category_id, members(id, name)')
    .in('category_id', categories.map((c) => c.id))
  if (orgId) memberCategoriesQuery.eq('organization_id', orgId)
  const { data: memberCategories } = await memberCategoriesQuery

  const trainingIds = (allTrainings ?? []).map((t) => t.id)
  const { data: attendances } = trainingIds.length > 0
    ? await supabase
        .from('member_attendances')
        .select('*')
        .in('training_id', trainingIds)
    : { data: [] }

  // Mensalidades do mês selecionado pra todas as categorias do org. Usado
  // pelo painel de mensalistas (topo) e pra decidir se o atleta é
  // "mensalista" dentro de cada card de treino. Filtro aplicado no client
  // por `category_id` quando o coord seleciona uma aba de categoria.
  const monthlyPaymentsQuery = supabase
    .from('monthly_payments')
    .select('id, member_id, category_id, month, year, is_monthly_payer, payment_status, payment_note, updated_at')
    .in('category_id', categories.map((c) => c.id))
    .eq('month', month)
    .eq('year', year)
  if (orgId) monthlyPaymentsQuery.eq('organization_id', orgId)
  const { data: monthlyPayments } = await monthlyPaymentsQuery

  return (
    <div className="space-y-5 fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Gerenciador de Treinos
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Controle de ocorrência, presença e pagamentos por treino
          </p>
        </div>
        <MonthSelector month={month} year={year} />
      </div>
      <TrainingsClient
        categories={categories}
        trainings={allTrainings ?? []}
        memberCategories={memberCategories ?? []}
        attendances={attendances ?? []}
        monthlyPayments={monthlyPayments ?? []}
        month={month}
        year={year}
        selectedCategoryId={catParam ?? null}
      />
    </div>
  )
}
