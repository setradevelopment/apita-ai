'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function assertSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
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

export type SubscriptionInvoiceStatus = 'paid' | 'pending' | 'overdue' | 'cancelled'

export interface SubscriptionInvoice {
  id: string
  organization_id: string
  issue_date: string | null
  due_date: string
  amount: number
  status: SubscriptionInvoiceStatus
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CreateInvoiceData {
  issue_date?: string | null
  due_date: string
  amount: number
  status?: SubscriptionInvoiceStatus
  notes?: string | null
}

export interface UpdateInvoiceData {
  issue_date?: string | null
  due_date?: string
  amount?: number
  status?: SubscriptionInvoiceStatus
  paid_at?: string | null
  notes?: string | null
}

function revalidateOrgInvoices(orgId: string) {
  revalidatePath(`/admin/organizations/${orgId}/billing`)
  revalidatePath(`/admin/organizations/${orgId}`, 'layout')
}

export async function listOrgInvoices(orgId: string): Promise<SubscriptionInvoice[]> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('subscription_invoices')
    .select('*')
    .eq('organization_id', orgId)
    .order('due_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    ...(row as SubscriptionInvoice),
    amount: Number((row as { amount: number | string }).amount),
  }))
}

export async function createInvoice(orgId: string, data: CreateInvoiceData): Promise<void> {
  await assertSuperAdmin()
  if (!data.due_date) throw new Error('Data de vencimento é obrigatória')
  if (!Number.isFinite(data.amount) || data.amount <= 0) {
    throw new Error('Valor deve ser maior que zero')
  }

  const admin = createAdminClient()
  const { error } = await admin.from('subscription_invoices').insert({
    organization_id: orgId,
    issue_date: data.issue_date ?? null,
    due_date: data.due_date,
    amount: data.amount,
    status: data.status ?? 'pending',
    notes: data.notes ?? null,
  })
  if (error) throw new Error(error.message)
  revalidateOrgInvoices(orgId)
}

export async function updateInvoice(id: string, data: UpdateInvoiceData): Promise<void> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  // Look up org_id for targeted revalidation
  const { data: current, error: fetchError } = await admin
    .from('subscription_invoices')
    .select('organization_id')
    .eq('id', id)
    .single()
  if (fetchError || !current) throw new Error('Parcela não encontrada')

  if (data.amount !== undefined && (!Number.isFinite(data.amount) || data.amount <= 0)) {
    throw new Error('Valor deve ser maior que zero')
  }

  const { error } = await admin
    .from('subscription_invoices')
    .update(data)
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidateOrgInvoices(current.organization_id as string)
}

export async function markInvoicePaid(id: string, paidAt?: string): Promise<void> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  const { data: current, error: fetchError } = await admin
    .from('subscription_invoices')
    .select('organization_id')
    .eq('id', id)
    .single()
  if (fetchError || !current) throw new Error('Parcela não encontrada')

  const { error } = await admin
    .from('subscription_invoices')
    .update({
      status: 'paid',
      paid_at: paidAt ?? new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
  revalidateOrgInvoices(current.organization_id as string)
}

export async function deleteInvoice(id: string): Promise<void> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  const { data: current, error: fetchError } = await admin
    .from('subscription_invoices')
    .select('organization_id')
    .eq('id', id)
    .single()
  if (fetchError || !current) throw new Error('Parcela não encontrada')

  const { error } = await admin.from('subscription_invoices').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidateOrgInvoices(current.organization_id as string)
}
