'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { resetDatabase } from '@/app/actions/admin-reset'

export function ResetPanel() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const canConfirm = confirmText === 'RESETAR' && !isPending

  function handleReset() {
    if (!canConfirm) return
    startTransition(async () => {
      try {
        const r = await resetDatabase()
        setResult({ type: 'success', text: r.message })
        setConfirmText('')
        setTimeout(() => {
          setOpen(false)
          router.refresh()
        }, 1500)
      } catch (e) {
        setResult({
          type: 'error',
          text: e instanceof Error ? e.message : 'Erro ao resetar banco',
        })
      }
    })
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setConfirmText('')
      setResult(null)
    }
  }

  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Zona de Perigo
          </h2>
        </div>
        <div className="bg-destructive/5 rounded-xl border border-destructive/30 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-destructive mb-1">
                Limpar banco de dados
              </h3>
              <p className="text-xs text-muted-foreground">
                Apaga <strong>TODAS</strong> as organizações, usuários, categorias, atletas,
                pagamentos e cupons. Apenas sua conta super_admin permanece. Útil para testes —
                não pode ser desfeito.
              </p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setOpen(true)}
              className="gap-1.5 shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar banco
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Confirmar reset do banco
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-destructive/8 border border-destructive/20 p-3 text-sm text-destructive">
              Esta ação apaga <strong>TUDO</strong> (organizações, usuários, dados) e mantém apenas
              sua conta. <strong>Não pode ser desfeito.</strong>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Digite <code className="bg-muted px-1.5 py-0.5 rounded">RESETAR</code> para confirmar
              </label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESETAR"
                disabled={isPending}
                autoFocus
              />
            </div>

            {result && (
              <div
                className={`text-sm px-3 py-2 rounded-lg border ${
                  result.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-destructive/8 border-destructive/15 text-destructive'
                }`}
              >
                {result.text}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={!canConfirm}
              className="gap-1.5"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Resetando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Resetar banco
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
