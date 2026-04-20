'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Copy, Check, Loader2, Link2, RotateCw, Trash2, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  createInviteLink,
  getActiveInviteLink,
  revokeInviteLink,
  type InviteLink,
} from '@/app/actions/invite-links'

/**
 * Card "Link de convite" — fica no topo da aba Usuários > Atletas.
 *
 * Estado:
 *   • `loading`   → primeira carga (spinner compacto, sem placeholder gigante)
 *   • sem link    → CTA "Gerar link de convite"
 *   • com link    → mostra URL, botão copiar, expiração e botão revogar
 *
 * Fetch é client-side via server action — evita passar mais props pela cadeia
 * `settings/page → SettingsClient → UsersSection`. Um flicker de 100-200ms é
 * aceitável aqui (o card é secundário, não bloqueia o resto da tela).
 */
export function InviteLinkCard() {
  const [link, setLink] = useState<InviteLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string>('')
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  // Load inicial — só roda uma vez no mount. Se o user gerar/revogar depois,
  // atualizamos o state local direto (não precisamos re-fetch).
  const load = useCallback(async () => {
    try {
      const current = await getActiveInviteLink()
      setLink(current)
    } catch (err) {
      console.error('[InviteLinkCard] load error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function handleGenerate() {
    setError('')
    startTransition(async () => {
      try {
        const novo = await createInviteLink()
        setLink(novo)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao gerar link.')
      }
    })
  }

  function handleRevoke() {
    setError('')
    setConfirmRevoke(false)
    startTransition(async () => {
      try {
        await revokeInviteLink()
        setLink(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao revogar link.')
      }
    })
  }

  async function handleCopy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      // Reseta o feedback visual após 2s — padrão de "temporary confirmation"
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione e copie manualmente.')
    }
  }

  // ── Renderização ────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="bg-card rounded-xl border border-border/50 px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Carregando link de convite…
      </div>
    )
  }

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Link2 className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Link de convite para atletas</p>
            <p className="text-[11px] text-muted-foreground/80 leading-snug">
              Envie pra seus atletas se auto-cadastrarem. Expira em 7 dias.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {link ? (
          <>
            {/* URL + copiar */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={link.url}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full h-9 px-3 pr-3 text-xs font-mono bg-muted/40 border border-border/50 rounded-md text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 truncate"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant={copied ? 'secondary' : 'default'}
                onClick={handleCopy}
                className="h-9 gap-1.5 shrink-0"
                disabled={isPending}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar
                  </>
                )}
              </Button>
            </div>

            {/* Expiração + ações destrutivas */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3" />
                Expira em {formatExpiry(link.expires_at)}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted/50 disabled:opacity-50"
                  title="Gerar um novo link (invalida o atual)"
                >
                  <RotateCw className="h-3 w-3" />
                  Gerar novo
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRevoke(true)}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 hover:text-rose-800 transition-colors px-2 py-1 rounded hover:bg-rose-50 disabled:opacity-50"
                  title="Revogar o link — atletas não conseguirão mais se cadastrar"
                >
                  <Trash2 className="h-3 w-3" />
                  Excluir
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-muted-foreground">
              Nenhum link ativo no momento.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={handleGenerate}
              disabled={isPending}
              className="h-9 gap-1.5"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5" />
                  Gerar link de convite
                </>
              )}
            </Button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/8 px-3 py-2 rounded-lg border border-destructive/15">
            <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Confirmação de exclusão do link — ação destrutiva, pede confirmação
          pra evitar clique acidental. Ao confirmar, o link revogado para de
          funcionar pros atletas imediatamente. */}
      <Dialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Outfit', sans-serif" }}>
              Excluir link de convite?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Atletas que já receberam esse link não conseguirão mais usá-lo. Você
            pode gerar um novo a qualquer momento.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmRevoke(false)} className="h-9">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={isPending} className="h-9">
              {isPending ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Formata o tempo restante até `expires_at` de forma humana.
 * Ex: "em 6 dias", "em 5 horas", "em 1 hora", "hoje".
 */
function formatExpiry(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now()
  if (diff <= 0) return 'expirou'
  const hours = Math.floor(diff / 1000 / 60 / 60)
  if (hours < 1) return 'menos de 1 hora'
  if (hours < 24) return `${hours} ${hours === 1 ? 'hora' : 'horas'}`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? 'dia' : 'dias'}`
}
