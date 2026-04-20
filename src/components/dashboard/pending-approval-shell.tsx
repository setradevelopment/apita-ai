'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, LogOut, Trophy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

/**
 * Tela "aguardando aprovação" — renderizada pelo `(dashboard)/layout.tsx`
 * quando o user logado é `role='member'` e seu row em `members` tem
 * `approved_at IS NULL`.
 *
 * Substitui completamente o shell normal (sidebar + header + main). O user
 * pendente não deve ver navegação/menus — só a mensagem explicando a
 * situação e um botão de sair. Quando o contratante/coord aprovar, a
 * próxima vez que ele abrir o app vai cair direto no /dashboard normal.
 */
export function PendingApprovalShell({
  userName,
  orgName,
}: {
  userName: string
  orgName: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(async () => {
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/login')
      router.refresh()
    })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Logo Apita aí — ancoragem visual. Igual ao topo do /onboarding
            e /join/[token] pra manter coesão entre telas de auth flow. */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
            <Trophy className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold font-heading">Apita aí</h1>
        </div>

        {/* Card principal com o ícone de relógio + mensagem. O card "respira"
            pro user entender que não é erro — é só aguardar. */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-[0_4px_24px_-8px_rgb(0_0_0/0.08)] p-8 space-y-5">
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-amber-50 ring-4 ring-amber-50/50">
            <Clock className="h-7 w-7 text-amber-600" />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold font-heading tracking-tight">
              Olá{userName ? `, ${userName.split(' ')[0]}` : ''}!
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Seu cadastro em <strong className="text-foreground font-semibold">{orgName}</strong>{' '}
              foi recebido e está aguardando aprovação.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Um coordenador vai revisar seus dados em breve. Assim que aprovado,
              você terá acesso completo à plataforma.
            </p>
          </div>

          <div className="pt-2 border-t border-border/40">
            <p className="text-[11px] text-muted-foreground/70 leading-snug">
              Você pode fechar esta janela e voltar mais tarde. Quando seu
              cadastro for aprovado, basta logar novamente.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          onClick={handleLogout}
          disabled={isPending}
          className="gap-2"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saindo…
            </>
          ) : (
            <>
              <LogOut className="h-4 w-4" />
              Sair
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
