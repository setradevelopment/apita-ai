'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionContext } from '@/lib/auth/session'

// ── Tipos ──────────────────────────────────────────────────────────────

export interface ManualEntry {
  id: string
  category_id: string
  description: string
  amount: number
  occurred_on: string // YYYY-MM-DD
  notes: string | null
  created_by: string
  created_at: string
}

export interface ManualEntryInput {
  category_id: string
  description: string
  amount: number
  occurred_on: string
  notes?: string
}

/**
 * Caixa calculado de uma categoria no período.
 * - `auto_revenue`: soma de treinos pagos (attendance paid + monthly_payments paid)
 * - `manual_revenue`: soma de manual_revenues
 * - `total_revenue`: auto_revenue + manual_revenue
 * - `total_expense`: soma de manual_expenses
 * - `balance`: total_revenue - total_expense
 */
export interface CategoryCashFlow {
  category_id: string
  category_name: string
  auto_revenue: number
  manual_revenue: number
  total_revenue: number
  total_expense: number
  balance: number
  /** Contadores auxiliares pra UI (pendências a resolver). */
  pending_training_count: number
  awaiting_confirmation_count: number
}

/**
 * Item individual do detalhamento da receita automática de uma categoria.
 * Cada atleta × treino pago vira uma linha. Mensalistas têm 1 linha por
 * mês (o monthly_payment inteiro). Usado pelo sheet "drill-down" de
 * "Treinos - Categoria" no /financials.
 */
export interface TrainingRevenueBreakdownItem {
  kind: 'training' | 'monthly'
  /** Nome do atleta. */
  member_name: string
  /** Pra `training`: data do treino. Pra `monthly`: "MM/YYYY". */
  reference_label: string
  /** Referência ISO pra ordenação (training.date OU year-month-01). */
  sort_key: string
  /** Tipo de pagamento (drop_in, weekly, monthly, etc). */
  payment_type: string | null
  amount: number
}

// ── Helper comum: garante role ─────────────────────────────────────────

async function requireOrgAdminOrCoord() {
  const ctx = await getSessionContext()
  if (!ctx.orgId) throw new Error('Organização não definida.')
  if (ctx.role !== 'admin' && ctx.role !== 'coordinator') {
    throw new Error('Apenas contratante ou coordenador pode gerenciar finanças.')
  }
  return ctx
}

// ── Receitas manuais ───────────────────────────────────────────────────

export async function listManualRevenues(categoryId?: string): Promise<ManualEntry[]> {
  const ctx = await requireOrgAdminOrCoord()
  const admin = createAdminClient()
  const q = admin
    .from('manual_revenues')
    .select('id, category_id, description, amount, occurred_on, notes, created_by, created_at')
    .eq('organization_id', ctx.orgId!)
    .order('occurred_on', { ascending: false })
  if (categoryId) q.eq('category_id', categoryId)
  const { data } = await q
  return (data ?? []).map((r) => ({
    ...r,
    amount: Number(r.amount),
  }))
}

export async function createManualRevenue(input: ManualEntryInput): Promise<void> {
  const ctx = await requireOrgAdminOrCoord()
  validateManualInput(input)
  const admin = createAdminClient()

  const { error } = await admin.from('manual_revenues').insert({
    organization_id: ctx.orgId!,
    category_id: input.category_id,
    description: input.description.trim(),
    amount: input.amount,
    occurred_on: input.occurred_on,
    notes: input.notes?.trim() || null,
    created_by: ctx.user.id,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/financials')
}

export async function updateManualRevenue(
  id: string,
  input: ManualEntryInput,
): Promise<void> {
  const ctx = await requireOrgAdminOrCoord()
  validateManualInput(input)
  const admin = createAdminClient()

  // Verifica ownership (mesmo org)
  const { data: existing } = await admin
    .from('manual_revenues')
    .select('organization_id')
    .eq('id', id)
    .single()
  if (!existing || existing.organization_id !== ctx.orgId) {
    throw new Error('Registro não encontrado.')
  }

  const { error } = await admin
    .from('manual_revenues')
    .update({
      category_id: input.category_id,
      description: input.description.trim(),
      amount: input.amount,
      occurred_on: input.occurred_on,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/financials')
}

export async function deleteManualRevenue(id: string): Promise<void> {
  const ctx = await requireOrgAdminOrCoord()
  const admin = createAdminClient()
  await admin
    .from('manual_revenues')
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.orgId!)

  revalidatePath('/financials')
}

// ── Despesas manuais ───────────────────────────────────────────────────

export async function listManualExpenses(categoryId?: string): Promise<ManualEntry[]> {
  const ctx = await requireOrgAdminOrCoord()
  const admin = createAdminClient()
  const q = admin
    .from('manual_expenses')
    .select('id, category_id, description, amount, occurred_on, notes, created_by, created_at')
    .eq('organization_id', ctx.orgId!)
    .order('occurred_on', { ascending: false })
  if (categoryId) q.eq('category_id', categoryId)
  const { data } = await q
  return (data ?? []).map((r) => ({
    ...r,
    amount: Number(r.amount),
  }))
}

export async function createManualExpense(input: ManualEntryInput): Promise<void> {
  const ctx = await requireOrgAdminOrCoord()
  validateManualInput(input)
  const admin = createAdminClient()

  const { error } = await admin.from('manual_expenses').insert({
    organization_id: ctx.orgId!,
    category_id: input.category_id,
    description: input.description.trim(),
    amount: input.amount,
    occurred_on: input.occurred_on,
    notes: input.notes?.trim() || null,
    created_by: ctx.user.id,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/financials')
}

export async function updateManualExpense(
  id: string,
  input: ManualEntryInput,
): Promise<void> {
  const ctx = await requireOrgAdminOrCoord()
  validateManualInput(input)
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('manual_expenses')
    .select('organization_id')
    .eq('id', id)
    .single()
  if (!existing || existing.organization_id !== ctx.orgId) {
    throw new Error('Registro não encontrado.')
  }

  const { error } = await admin
    .from('manual_expenses')
    .update({
      category_id: input.category_id,
      description: input.description.trim(),
      amount: input.amount,
      occurred_on: input.occurred_on,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)

  revalidatePath('/financials')
}

export async function deleteManualExpense(id: string): Promise<void> {
  const ctx = await requireOrgAdminOrCoord()
  const admin = createAdminClient()
  await admin
    .from('manual_expenses')
    .delete()
    .eq('id', id)
    .eq('organization_id', ctx.orgId!)

  revalidatePath('/financials')
}

// ── Cálculo de caixa por categoria ─────────────────────────────────────

/**
 * Calcula o caixa de todas as categorias da org no período `[from, to]`.
 *
 * Fórmula da receita automática:
 *   • Para cada `member_attendances` com `payment_status='paid'`:
 *       - Se `payment_type='monthly'`: pula (a receita vem de `monthly_payments`
 *         pra evitar double-count; mensal é contrato mensal, não por treino).
 *       - Caso contrário: soma `category.price_{payment_type}`.
 *   • Para cada `monthly_payments` com `payment_status='paid'`:
 *       - Soma `category.price_monthly`.
 *
 * "Pending" e "awaiting_confirmation" NÃO entram na receita (ainda não é caixa).
 * "no_payment" e "refunded" também não entram.
 *
 * Essa fórmula fica aqui no TS em vez de função SQL porque precisamos cruzar
 * várias tabelas e a lógica de "pula monthly em attendances" não casa bem
 * com agregação SQL pura. Com um dataset típico de org (centenas de treinos,
 * não milhões), o custo de computar em memória é trivial.
 */
export async function computeCashFlow(
  from: string,
  to: string,
): Promise<CategoryCashFlow[]> {
  const ctx = await requireOrgAdminOrCoord()
  const admin = createAdminClient()
  const orgId = ctx.orgId!

  // 1. Carrega categorias com preços
  const { data: cats } = await admin
    .from('categories')
    .select('id, name, price_drop_in, price_weekly, price_monthly, price_semiannual, price_annual')
    .eq('organization_id', orgId)
    .order('display_order')
    .order('name')

  const categories = cats ?? []
  if (categories.length === 0) return []

  // Cache dos preços por categoria
  type PriceRow = typeof categories[number]
  const priceByCategoryId = new Map<string, PriceRow>()
  for (const c of categories) priceByCategoryId.set(c.id, c)

  // 2. Attendances do período (com treino pra pegar category_id e date)
  const { data: attendances } = await admin
    .from('member_attendances')
    .select(`
      payment_type, payment_status,
      trainings:training_id(category_id, date)
    `)
    .eq('organization_id', orgId)
    .gte('trainings.date', from)
    .lte('trainings.date', to)

  // 3. Monthly payments do período (month/year fall in [from, to])
  const fromYM = from.slice(0, 7)
  const toYM = to.slice(0, 7)
  const { data: monthlyRows } = await admin
    .from('monthly_payments')
    .select('category_id, month, year, payment_status')
    .eq('organization_id', orgId)

  // 4. Manual revenues e expenses do período
  const { data: manualRev } = await admin
    .from('manual_revenues')
    .select('category_id, amount, occurred_on')
    .eq('organization_id', orgId)
    .gte('occurred_on', from)
    .lte('occurred_on', to)

  const { data: manualExp } = await admin
    .from('manual_expenses')
    .select('category_id, amount, occurred_on')
    .eq('organization_id', orgId)
    .gte('occurred_on', from)
    .lte('occurred_on', to)

  // 5. Agrega por categoria
  const result: CategoryCashFlow[] = categories.map((c) => ({
    category_id: c.id,
    category_name: c.name,
    auto_revenue: 0,
    manual_revenue: 0,
    total_revenue: 0,
    total_expense: 0,
    balance: 0,
    pending_training_count: 0,
    awaiting_confirmation_count: 0,
  }))
  const byCategoryId = new Map<string, CategoryCashFlow>()
  for (const r of result) byCategoryId.set(r.category_id, r)

  // Attendances → receita automática (exceto monthly)
  type AttRow = {
    payment_type: string | null
    payment_status: string | null
    trainings: { category_id: string; date: string } | null
  }
  for (const a of (attendances ?? []) as unknown as AttRow[]) {
    const catId = a.trainings?.category_id
    if (!catId) continue
    const bucket = byCategoryId.get(catId)
    if (!bucket) continue

    if (a.payment_status === 'pending') bucket.pending_training_count++
    if (a.payment_status === 'awaiting_confirmation') bucket.awaiting_confirmation_count++

    if (a.payment_status !== 'paid') continue
    // Mensal vem de monthly_payments (evita double-count)
    if (!a.payment_type || a.payment_type === 'monthly') continue

    const cat = priceByCategoryId.get(catId)
    if (!cat) continue
    const priceField = `price_${a.payment_type}` as keyof PriceRow
    const priceVal = cat[priceField] as unknown as number | string | null
    const price = typeof priceVal === 'string' ? parseFloat(priceVal) : (priceVal ?? 0)
    bucket.auto_revenue += Number(price) || 0
  }

  // Monthly payments → receita automática (filtrados por month/year ∈ range)
  type MonthlyRow = {
    category_id: string
    month: number
    year: number
    payment_status: string | null
  }
  for (const m of (monthlyRows ?? []) as MonthlyRow[]) {
    const ym = `${m.year}-${String(m.month).padStart(2, '0')}`
    if (ym < fromYM || ym > toYM) continue

    const bucket = byCategoryId.get(m.category_id)
    if (!bucket) continue

    if (m.payment_status === 'pending') bucket.pending_training_count++
    if (m.payment_status === 'awaiting_confirmation') bucket.awaiting_confirmation_count++

    if (m.payment_status !== 'paid') continue
    const cat = priceByCategoryId.get(m.category_id)
    if (!cat) continue
    const priceVal = cat.price_monthly as unknown as number | string | null
    const price = typeof priceVal === 'string' ? parseFloat(priceVal) : (priceVal ?? 0)
    bucket.auto_revenue += Number(price) || 0
  }

  // Manual revenues
  for (const r of manualRev ?? []) {
    const bucket = byCategoryId.get(r.category_id)
    if (!bucket) continue
    bucket.manual_revenue += Number(r.amount) || 0
  }

  // Manual expenses
  for (const e of manualExp ?? []) {
    const bucket = byCategoryId.get(e.category_id)
    if (!bucket) continue
    bucket.total_expense += Number(e.amount) || 0
  }

  // Totais
  for (const r of result) {
    r.total_revenue = r.auto_revenue + r.manual_revenue
    r.balance = r.total_revenue - r.total_expense
  }

  return result
}

/**
 * Detalha "quem compôs" a receita automática (treinos) de uma categoria
 * no período. Retorna 1 linha por attendance paid (type != monthly) e 1
 * linha por monthly_payment paid. Usado pelo sheet de drill-down.
 *
 * Ordem: por data decrescente (mais recente primeiro).
 */
export async function listCategoryRevenueBreakdown(
  categoryId: string,
  from: string,
  to: string,
): Promise<TrainingRevenueBreakdownItem[]> {
  const ctx = await requireOrgAdminOrCoord()
  const admin = createAdminClient()
  const orgId = ctx.orgId!

  // Pega preço da categoria
  const { data: cat } = await admin
    .from('categories')
    .select('id, name, price_drop_in, price_weekly, price_monthly, price_semiannual, price_annual')
    .eq('id', categoryId)
    .eq('organization_id', orgId)
    .single()
  if (!cat) return []

  type CatRow = typeof cat

  // Attendances pagas no período (excluindo monthly — vem do monthly_payments)
  const { data: attendances } = await admin
    .from('member_attendances')
    .select(`
      payment_type, payment_status,
      trainings:training_id(date, category_id),
      members:member_id(name)
    `)
    .eq('organization_id', orgId)
    .eq('payment_status', 'paid')
    .neq('payment_type', 'monthly')

  // Monthly payments do período
  const { data: monthlies } = await admin
    .from('monthly_payments')
    .select(`
      month, year, payment_status,
      members:member_id(name)
    `)
    .eq('organization_id', orgId)
    .eq('category_id', categoryId)
    .eq('payment_status', 'paid')

  const items: TrainingRevenueBreakdownItem[] = []

  // Attendances → 1 item por atleta×treino
  type AttRow = {
    payment_type: string | null
    payment_status: string | null
    trainings: { date: string; category_id: string } | null
    members: { name: string } | null
  }
  for (const a of (attendances ?? []) as unknown as AttRow[]) {
    if (!a.trainings) continue
    if (a.trainings.category_id !== categoryId) continue
    if (a.trainings.date < from || a.trainings.date > to) continue

    const priceField = `price_${a.payment_type ?? 'drop_in'}` as keyof CatRow
    const priceVal = cat[priceField] as unknown as number | string | null
    const amount = typeof priceVal === 'string' ? parseFloat(priceVal) : Number(priceVal ?? 0)

    items.push({
      kind: 'training',
      member_name: a.members?.name ?? '—',
      reference_label: new Date(a.trainings.date + 'T00:00:00').toLocaleDateString('pt-BR'),
      sort_key: a.trainings.date,
      payment_type: a.payment_type,
      amount,
    })
  }

  // Monthly payments → 1 item por atleta×mês
  const fromYM = from.slice(0, 7)
  const toYM = to.slice(0, 7)
  type MonthlyRow = {
    month: number
    year: number
    payment_status: string | null
    members: { name: string } | null
  }
  for (const m of (monthlies ?? []) as unknown as MonthlyRow[]) {
    const ym = `${m.year}-${String(m.month).padStart(2, '0')}`
    if (ym < fromYM || ym > toYM) continue

    const priceVal = cat.price_monthly as unknown as number | string | null
    const amount = typeof priceVal === 'string' ? parseFloat(priceVal) : Number(priceVal ?? 0)

    items.push({
      kind: 'monthly',
      member_name: m.members?.name ?? '—',
      reference_label: `${String(m.month).padStart(2, '0')}/${m.year}`,
      sort_key: `${ym}-01`,
      payment_type: 'monthly',
      amount,
    })
  }

  // Ordena: mais recente primeiro (data desc)
  items.sort((a, b) => b.sort_key.localeCompare(a.sort_key))

  return items
}

// ── Helpers internos ───────────────────────────────────────────────────

function validateManualInput(input: ManualEntryInput) {
  if (!input.category_id) throw new Error('Selecione uma categoria.')
  const desc = input.description?.trim() ?? ''
  if (!desc) throw new Error('Informe a descrição.')
  if (!(input.amount > 0)) throw new Error('Valor deve ser maior que zero.')
  if (input.amount > 9_999_999.99) {
    throw new Error('Valor acima do limite (R$ 9.999.999,99).')
  }
  if (!input.occurred_on || !/^\d{4}-\d{2}-\d{2}$/.test(input.occurred_on)) {
    throw new Error('Data inválida.')
  }
}
