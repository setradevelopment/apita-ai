'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'super_admin') {
    throw new Error('Acesso restrito a super_admin')
  }
}

export interface Coupon {
  id: string
  code: string
  description: string | null
  observation: string | null
  discount_type: 'fixed' | 'percent'
  discount_value: number
  max_uses: number | null
  uses_count: number
  valid_from: string | null
  expires_at: string | null
  active: boolean
  created_at: string
}

export interface CouponInput {
  code: string
  description?: string | null
  observation?: string | null
  discount_type: 'fixed' | 'percent'
  discount_value: number
  max_uses?: number | null
  valid_from?: string | null
  expires_at?: string | null
  active?: boolean
}

export async function listCoupons(): Promise<Coupon[]> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Coupon[]
}

export async function createCoupon(
  input: CouponInput,
): Promise<{ success: boolean; error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  const code = input.code.trim().toUpperCase()
  if (!code) return { success: false, error: 'Código obrigatório' }
  if (!input.discount_type || !['fixed', 'percent'].includes(input.discount_type)) {
    return { success: false, error: 'Tipo de desconto inválido' }
  }
  if (!input.discount_value || input.discount_value <= 0) {
    return { success: false, error: 'Desconto deve ser maior que zero' }
  }
  if (input.discount_type === 'percent' && input.discount_value > 100) {
    return { success: false, error: 'Desconto percentual não pode exceder 100%' }
  }

  const { error } = await admin.from('coupons').insert({
    code,
    description: input.description ?? null,
    observation: input.observation ?? null,
    discount_type: input.discount_type,
    discount_value: input.discount_value,
    max_uses: input.max_uses ?? null,
    valid_from: input.valid_from ?? null,
    expires_at: input.expires_at ?? null,
    active: input.active ?? true,
  })
  if (error) {
    if (error.code === '23505') return { success: false, error: 'Já existe um cupom com esse código' }
    return { success: false, error: error.message }
  }
  revalidatePath('/admin/coupons')
  return { success: true }
}

export async function updateCoupon(
  id: string,
  input: Partial<CouponInput>,
): Promise<{ success: boolean; error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  const update: Record<string, unknown> = {}
  if (input.code !== undefined) {
    const code = input.code.trim().toUpperCase()
    if (!code) return { success: false, error: 'Código obrigatório' }
    update.code = code
  }
  if (input.description !== undefined) update.description = input.description
  if (input.observation !== undefined) update.observation = input.observation
  if (input.discount_type !== undefined) update.discount_type = input.discount_type
  if (input.discount_value !== undefined) {
    if (input.discount_value <= 0) return { success: false, error: 'Desconto deve ser maior que zero' }
    update.discount_value = input.discount_value
  }
  if (input.max_uses !== undefined) update.max_uses = input.max_uses
  if (input.valid_from !== undefined) update.valid_from = input.valid_from
  if (input.expires_at !== undefined) update.expires_at = input.expires_at
  if (input.active !== undefined) update.active = input.active

  const { error } = await admin.from('coupons').update(update).eq('id', id)
  if (error) {
    if (error.code === '23505') return { success: false, error: 'Já existe um cupom com esse código' }
    return { success: false, error: error.message }
  }
  revalidatePath('/admin/coupons')
  return { success: true }
}

export async function deleteCoupon(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('coupons').delete().eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/coupons')
  return { success: true }
}

export async function toggleCouponActive(
  id: string,
  active: boolean,
): Promise<{ success: boolean; error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('coupons').update({ active }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/coupons')
  return { success: true }
}
