import type { SupabaseClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { Users, CalendarDays, DollarSign, TrendingUp, ArrowUpRight } from 'lucide-react'
import { MONTH_NAMES } from '@/lib/month'
import { MonthPicker } from '@/components/dashboard/month-picker'
import { CategoryFilter } from '@/components/dashboard/category-filter'
import { ensureTrainingsForYear } from '@/app/actions/trainings'
import { isMonthAllowed } from '@/lib/month'
import { calcTierPrice, type DiscountType, type PricingMethod } from '@/lib/pricing'

/**
 * Operational overview section — shared between the admin's `/dashboard` and the
 * super_admin drilldown at `/admin/organizations/[id]`. Wraps everything a non-
 * super-admin sees on their home screen: month picker, category filter, stat
 * cards, categories list with price pills, and the next-14 trainings list.
 *
 * The caller supplies the Supabase client (session or service-role) so the same
 * component works for both the admin (RLS-scoped) and super_admin (RLS-bypassing)
 * code paths. All queries are org-scoped with `.eq('organization_id', orgId)` for
 * defense-in-depth regardless of client.
 */
export async function OperationalOverview({
  supabase,
  orgId,
  month,
  year,
  selectedCategoryId,
  /** Optional href overrides — default to the /dashboard-facing links. */
  categoriesHref = '/settings',
  trainingsHref = '/trainings',
  categoryLinkPrefix = '/categories',
  showHeading = true,
  forOrgId,
}: {
  supabase: SupabaseClient
  orgId: string
  month: number
  year: number
  selectedCategoryId: string | null
  categoriesHref?: string
  trainingsHref?: string
  categoryLinkPrefix?: string
  /** When false, skips the "Visão Geral" h2 + subtitle block. Use in contexts that already render their own page header (e.g. the super_admin drilldown). Default: true. */
  showHeading?: boolean
  /**
   * When set, training-generation calls run with `{ forOrgId }` so the
   * super_admin drilldown can lazily materialize future months for an
   * organization the super_admin doesn't belong to. Omit on the admin
   * `/dashboard` path — the session's orgId is used.
   */
  forOrgId?: string
}) {
  const monthLabel = `${MONTH_NAMES[month]} de ${year}`
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // --- QUERIES ---
  // Step 1: fetch categories first — we need them both to render and to lazily
  // materialize trainings for the viewed month before counting/listing them.
  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('organization_id', orgId)
    .order('display_order')
    .order('name')

  const categoryList = (categories ?? []) as CategoryRow[]

  // Step 2: lazy-generate trainings for the *whole viewed year* so navigating
  // to any month of an unseeded year (current or future) shows the recurring
  // slots that the category config implies. Idempotent — single SELECT/INSERT
  // per category per year.
  //
  // Bounds:
  // - Skip years before the current year (avoids back-filling historical years
  //   with synthetic slots when an org is created today and someone scrolls to
  //   2020 — empty months are fine, polluted DB is not).
  // - Skip years past the +24-month cap (defends against URL hand-edits past
  //   what the MonthPicker exposes).
  const todayYear = new Date().getFullYear()
  const ensureOpts = forOrgId ? { forOrgId } : undefined
  if (year >= todayYear && isMonthAllowed(month, year)) {
    await Promise.all(
      categoryList
        .filter((c) => Array.isArray(c.days_of_week) && c.days_of_week.length > 0)
        .map((c) => ensureTrainingsForYear(c.id, c.days_of_week, year, ensureOpts)),
    )
  }

  // Step 3: fan out the actual counts/lists in parallel
  const membersCountQuery = selectedCategoryId
    ? supabase
        .from('member_categories')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('category_id', selectedCategoryId)
    : supabase
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)

  const monthTrainingsQuery = supabase
    .from('trainings')
    .select('id, status, category_id')
    .eq('organization_id', orgId)
    .gte('date', `${year}-${mm}-01`)
    .lte('date', `${year}-${mm}-${String(lastDay).padStart(2, '0')}`)

  const upcomingTrainingsQuery = supabase
    .from('trainings')
    .select('id, category_id, date, status')
    .eq('organization_id', orgId)
    .gte('date', todayStr)
    .neq('status', 'cancelled')
    .order('date', { ascending: true })
    .limit(14)

  const pendingQuery = supabase
    .from('monthly_payments')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('month', month)
    .eq('year', year)
    .eq('is_monthly_payer', true)
    .eq('payment_status', 'pending')

  if (selectedCategoryId) {
    monthTrainingsQuery.eq('category_id', selectedCategoryId)
    upcomingTrainingsQuery.eq('category_id', selectedCategoryId)
    pendingQuery.eq('category_id', selectedCategoryId)
  }

  const [
    { count: membersCount },
    { data: monthTrainings },
    { data: upcomingTrainings },
    { count: pendingCount },
  ] = await Promise.all([
    membersCountQuery,
    monthTrainingsQuery,
    upcomingTrainingsQuery,
    pendingQuery,
  ])
  const visibleCategories = selectedCategoryId
    ? categoryList.filter((c) => c.id === selectedCategoryId)
    : categoryList
  const selectedCategory = selectedCategoryId
    ? categoryList.find((c) => c.id === selectedCategoryId)
    : null

  // Agrega treinos efetivos (não cancelados) por categoria do mês selecionado.
  // Usado tanto no card "Treinos" quanto na lista de categorias (ajuste 2) e no
  // cálculo dinâmico dos preços mensais que dependem da quantidade real de
  // treinos do mês quando `method='avulso_x_qty'` (ajuste 4).
  const monthTrainingRows = (monthTrainings ?? []) as { status: string; category_id: string }[]
  const effectiveMonthTrainings = monthTrainingRows.filter((t) => t.status !== 'cancelled')
  const trainingsByCategory = new Map<string, number>()
  for (const t of effectiveMonthTrainings) {
    trainingsByCategory.set(t.category_id, (trainingsByCategory.get(t.category_id) ?? 0) + 1)
  }

  // Stats do dashboard — mapeiam o que o app entrega de valor pro
  // contratante/coord, na ordem que o owner pediu:
  //   1. Atletas cadastrados (na org ou na categoria filtrada)
  //   2. Categorias (total ou 1 se selecionada)
  //   3. Treinos neste mês (não-cancelados)
  //   4. Pagamentos pendentes (atletas com attendance/monthly pendente)
  const stats = [
    {
      title: 'Atletas',
      value: membersCount ?? 0,
      icon: Users,
      description: selectedCategoryId ? 'na categoria' : 'cadastrados no clube',
      color: 'text-blue-600 bg-blue-50',
      accent: 'border-l-blue-500',
    },
    {
      title: 'Categorias',
      value: selectedCategoryId ? 1 : categoryList.length,
      icon: TrendingUp,
      description: selectedCategoryId ? 'selecionada' : 'modalidades ativas',
      color: 'text-emerald-600 bg-emerald-50',
      accent: 'border-l-emerald-500',
    },
    {
      title: 'Treinos',
      value: effectiveMonthTrainings.length,
      icon: CalendarDays,
      description: 'neste mês',
      color: 'text-amber-600 bg-amber-50',
      accent: 'border-l-amber-500',
    },
    {
      title: 'Pagamentos pendentes',
      value: pendingCount ?? 0,
      icon: DollarSign,
      description: pendingCount && pendingCount > 0 ? 'em aberto' : 'tudo em dia',
      color: 'text-rose-600 bg-rose-50',
      accent: 'border-l-rose-500',
    },
  ]

  const upcomingList = (upcomingTrainings ?? []) as TrainingRow[]

  return (
    <div className="space-y-6 fade-in">
      {/* Month picker + category filter — centered, lives inside page content (not floating in header) */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <MonthPicker emphasized />
        <CategoryFilter categories={categoryList} selectedId={selectedCategoryId} />
      </div>

      {/* Título (omitted when a parent page owns its own header) */}
      {showHeading && (
        <div>
          <h2 className="text-xl font-semibold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Visão Geral
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Resumo de {monthLabel}
            {selectedCategory && (
              <>
                {' · '}
                <span className="font-medium text-foreground/70">{selectedCategory.name}</span>
              </>
            )}
          </p>
        </div>
      )}
      {!showHeading && (
        <p className="text-xs text-muted-foreground text-center">
          Resumo de {monthLabel}
          {selectedCategory && (
            <>
              {' · '}
              <span className="font-medium text-foreground/70">{selectedCategory.name}</span>
            </>
          )}
        </p>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.title}
            className={`bg-card rounded-xl border border-border/50 border-l-[3px] ${stat.accent} p-4 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] hover:shadow-[0_2px_8px_0_rgb(0_0_0/0.06)] transition-shadow`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {stat.title}
              </span>
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl font-bold tracking-tight">{stat.value}</div>
            <p className="text-xs text-muted-foreground mt-0.5">{stat.description}</p>
          </div>
        ))}
      </div>

      {/* Cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Categorias */}
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
            <h3 className="text-sm font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Categorias
            </h3>
            <Link
              href={categoriesHref}
              className="text-xs text-primary/70 hover:text-primary flex items-center gap-0.5 transition-colors"
            >
              Ver todas <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="p-2">
            {visibleCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                {selectedCategoryId ? 'Categoria não encontrada.' : 'Nenhuma categoria cadastrada.'}
              </p>
            ) : (
              <div className="space-y-0.5">
                {visibleCategories.map((cat) => {
                  const monthCount = trainingsByCategory.get(cat.id) ?? 0
                  return (
                  <Link
                    key={cat.id}
                    href={`${categoryLinkPrefix}/${cat.id}`}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors group"
                  >
                    {cat.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cat.logo_url}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-lg border border-border/40 bg-muted/30 object-contain"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                        <CalendarDays className="h-4 w-4" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                        {cat.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {cat.days_of_week.join(', ')}
                        <span className="mx-1 text-border">|</span>
                        {cat.start_time}–{cat.end_time}
                        <span className="mx-1 text-border">|</span>
                        <span className="text-foreground/70 font-medium">
                          {monthCount} {monthCount === 1 ? 'treino' : 'treinos'}
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {PRICE_PILLS.map((p) => {
                          const enabled = cat[p.flag as keyof CategoryRow] as boolean
                          if (!enabled) return null
                          // Para o tier mensal em `avulso_x_qty`, o preço real depende
                          // da quantidade de treinos do mês visualizado — não do valor
                          // snapshot em `price_monthly` salvo no último update da
                          // categoria. Recalcula com a contagem real.
                          let value = cat[p.price as keyof CategoryRow] as number
                          if (p.key === 'monthly' && cat.monthly_method === 'avulso_x_qty') {
                            value = calcTierPrice(
                              cat.price_drop_in,
                              cat.monthly_method,
                              0,
                              monthCount,
                              cat.monthly_discount_type,
                              cat.monthly_discount_value,
                            )
                          }
                          return (
                            <span
                              key={p.key}
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${p.color}`}
                            >
                              {p.label} R${Number(value).toFixed(0)}{p.suffix}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Próximos treinos — 14 em rolagem de 4 */}
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
            <h3 className="text-sm font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Próximos treinos
            </h3>
            <Link
              href={trainingsHref}
              className="text-xs text-primary/70 hover:text-primary flex items-center gap-0.5 transition-colors"
            >
              Ver todos <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="p-2">
            {upcomingList.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Nenhum treino agendado{selectedCategoryId ? ' para esta categoria' : ''}.
              </p>
            ) : (
              // ~54px per row · 4 rows ≈ 232px → scroll reveals rows 5–14
              <div className="space-y-0.5 overflow-y-auto pr-1" style={{ maxHeight: '232px' }}>
                {upcomingList.map((training) => {
                  const cat = categoryList.find((c) => c.id === training.category_id)
                  const isDone = training.status === 'done'
                  return (
                    <div
                      key={training.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDone ? 'bg-emerald-500' : 'bg-blue-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{cat?.name ?? 'Categoria'}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(training.date + 'T00:00:00').toLocaleDateString('pt-BR', {
                            weekday: 'long',
                            day: '2-digit',
                            month: 'long',
                          })}
                        </p>
                      </div>
                      {isDone && (
                        <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                          Realizado
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Local types & constants ───────────────────────────────────────────────

const PRICE_PILLS = [
  { key: 'drop_in',    flag: 'has_drop_in',    price: 'price_drop_in',    label: 'Avulso',    suffix: '',      color: 'bg-amber-50 text-amber-700' },
  { key: 'weekly',     flag: 'has_weekly',     price: 'price_weekly',     label: 'Semanal',   suffix: '/sem',  color: 'bg-blue-50 text-blue-700' },
  { key: 'monthly',    flag: 'has_monthly',    price: 'price_monthly',    label: 'Mensal',    suffix: '/mês',  color: 'bg-emerald-50 text-emerald-700' },
  { key: 'semiannual', flag: 'has_semiannual', price: 'price_semiannual', label: 'Semestral', suffix: '/sem', color: 'bg-violet-50 text-violet-700' },
  { key: 'annual',     flag: 'has_annual',     price: 'price_annual',     label: 'Anual',     suffix: '/ano',  color: 'bg-rose-50 text-rose-700' },
] as const

interface CategoryRow {
  id: string
  name: string
  logo_url: string | null
  days_of_week: string[]
  start_time: string
  end_time: string
  has_drop_in: boolean
  price_drop_in: number
  has_weekly: boolean
  price_weekly: number
  has_monthly: boolean
  price_monthly: number
  /** Método de cálculo do tier mensal — precisamos dele para saber quando o
   *  preço real depende da quantidade dinâmica de treinos do mês. */
  monthly_method: PricingMethod
  monthly_discount_type: DiscountType
  monthly_discount_value: number
  has_semiannual: boolean
  price_semiannual: number
  has_annual: boolean
  price_annual: number
}

interface TrainingRow {
  id: string
  category_id: string
  date: string
  status: 'scheduled' | 'done' | 'cancelled'
}
