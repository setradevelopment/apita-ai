export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getSessionContext } from '@/lib/auth/session'
import { ensureTrainingsForMonth } from '@/app/actions/trainings'
import { parseMonthParam } from '@/lib/month'
import { CategoryClient } from './category-client'

// ── Period helpers ─────────────────────────────────────────────────────
// Relatório de categoria opera sobre um range de datas arbitrário
// (`?from=YYYY-MM-DD&to=YYYY-MM-DD`). Mantém compat com `?m=YYYY-MM`
// (formato antigo), convertendo para o range do mês inteiro quando `from`
// e `to` não vêm — evita quebrar links salvos pelos coordenadores.

function isIsoDate(s: string | undefined): s is string {
  return Boolean(s) && /^\d{4}-\d{2}-\d{2}$/.test(s!)
}

function monthRange(month: number, year: number): { from: string; to: string } {
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return {
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

/** Enumera os pares (month, year) que o range [from..to] cobre, inclusivo. */
function monthsInRange(from: string, to: string): Array<{ month: number; year: number }> {
  const [fy, fm] = from.slice(0, 7).split('-').map(Number)
  const [ty, tm] = to.slice(0, 7).split('-').map(Number)
  const out: Array<{ month: number; year: number }> = []
  let cy = fy
  let cm = fm
  while (cy < ty || (cy === ty && cm <= tm)) {
    out.push({ month: cm, year: cy })
    cm++
    if (cm > 12) { cm = 1; cy++ }
  }
  return out
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ from?: string; to?: string; m?: string }>
}) {
  const { id } = await params
  const sp = await searchParams

  // Resolve `from`/`to`: prioridade explícita > compat com `?m=` > mês atual
  let from: string
  let to: string
  if (isIsoDate(sp.from) && isIsoDate(sp.to)) {
    from = sp.from
    to = sp.to
  } else {
    const { month, year } = parseMonthParam(sp.m)
    const r = monthRange(month, year)
    from = r.from
    to = r.to
  }
  // Garante from ≤ to (proteção contra URL inválida)
  if (from > to) [from, to] = [to, from]

  const { supabase, orgId, role } = await getSessionContext()

  const categoryQuery = supabase.from('categories').select('*').eq('id', id)
  if (orgId) categoryQuery.eq('organization_id', orgId)
  const { data: category } = await categoryQuery.single()
  if (!category) notFound()

  // Materializa trainings em cada mês do range. `ensureTrainingsForMonth` é
  // idempotente (só insere datas faltantes) — OK chamar em loop mesmo pra
  // ranges retroativos. Em ranges grandes (ano inteiro) o custo é aceitável
  // porque já era o comportamento do dashboard.
  const months = monthsInRange(from, to)
  await Promise.all(
    months.map((mm) => ensureTrainingsForMonth(id, category.days_of_week, mm.month, mm.year)),
  )

  const trainingsQuery = supabase
    .from('trainings')
    .select('id, date, status')
    .eq('category_id', id)
    .gte('date', from)
    .lte('date', to)
    .order('date')
  if (orgId) trainingsQuery.eq('organization_id', orgId)

  // Carrega member_category_positions aninhada pra permitir mostrar
  // posições por categoria sem query adicional.
  const memberCategoriesQuery = supabase
    .from('member_categories')
    .select(`
      member_id,
      members(
        id,
        name,
        member_category_positions(category_id, position_id)
      )
    `)
    .eq('category_id', id)
  if (orgId) memberCategoriesQuery.eq('organization_id', orgId)

  const [{ data: trainings }, { data: memberCategories }] = await Promise.all([
    trainingsQuery,
    memberCategoriesQuery,
  ])

  const members = (memberCategories ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((mc: any) => mc.members)
    .filter(Boolean)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const memberIds = members.map((m: any) => m.id)
  const trainingIds = (trainings ?? []).map((t) => t.id)

  const positionsQuery = supabase.from('positions').select('id, name')
  if (orgId) positionsQuery.eq('organization_id', orgId)

  // monthly_payments usa chave (month, year) — pra cobrir o range, geramos
  // um OR de `and(month.eq.X,year.eq.Y)` pros meses relevantes. PostgREST
  // aceita via `.or(...)`. Em ranges típicos (1–12 meses) fica barato.
  //
  // Nota: as queries do supabase-js são "thenable" mas não `Promise<T>`
  // estritamente, então deixo TS inferir a união dos dois branches — tipar
  // com `Promise<{ data: unknown[] | null }>` dá erro porque o builder não
  // implementa `catch`/`finally`. `await Promise.all([...])` consome todas
  // corretamente.
  const paymentsQuery = memberIds.length > 0 && months.length > 0
    ? (() => {
        const q = supabase
          .from('monthly_payments')
          .select('member_id, month, year, is_monthly_payer, payment_status')
          .in('member_id', memberIds)
          .eq('category_id', id)
        if (orgId) q.eq('organization_id', orgId)
        const orParts = months
          .map((mm) => `and(month.eq.${mm.month},year.eq.${mm.year})`)
          .join(',')
        return q.or(orParts)
      })()
    : Promise.resolve({ data: [] })

  const attendancesQuery = trainingIds.length > 0 && memberIds.length > 0
    ? supabase
        .from('member_attendances')
        .select('training_id, member_id, status, payment_type, payment_status')
        .in('training_id', trainingIds)
        .in('member_id', memberIds)
    : Promise.resolve({ data: [] })

  const [{ data: payments }, { data: attendances }, { data: positions }] = await Promise.all([
    paymentsQuery,
    attendancesQuery,
    positionsQuery,
  ])

  // Papel do viewer (já resolvido no getSessionContext) decide:
  //   • Atleta: oculta coluna de Pendências (privacidade financeira dos colegas)
  //   • Coord/admin: vê tudo (controle gerencial)
  // Os `members` carregados acima JÁ são só os da categoria (via
  // `member_categories`), então o filtro "ver só colegas da categoria" é
  // natural — não precisa de código extra.
  const hidePaymentsOfOthers = role === 'member'

  return (
    <CategoryClient
      category={category}
      trainings={trainings ?? []}
      members={members}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payments={(payments ?? []) as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      attendances={(attendances ?? []) as any}
      positions={positions ?? []}
      from={from}
      to={to}
      hidePaymentsOfOthers={hidePaymentsOfOthers}
    />
  )
}
