import Link from 'next/link'
import { Trophy, AlertTriangle, Users } from 'lucide-react'
import { validateInviteToken } from '@/app/actions/invite-links'
import { JoinForm } from './join-form'

/**
 * Rota pública `/join/[token]` — tela de auto-cadastro do atleta.
 *
 * Fluxo:
 *   1. Server component valida o token via `validateInviteToken` (service_role).
 *   2. Token inválido/expirado/revogado → tela de erro genérica (sem vazar
 *      se o token existiu ou não).
 *   3. Token válido → mostra card da org (logo + nome) + form de cadastro.
 *
 * Não usa `force-dynamic` — a página é naturalmente por-request (param dinâmico
 * + validação server-side). Next já trata como dynamic.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const info = await validateInviteToken(token)

  // Token inválido/expirado/revogado → tela de erro genérica (sem deixar
  // claro qual das 3 foi a causa). Previne enumeration + educa o user.
  if (!info) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center py-10 px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 ring-1 ring-destructive/20">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold font-heading tracking-tight">
              Link inválido ou expirado
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Este link de convite não é mais válido. Pode ter sido excluído pelo
              administrador ou ter passado da validade de 7 dias.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Peça um novo link pro coordenador ou administrador do seu clube.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-block text-sm text-primary hover:underline"
          >
            Voltar para o login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center py-10 px-4">
      <div className="w-full max-w-[640px] space-y-6">
        {/* Marca Apita aí */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
            <Trophy className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold font-heading">Apita aí</h1>
        </div>

        {/* Card da organização — mostra pro atleta onde ele tá se cadastrando.
            Se a org tiver logo, renderiza; senão, cai na inicial estilizada. */}
        <div className="flex items-center gap-3 bg-card rounded-xl border border-border/50 p-4 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
          {info.organization_logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={info.organization_logo_url}
              alt={`Logo ${info.organization_name}`}
              className="h-12 w-12 shrink-0 rounded-xl object-cover ring-1 ring-border/40 bg-muted/30"
            />
          ) : (
            <div
              aria-hidden
              className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/15 flex items-center justify-center text-primary text-lg font-bold font-heading"
            >
              {info.organization_name.charAt(0).toUpperCase() || '?'}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-semibold flex items-center gap-1">
              <Users className="h-3 w-3" />
              Você foi convidado a fazer parte de
            </p>
            <p className="text-lg font-semibold tracking-tight font-heading truncate">
              {info.organization_name}
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight font-heading">
            Criar sua conta
          </h2>
          <p className="text-muted-foreground text-sm">
            Preencha seus dados para começar a usar o Apita aí. Todos os campos
            abaixo são obrigatórios.
          </p>
        </div>

        <JoinForm token={token} orgName={info.organization_name} />
      </div>
    </div>
  )
}
