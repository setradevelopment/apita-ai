'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLANS, type PlanId } from '@/lib/plans'
import { getPasswordError } from '@/lib/validators/password'

export interface SignupData {
  // Step 1: contratante
  name: string // nome/razão social
  document: string // CPF ou CNPJ (apenas dígitos)
  document_type: 'cpf' | 'cnpj'
  email: string
  password: string
  organization_name: string
  responsible_name: string
  whatsapp: string
  coupon_code?: string
  // Step 2: plano
  plan: PlanId
}

export interface CouponValidation {
  valid: boolean
  discount_type?: 'fixed' | 'percent'
  discount_value?: number
  error?: string
}

export async function validateCoupon(code: string): Promise<CouponValidation> {
  if (!code || !code.trim()) return { valid: false, error: 'Código vazio' }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('coupons')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .eq('active', true)
    .maybeSingle()

  if (error || !data) return { valid: false, error: 'Cupom inválido ou inativo' }

  const now = new Date()

  if (data.valid_from && new Date(data.valid_from) > now) {
    return { valid: false, error: 'Cupom ainda não está ativo' }
  }

  if (data.expires_at && new Date(data.expires_at) < now) {
    return { valid: false, error: 'Cupom expirado' }
  }

  if (data.max_uses && data.uses_count >= data.max_uses) {
    return { valid: false, error: 'Cupom esgotado' }
  }

  return {
    valid: true,
    discount_type: data.discount_type,
    discount_value: Number(data.discount_value),
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .substring(0, 50)
}

export async function signupOrganization(data: SignupData): Promise<{ success: boolean; error?: string }> {
  // Basic validation
  if (!data.email || !data.password) return { success: false, error: 'E-mail e senha obrigatórios' }
  const passwordError = getPasswordError(data.password)
  if (passwordError) return { success: false, error: passwordError }
  if (!data.name || !data.organization_name) return { success: false, error: 'Nome e organização obrigatórios' }
  if (!PLANS[data.plan]) return { success: false, error: 'Plano inválido' }

  const digits = data.document.replace(/\D/g, '')
  if (data.document_type === 'cpf' && digits.length !== 11) {
    return { success: false, error: 'CPF deve ter 11 dígitos' }
  }
  if (data.document_type === 'cnpj' && digits.length !== 14) {
    return { success: false, error: 'CNPJ deve ter 14 dígitos' }
  }

  // Validate coupon if provided
  let couponValid = false
  if (data.coupon_code && data.coupon_code.trim()) {
    const validation = await validateCoupon(data.coupon_code)
    if (!validation.valid) return { success: false, error: validation.error ?? 'Cupom inválido' }
    couponValid = true
  }

  const admin = createAdminClient()

  // Check for duplicate email
  const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (existingUsers?.users.some((u) => u.email?.toLowerCase() === data.email.toLowerCase())) {
    return { success: false, error: 'E-mail já cadastrado' }
  }

  // 1. Create auth user
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { name: data.responsible_name || data.name, role: 'admin' },
  })
  if (createError || !newUser?.user) {
    return { success: false, error: createError?.message ?? 'Falha ao criar usuário' }
  }

  const uid = newUser.user.id

  // 2. Generate unique slug
  const baseSlug = slugify(data.organization_name) || 'org'
  let slug = baseSlug
  let counter = 1
  while (true) {
    const { data: existing } = await admin
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()
    if (!existing) break
    counter++
    slug = `${baseSlug}-${counter}`
  }

  // 3. Create organization
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({
      name: data.organization_name,
      slug,
      owner_user_id: uid,
      plan: data.plan,
      active: true,
      responsible_name: data.responsible_name,
      whatsapp: data.whatsapp,
      document: digits,
      document_type: data.document_type,
      subscription_status: 'pending_payment',
      coupon_code: couponValid ? data.coupon_code!.trim().toUpperCase() : null,
      signup_email: data.email,
    })
    .select('id')
    .single()

  if (orgError || !org) {
    // Rollback auth user
    await admin.auth.admin.deleteUser(uid)
    return { success: false, error: orgError?.message ?? 'Falha ao criar organização' }
  }

  // 4. Update profile (row was auto-created by trigger)
  //
  // `profile_completed_at = now()` isenta o contratante do onboarding — ele
  // é quem vai cadastrar os usuários dele, não um atleta sendo provisionado.
  // Os dados pessoais que o onboarding exigiria (CPF, RG, DOB, logística)
  // não fazem sentido para um contratante que pode ser pessoa jurídica.
  const { error: profileError } = await admin
    .from('profiles')
    .update({
      name: data.responsible_name || data.name,
      role: 'admin',
      organization_id: org.id,
      profile_completed_at: new Date().toISOString(),
    })
    .eq('id', uid)

  if (profileError) {
    // Rollback
    await admin.from('organizations').delete().eq('id', org.id)
    await admin.auth.admin.deleteUser(uid)
    return { success: false, error: profileError.message }
  }

  // 5. Increment coupon uses_count
  if (couponValid) {
    const code = data.coupon_code!.trim().toUpperCase()
    const { data: coupon } = await admin
      .from('coupons')
      .select('uses_count')
      .eq('code', code)
      .single()
    if (coupon) {
      await admin
        .from('coupons')
        .update({ uses_count: coupon.uses_count + 1 })
        .eq('code', code)
    }
  }

  // 6. Sign in user automatically
  const supabase = await createClient()
  await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  })

  revalidatePath('/dashboard')
  return { success: true }
}
