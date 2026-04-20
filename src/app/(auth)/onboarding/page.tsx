import { redirect } from 'next/navigation'
import { Trophy, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { OnboardingForm } from './onboarding-form'

/**
 * Onboarding obrigatório do 1º acesso.
 *
 * Regras de admissão:
 * - Não logado → `/login`
 * - `profile_completed_at` já preenchido → redireciona para onde deveria ir
 *   (evita usuários "voltarem" aqui pela URL).
 * - Super_admin não passa por aqui (o layout de `(dashboard)` já redireciona
 *   para `/admin` antes de chegar neste gate).
 *
 * O gate inverso — "bloquear dashboard enquanto profile_completed_at é NULL"
 * — vive em `(dashboard)/layout.tsx`. As duas checagens se complementam:
 * uma impede de sair daqui cedo, a outra impede de pular o onboarding.
 */
export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, profile_completed_at, name, dob, cpf, rg, origin_type, origin_street, origin_neighborhood, origin_zip, destination_type, destination_street, destination_neighborhood, destination_zip')
    .eq('id', user.id)
    .single()

  // Já completou — não faz sentido voltar aqui.
  if (profile?.profile_completed_at) {
    const role = profile?.role ?? 'member'
    redirect(role === 'super_admin' ? '/admin' : '/dashboard')
  }

  // Super_admin não deveria passar pelo onboarding, mas se caiu aqui por
  // alguma razão (conta muito antiga sem backfill), redireciona.
  if (profile?.role === 'super_admin') {
    redirect('/admin')
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center py-10 px-4">
      <div className="w-full max-w-[640px] space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
            <Trophy className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Apita aí
          </h1>
        </div>

        <div className="flex items-start gap-2.5 text-sm text-sky-800 bg-sky-50 dark:bg-sky-950/30 dark:text-sky-300 px-4 py-3 rounded-lg border border-sky-200 dark:border-sky-800">
          <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold block">Bem-vindo(a) ao Apita aí!</strong>
            Antes de acessar a plataforma, precisamos que você complete seu cadastro. Todos os campos abaixo são obrigatórios.
          </div>
        </div>

        <div className="space-y-1">
          <h2
            className="text-xl font-semibold tracking-tight"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Complete seu cadastro
          </h2>
          <p className="text-muted-foreground text-sm">
            Essas informações são necessárias para inscrições em torneios, comunicação e logística de treinos.
          </p>
        </div>

        <OnboardingForm
          initial={{
            name: profile?.name ?? '',
            dob: profile?.dob ?? '',
            cpf: profile?.cpf ?? '',
            rg: profile?.rg ?? '',
            origin_type: profile?.origin_type ?? 'casa',
            origin_street: profile?.origin_street ?? '',
            origin_neighborhood: profile?.origin_neighborhood ?? '',
            origin_zip: profile?.origin_zip ?? '',
            destination_type: profile?.destination_type ?? 'casa',
            destination_street: profile?.destination_street ?? '',
            destination_neighborhood: profile?.destination_neighborhood ?? '',
            destination_zip: profile?.destination_zip ?? '',
          }}
        />
      </div>
    </div>
  )
}
