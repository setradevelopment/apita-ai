'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getPasswordError } from '@/lib/validators/password'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function updateProfile(name: string) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Não autenticado')
  const { error } = await supabase
    .from('profiles')
    .update({ name: name.trim() })
    .eq('id', user.id)
  if (error) throw new Error(error.message)
  revalidatePath('/profile')
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const passwordError = getPasswordError(newPassword)
  if (passwordError) throw new Error(passwordError)
  if (currentPassword === newPassword) throw new Error('A nova senha deve ser diferente da atual')

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user?.email) throw new Error('Não autenticado')
  // Verify current password by re-authenticating
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  })
  if (signInError) throw new Error('Senha atual incorreta')
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw new Error(error.message)

  // Clear the forced-change flag so the user can proceed normally from now on.
  // Works both for the voluntary change flow (flag is null, no-op) and for the
  // post-reset forced flow (flag was set by superAdminUpdateOrgAdmin / adminResetPassword).
  await supabase
    .from('profiles')
    .update({ password_reset_at: null })
    .eq('id', user.id)
}
