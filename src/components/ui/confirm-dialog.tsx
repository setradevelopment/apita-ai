'use client'

import * as React from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

/**
 * Sistema central de diálogos de confirmação / aviso.
 *
 * Substitui `window.confirm(...)` e `window.alert(...)` nativos (que o
 * Chrome renderiza em estilos feios e inconsistentes entre browsers) por
 * um Dialog customizado usando shadcn/ui — centralizado na tela, padrão
 * visual único do app.
 *
 * Uso típico (qualquer client component dentro do ConfirmDialogProvider):
 *
 *   const { confirm, alert } = useConfirm()
 *
 *   async function handleDelete() {
 *     const ok = await confirm({
 *       title: 'Excluir membro?',
 *       description: 'Esta ação não pode ser desfeita.',
 *       variant: 'destructive',
 *     })
 *     if (!ok) return
 *     // ... deleta
 *   }
 *
 *   catch (err) {
 *     await alert({ title: 'Erro', description: String(err) })
 *   }
 *
 * Ambos retornam Promise — `confirm` resolve `boolean`, `alert` resolve
 * `void` (só fecha). Internamente o provider usa state + resolve pra
 * fazer o bridge async.
 */

export interface ConfirmOptions {
  title: string
  description?: string
  /** Label do botão de confirmação. Default: "Confirmar". */
  confirmLabel?: string
  /** Label do botão de cancelar. Default: "Cancelar". */
  cancelLabel?: string
  /** `destructive` pinta o botão confirm em vermelho. */
  variant?: 'default' | 'destructive'
}

export interface AlertOptions {
  title: string
  description?: string
  /** Label do botão OK. Default: "OK". */
  actionLabel?: string
  /** Tom visual. `destructive` pra erros, `default` pra avisos neutros. */
  variant?: 'default' | 'destructive'
}

interface ConfirmContextType {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  alert: (opts: AlertOptions) => Promise<void>
}

type PendingDialog =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: () => void }

const ConfirmContext = React.createContext<ConfirmContextType | null>(null)

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingDialog | null>(null)

  const confirm = React.useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ kind: 'confirm', options, resolve })
    })
  }, [])

  const alertFn = React.useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setPending({ kind: 'alert', options, resolve })
    })
  }, [])

  function handleConfirm() {
    if (!pending) return
    if (pending.kind === 'confirm') pending.resolve(true)
    else pending.resolve()
    setPending(null)
  }

  function handleCancel() {
    if (!pending) return
    // Alert não tem "cancelar" — só confirma (OK). Mas se o user fechar
    // a modal (ESC, click fora) também chamamos resolve pra não deixar a
    // Promise pendurada.
    if (pending.kind === 'confirm') pending.resolve(false)
    else pending.resolve()
    setPending(null)
  }

  const value = React.useMemo(
    () => ({ confirm, alert: alertFn }),
    [confirm, alertFn],
  )

  // ── Derived visual state ─────────────────────────────────────────────
  const isAlert = pending?.kind === 'alert'
  const variant = pending?.options.variant ?? 'default'
  const isDestructive = variant === 'destructive'

  // Ícone colorido à esquerda pra reforçar a intenção — destrutivo em rose,
  // informativo em primary. Pequeno "affordance" visual que `window.confirm`
  // não oferece e deixa claro "isso é sério" vs "só um aviso".
  const Icon = isDestructive ? AlertTriangle : Info
  const iconStyles = isDestructive
    ? 'bg-rose-50 text-rose-600 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30'
    : 'bg-primary/10 text-primary ring-primary/20'

  const confirmLabel =
    (pending?.kind === 'confirm' ? pending.options.confirmLabel : undefined)
    ?? (isAlert
      ? (pending?.kind === 'alert' ? pending.options.actionLabel : undefined) ?? 'OK'
      : 'Confirmar')

  const cancelLabel =
    (pending?.kind === 'confirm' ? pending.options.cancelLabel : undefined)
    ?? 'Cancelar'

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) handleCancel()
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className={`flex h-10 w-10 items-center justify-center rounded-full ring-1 ${iconStyles}`}>
              <Icon className="h-5 w-5" />
            </div>
            <DialogTitle>{pending?.options.title ?? ''}</DialogTitle>
            {pending?.options.description && (
              <DialogDescription className="leading-relaxed">
                {pending.options.description}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogFooter className="gap-2">
            {!isAlert && (
              <Button variant="outline" onClick={handleCancel} className="h-9">
                {cancelLabel}
              </Button>
            )}
            <Button
              variant={isDestructive ? 'destructive' : 'default'}
              onClick={handleConfirm}
              className="h-9"
              // Foca o botão primário pra o user poder só apertar Enter —
              // mesmo comportamento do window.confirm nativo.
              autoFocus
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

/**
 * Hook pra acessar `confirm()` e `alert()` em qualquer client component
 * dentro do `ConfirmDialogProvider` (montado no root layout).
 *
 * Nota: a função se chama `alert` no return mas NÃO é a `window.alert` —
 * aqui é a nossa implementação com Dialog. Se precisar de ambas no mesmo
 * arquivo, use destructuring com rename: `const { alert: showAlert } = ...`.
 */
export function useConfirm(): ConfirmContextType {
  const ctx = React.useContext(ConfirmContext)
  if (!ctx) {
    throw new Error(
      'useConfirm deve ser usado dentro de <ConfirmDialogProvider>. Confira se o provider está montado no root layout (src/app/layout.tsx).',
    )
  }
  return ctx
}
