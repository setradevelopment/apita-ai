import { redirect } from 'next/navigation'
import { Trophy, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ChangePasswordForm } from './change-password-form'

export default async function ChangePasswordRequiredPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, password_reset_at')
    .eq('id', user.id)
    .single()

  // If there's no pending reset flag, no reason to be here — send them on.
  if (!profile?.password_reset_at) {
    const role = profile?.role ?? 'member'
    redirect(role === 'super_admin' ? '/admin' : '/dashboard')
  }

  const role = profile?.role ?? 'member'
  const redirectTo = role === 'super_admin' ? '/admin' : '/dashboard'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-[420px] space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
            <Trophy className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Apita aí
          </h1>
        </div>

        <div className="flex items-start gap-2.5 text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 px-4 py-3 rounded-lg border border-amber-200 dark:border-amber-800">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold block">Senha redefinida recentemente.</strong>
            Por segurança, defina uma nova senha antes de continuar.
          </div>
        </div>

        <div className="space-y-1">
          <h2
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Definir nova senha
          </h2>
          <p className="text-muted-foreground text-sm">
            Informe a senha atual (a que você recebeu do responsável) e escolha uma nova.
          </p>
        </div>

        <ChangePasswordForm redirectTo={redirectTo} />
      </div>
    </div>
  )
}
