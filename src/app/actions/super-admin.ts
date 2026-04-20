'use server'

import crypto from 'crypto'
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

// ── Types ─────────────────────────────────────────────────────────────────

export interface Organization {
  id: string
  name: string
  slug: string
  owner_user_id: string | null
  plan: string
  active: boolean
  created_at: string
  updated_at: string
  responsible_name: string | null
  whatsapp: string | null
  document: string | null
  document_type: 'cpf' | 'cnpj' | null
  subscription_status: 'pending_payment' | 'active' | 'suspended' | 'cancelled'
  coupon_code: string | null
  signup_email: string | null
  logo_url: string | null
}

export interface AdminUserRow {
  id: string
  email: string
  name: string
  role: string
  organization_id: string | null
  org_name: string | null
  created_at: string
}

// ── Organizations ─────────────────────────────────────────────────────────

export async function listOrganizations(): Promise<Organization[]> {
  await assertSuperAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Organization[]
}

export async function createOrganization(data: {
  name: string
  slug: string
  plan: string
}): Promise<void> {
  await assertSuperAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('organizations').insert({
    name: data.name,
    slug: data.slug.toLowerCase().replace(/\s+/g, '-'),
    plan: data.plan,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/admin/organizations')
  revalidatePath('/admin')
}

export async function updateOrganization(
  id: string,
  data: {
    name?: string
    slug?: string
    plan?: string
    active?: boolean
    responsible_name?: string | null
    whatsapp?: string | null
    document?: string | null
    document_type?: 'cpf' | 'cnpj' | null
    subscription_status?: 'pending_payment' | 'active' | 'suspended' | 'cancelled'
    coupon_code?: string | null
  }
): Promise<void> {
  await assertSuperAdmin()
  const supabase = await createClient()
  const { error } = await supabase
    .from('organizations')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/organizations')
  revalidatePath('/admin')
}

export async function deleteOrganization(id: string): Promise<void> {
  await assertSuperAdmin()
  const supabase = await createClient()
  const { error } = await supabase.from('organizations').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/admin/organizations')
  revalidatePath('/admin')
}

// ── Users ─────────────────────────────────────────────────────────────────

export async function listAllUsersForAdmin(): Promise<AdminUserRow[]> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  const [
    { data: authData, error: authError },
    { data: profiles },
    { data: orgs },
  ] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from('profiles').select('id, name, role, organization_id'),
    admin.from('organizations').select('id, name'),
  ])

  if (authError) throw new Error(authError.message)

  return (authData.users ?? [])
    .map((u) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = profiles?.find((p: any) => p.id === u.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const org = orgs?.find((o: any) => o.id === profile?.organization_id)
      return {
        id: u.id,
        email: u.email ?? '',
        name: profile?.name ?? '',
        role: profile?.role ?? 'member',
        organization_id: profile?.organization_id ?? null,
        org_name: org?.name ?? null,
        created_at: u.created_at ?? '',
      }
    })
}

// ── Organization Drilldown ────────────────────────────────────────────────

export interface OrganizationDetail {
  org: Organization
  counts: {
    categories: number
    members: number
    users: number
    trainings: number
    openInvoicesCount: number
    openInvoicesSum: number
  }
}

export async function getOrganizationDetail(orgId: string): Promise<OrganizationDetail> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  const { data: org, error } = await admin
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single()
  if (error || !org) throw new Error('Organização não encontrada')

  const [
    { count: categoriesCount },
    { count: membersCount },
    { count: usersCount },
    { count: trainingsCount },
    { data: openInvoices },
  ] = await Promise.all([
    admin.from('categories').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
    admin.from('members').select('*', { count: 'exact', head: true }).eq('organization_id', orgId).eq('active', true),
    admin.from('profiles').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
    admin.from('trainings').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
    admin
      .from('subscription_invoices')
      .select('amount, status')
      .eq('organization_id', orgId)
      .in('status', ['pending', 'overdue']),
  ])

  const openInvoicesSum = (openInvoices ?? []).reduce(
    (acc: number, inv: { amount: number | string }) => acc + Number(inv.amount ?? 0),
    0,
  )

  return {
    org: org as Organization,
    counts: {
      categories: categoriesCount ?? 0,
      members: membersCount ?? 0,
      users: usersCount ?? 0,
      trainings: trainingsCount ?? 0,
      openInvoicesCount: (openInvoices ?? []).length,
      openInvoicesSum,
    },
  }
}

export interface OrganizationAdminUser {
  userId: string | null
  email: string | null
  name: string | null
  whatsapp: string | null
  responsible_name: string | null
}

/**
 * Resolves the admin user of an organization.
 * Priority: `organizations.owner_user_id`, fallback to oldest profile with role='admin' in that org.
 */
async function resolveOrgAdminUserId(orgId: string): Promise<string | null> {
  const admin = createAdminClient()

  const { data: org } = await admin
    .from('organizations')
    .select('owner_user_id')
    .eq('id', orgId)
    .single()
  if (org?.owner_user_id) return org.owner_user_id as string

  const { data: profile } = await admin
    .from('profiles')
    .select('id')
    .eq('organization_id', orgId)
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (profile?.id as string | undefined) ?? null
}

export async function getOrganizationAdminUser(orgId: string): Promise<OrganizationAdminUser> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('responsible_name, whatsapp')
    .eq('id', orgId)
    .single()
  if (orgError || !org) throw new Error('Organização não encontrada')

  const adminUserId = await resolveOrgAdminUserId(orgId)
  if (!adminUserId) {
    return {
      userId: null,
      email: null,
      name: null,
      whatsapp: (org.whatsapp as string | null) ?? null,
      responsible_name: (org.responsible_name as string | null) ?? null,
    }
  }

  const [{ data: authUser }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(adminUserId),
    admin.from('profiles').select('name').eq('id', adminUserId).single(),
  ])

  return {
    userId: adminUserId,
    email: authUser?.user?.email ?? null,
    name: (profile?.name as string | null) ?? null,
    whatsapp: (org.whatsapp as string | null) ?? null,
    responsible_name: (org.responsible_name as string | null) ?? null,
  }
}

export interface UpdateOrgAdminResult {
  generatedPassword?: string
}

/**
 * Super_admin updates the admin contratante's data, optionally resetting their password.
 * Touches three tables: `auth.users` (email/password), `profiles` (name), `organizations`
 * (whatsapp + responsible_name — the contratante-level contact metadata).
 *
 * When `resetPassword: true` is passed, a fresh random password is generated and returned
 * ONCE so the UI can show it to the super_admin to hand over to the contratante.
 */
export async function superAdminUpdateOrgAdmin(
  orgId: string,
  data: {
    name?: string
    email?: string
    whatsapp?: string | null
    responsible_name?: string | null
    resetPassword?: boolean
  },
): Promise<UpdateOrgAdminResult> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  const adminUserId = await resolveOrgAdminUserId(orgId)
  if (!adminUserId) {
    throw new Error('Nenhum admin encontrado para esta organização.')
  }

  const result: UpdateOrgAdminResult = {}

  // 1. Auth-level updates (email + optional password reset)
  const authUpdates: { email?: string; password?: string } = {}
  if (data.email !== undefined && data.email !== '') authUpdates.email = data.email
  if (data.resetPassword) {
    const newPassword = crypto.randomBytes(9).toString('base64url') // 12 chars, url-safe
    authUpdates.password = newPassword
    result.generatedPassword = newPassword
  }
  if (Object.keys(authUpdates).length > 0) {
    const { error } = await admin.auth.admin.updateUserById(adminUserId, authUpdates)
    if (error) throw new Error(error.message)
  }

  // 2. Profile-level updates (name only for now — whatsapp lives on organizations)
  // Also stamp password_reset_at when password was just reset, so the dashboard
  // forces the user to set a new password on next login (within 24h window).
  const profileUpdates: Record<string, unknown> = {}
  if (data.name !== undefined) profileUpdates.name = data.name
  if (data.resetPassword) profileUpdates.password_reset_at = new Date().toISOString()
  if (Object.keys(profileUpdates).length > 0) {
    const { error } = await admin
      .from('profiles')
      .update(profileUpdates)
      .eq('id', adminUserId)
    if (error) throw new Error(error.message)
  }

  // 3. Organization-level updates (responsible_name + whatsapp — contratante contact)
  const orgUpdates: Record<string, unknown> = {}
  if (data.whatsapp !== undefined) orgUpdates.whatsapp = data.whatsapp
  if (data.responsible_name !== undefined) orgUpdates.responsible_name = data.responsible_name
  if (Object.keys(orgUpdates).length > 0) {
    orgUpdates.updated_at = new Date().toISOString()
    const { error } = await admin.from('organizations').update(orgUpdates).eq('id', orgId)
    if (error) throw new Error(error.message)
  }

  revalidatePath(`/admin/organizations/${orgId}`, 'layout')
  revalidatePath('/admin/organizations')
  return result
}
