import { CalendarClock } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureTrainingsForMonth } from '@/app/actions/trainings'
import { parseMonthParam } from '@/lib/month'
import { MonthSelector } from '@/components/admin/month-selector'
import { OrgTrainingsClient } from './trainings-client'

export const dynamic = 'force-dynamic'

export default async function OrgTrainingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ m?: string; cat?: string }>
}) {
  const { id: orgId } = await params
  const { m, cat: catParam } = await searchParams
  const { month, year } = parseMonthParam(m)

  const admin = createAdminClient()

  const { data: categories } = await admin
    .from('categories')
    .select('*')
    .eq('organization_id', orgId)
    .order('display_order')
    .order('name')

  if (!categories || categories.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Gerenciador de Treinos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Controle de ocorrência, presença e pagamentos por treino.
          </p>
        </div>
        <MonthSelector month={month} year={year} />
        <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center text-center py-16">
          <div className="h-12 w-12 flex items-center justify-center rounded-xl bg-muted/60 mb-3">
            <CalendarClock className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">
            Nenhuma categoria cadastrada. Crie categorias na aba{' '}
            <strong>Categorias</strong>.
          </p>
        </div>
      </div>
    )
  }

  // Ensure training rows for the requested month. Use forOrgId to keep the
  // resolver happy when super_admin isn't in this org.
  await Promise.all(
    categories.map((cat) =>
      ensureTrainingsForMonth(cat.id, cat.days_of_week, month, year, { forOrgId: orgId })
    )
  )

  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const startDate = `${year}-${mm}-01`
  const endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`

  const categoryIds = categories.map((c) => c.id)

  const [{ data: allTrainings }, { data: memberCategories }] = await Promise.all([
    admin
      .from('trainings')
      .select('*')
      .eq('organization_id', orgId)
      .in('category_id', categoryIds)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date'),
    admin
      .from('member_categories')
      .select('member_id, category_id, members(id, name)')
      .eq('organization_id', orgId)
      .in('category_id', categoryIds),
  ])

  const trainingIds = (allTrainings ?? []).map((t) => t.id)
  const { data: attendances } =
    trainingIds.length > 0
      ? await admin.from('member_attendances').select('*').in('training_id', trainingIds)
      : { data: [] }

  // Mensalidades do mês — mesmo conjunto que o dashboard carrega, pro painel
  // de mensalistas + badges nos cards de treino funcionarem na view admin.
  const { data: monthlyPayments } = await admin
    .from('monthly_payments')
    .select('id, member_id, category_id, month, year, is_monthly_payer, payment_status, payment_note, updated_at')
    .eq('organization_id', orgId)
    .in('category_id', categoryIds)
    .eq('month', month)
    .eq('year', year)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Gerenciador de Treinos
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Controle de ocorrência, presença e pagamentos por treino — operando como super_admin.
        </p>
      </div>
      <OrgTrainingsClient
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
