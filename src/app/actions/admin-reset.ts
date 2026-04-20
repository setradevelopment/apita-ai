'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Resets the entire database, keeping only the super_admin caller's account.
 * This is a destructive test-only action — requires explicit super_admin role.
 */
export async function resetDatabase(): Promise<{ success: boolean; message: string }> {
  const supabase = await createClient()
  const {
    data: { user: caller },
  } = await supabase.auth.getUser()
  if (!caller) throw new Error('Não autenticado')

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', caller.id)
    .single()
  if (callerProfile?.role !== 'super_admin') {
    throw new Error('Acesso restrito a super_admin')
  }

  const admin = createAdminClient()

  // 1. Delete data in FK-safe order (most dependent tables first)
  const deleteOrder: { table: string; filter?: string }[] = [
    { table: 'monthly_payments' },
    { table: 'member_attendances' },
    { table: 'attendances' },
    { table: 'member_category_positions' },
    { table: 'member_categories' },
    { table: 'user_categories' },
    { table: 'trainings' },
    { table: 'members' },
    { table: 'categories' },
    { table: 'positions' },
    { table: 'financials' },
    { table: 'coupons' },
    { table: 'organizations' },
  ]

  for (const { table } of deleteOrder) {
    // Try deleting all rows; ignore errors for tables that don't exist in this schema
    try {
      const { error } = await admin.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (error && !error.message.toLowerCase().includes('does not exist')) {
        // Table exists but delete failed — surface error
        throw new Error(`Falha ao limpar ${table}: ${error.message}`)
      }
    } catch (err) {
      // Ignore nonexistent tables; rethrow real errors
      if (err instanceof Error && !err.message.toLowerCase().includes('does not exist')) {
        throw err
      }
    }
  }

  // 2. Delete all auth users except caller
  const { data: listData, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw new Error(listError.message)

  const users = listData?.users ?? []
  let deletedUsers = 0
  for (const u of users) {
    if (u.id === caller.id) continue
    const { error: delError } = await admin.auth.admin.deleteUser(u.id)
    if (!delError) deletedUsers++
  }

  // 3. Delete profile rows for deleted users (in case FK cascade did not fire)
  await admin.from('profiles').delete().neq('id', caller.id)

  revalidatePath('/admin')
  revalidatePath('/admin/organizations')

  return {
    success: true,
    message: `Banco resetado. ${deletedUsers} usuário(s) removido(s). Apenas sua conta super_admin permanece.`,
  }
}
