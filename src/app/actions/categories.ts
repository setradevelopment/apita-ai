'use server'

import { revalidatePath } from 'next/cache'
import { resolveTargetOrg, type TargetOrgOpts } from '@/lib/auth/resolve-org'
import { calcTierPrice, type PricingMethod, type DiscountType } from '@/lib/pricing'
import { getPlan } from '@/lib/plans'

interface TierConfig {
  enabled: boolean
  method: PricingMethod
  fixedPrice: number
  qty: number
  discountType: DiscountType
  discountValue: number
}

interface CategoryData {
  name: string
  days_of_week: string[]
  start_time: string
  end_time: string
  location: string
  observations?: string
  // Avulso
  has_drop_in: boolean
  price_drop_in: number
  // Tiers com configuração inteligente
  weekly: TierConfig
  monthly: TierConfig
  semiannual: TierConfig
  annual: TierConfig
}

function buildDbPayload(data: CategoryData) {
  const dropIn = data.price_drop_in

  return {
    name: data.name,
    days_of_week: data.days_of_week,
    start_time: data.start_time,
    end_time: data.end_time,
    location: data.location,
    observations: data.observations || null,

    has_drop_in: data.has_drop_in,
    price_drop_in: data.has_drop_in ? dropIn : 0,

    has_weekly: data.weekly.enabled,
    weekly_method: data.weekly.method,
    weekly_qty: data.weekly.qty,
    weekly_discount_type: data.weekly.discountType,
    weekly_discount_value: data.weekly.discountValue,
    price_weekly: data.weekly.enabled
      ? calcTierPrice(dropIn, data.weekly.method, data.weekly.fixedPrice, data.weekly.qty, data.weekly.discountType, data.weekly.discountValue)
      : 0,

    has_monthly: data.monthly.enabled,
    monthly_method: data.monthly.method,
    monthly_qty: data.monthly.qty,
    monthly_discount_type: data.monthly.discountType,
    monthly_discount_value: data.monthly.discountValue,
    price_monthly: data.monthly.enabled
      ? calcTierPrice(dropIn, data.monthly.method, data.monthly.fixedPrice, data.monthly.qty, data.monthly.discountType, data.monthly.discountValue)
      : 0,

    has_semiannual: data.semiannual.enabled,
    semiannual_method: data.semiannual.method,
    semiannual_qty: data.semiannual.qty,
    semiannual_discount_type: data.semiannual.discountType,
    semiannual_discount_value: data.semiannual.discountValue,
    price_semiannual: data.semiannual.enabled
      ? calcTierPrice(dropIn, data.semiannual.method, data.semiannual.fixedPrice, data.semiannual.qty, data.semiannual.discountType, data.semiannual.discountValue)
      : 0,

    has_annual: data.annual.enabled,
    annual_method: data.annual.method,
    annual_qty: data.annual.qty,
    annual_discount_type: data.annual.discountType,
    annual_discount_value: data.annual.discountValue,
    price_annual: data.annual.enabled
      ? calcTierPrice(dropIn, data.annual.method, data.annual.fixedPrice, data.annual.qty, data.annual.discountType, data.annual.discountValue)
      : 0,
  }
}

function revalidateForOrg(opts?: TargetOrgOpts, orgId?: string) {
  revalidatePath('/', 'layout')
  if (opts?.forOrgId && orgId) {
    revalidatePath(`/admin/organizations/${orgId}`, 'layout')
  }
}

export async function createCategory(data: CategoryData, opts?: TargetOrgOpts) {
  const { supabase, orgId, role, plan } = await resolveTargetOrg(opts?.forOrgId)

  // Enforce plan limits (super_admin bypasses)
  if (role !== 'super_admin') {
    const planDef = getPlan(plan)
    const { count } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
    if ((count ?? 0) >= planDef.max_categories) {
      throw new Error(
        `Limite de ${planDef.max_categories} categoria(s) do plano ${planDef.name} atingido. Faça upgrade para adicionar mais.`,
      )
    }
  }

  // Nova categoria entra no final da lista. Busca o MAX atual e soma 1 —
  // evita conflito com ordem existente e mantém o drag-and-drop previsível.
  const { data: maxRow } = await supabase
    .from('categories')
    .select('display_order')
    .eq('organization_id', orgId)
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextOrder = (maxRow?.display_order ?? 0) + 1

  const { error } = await supabase.from('categories').insert({
    ...buildDbPayload(data),
    organization_id: orgId,
    display_order: nextOrder,
  })
  if (error) throw new Error(error.message)
  revalidateForOrg(opts, orgId)
}

export async function updateCategory(id: string, data: CategoryData, opts?: TargetOrgOpts) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  const { error } = await supabase
    .from('categories')
    .update(buildDbPayload(data))
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidateForOrg(opts, orgId)
}

export async function deleteCategory(id: string, opts?: TargetOrgOpts) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidateForOrg(opts, orgId)
}

// Reordena em lote: recebe a lista completa de ids na nova ordem e persiste
// display_order = 1, 2, 3, … Chamada após um drag-end no settings.
// Gaps eventuais (ex.: categoria deletada entre o load e o save) são
// tolerados porque reescrevemos TODAS as rows com índice sequencial.
export async function reorderCategories(
  orderedIds: string[],
  opts?: TargetOrgOpts,
) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  if (orderedIds.length === 0) return

  // Uma UPDATE por id — simples e seguro dentro do escopo esperado
  // (planos atuais permitem até ~30 categorias por org).
  await Promise.all(
    orderedIds.map((id, idx) =>
      supabase
        .from('categories')
        .update({ display_order: idx + 1 })
        .eq('id', id)
        .eq('organization_id', orgId),
    ),
  )

  revalidateForOrg(opts, orgId)
}
