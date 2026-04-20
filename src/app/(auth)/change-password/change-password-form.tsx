'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, KeyRound, ArrowRight, Loader2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { changePassword } from '@/app/actions/auth'
import {
  checkPasswordRules,
  getPasswordError,
  PASSWORD_MIN_LENGTH,
} from '@/lib/validators/password'

export function ChangePasswordForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const pwError = getPasswordError(newPassword)
    if (pwError) {
      setError(pwError)
      return
    }
    if (newPassword !== confirmPassword) {
      setError('A confirmação não confere com a nova senha.')
      return
    }
    if (currentPassword === newPassword) {
      setError('A nova senha deve ser diferente da atual.')
      return
    }

    startTransition(async () => {
      try {
        await changePassword(currentPassword, newPassword)
        router.push(redirectTo)
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Erro ao alterar a senha.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80" htmlFor="current">
          Senha atual
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            id="current"
            type="password"
            placeholder="••••••••"
            className="pl-10 h-11 bg-muted/30 border-border/60 focus:bg-background transition-colors"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            disabled={isPending}
            autoFocus
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80" htmlFor="new">
          Nova senha
        </label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            id="new"
            type="password"
            placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
            className="pl-10 h-11 bg-muted/30 border-border/60 focus:bg-background transition-colors"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            disabled={isPending}
            minLength={PASSWORD_MIN_LENGTH}
          />
        </div>
        {newPassword.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1.5 text-[11px]">
            {(() => {
              const c = checkPasswordRules(newPassword)
              return (
                <>
                  <PasswordRule ok={c.length} label={`${PASSWORD_MIN_LENGTH}+ caracteres`} />
                  <PasswordRule ok={c.lowercase} label="Uma minúscula" />
                  <PasswordRule ok={c.uppercase} label="Uma maiúscula" />
                  <PasswordRule ok={c.digit} label="Um número" />
                  <PasswordRule ok={c.special} label="Um caractere especial" />
                </>
              )
            })()}
          </ul>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80" htmlFor="confirm">
          Confirmar nova senha
        </label>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            id="confirm"
            type="password"
            placeholder="Repita a nova senha"
            className="pl-10 h-11 bg-muted/30 border-border/60 focus:bg-background transition-colors"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            disabled={isPending}
            minLength={8}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 px-4 py-3 rounded-lg border border-destructive/15">
          <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
          {error}
        </div>
      )}

      <Button className="w-full h-11 gap-2 font-medium text-sm" type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Salvando...
          </>
        ) : (
          <>
            Salvar nova senha
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  )
}

function PasswordRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className={`flex items-center gap-1.5 transition-colors ${
        ok ? 'text-emerald-600' : 'text-muted-foreground'
      }`}
    >
      {ok ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0 opacity-50" />}
      <span>{label}</span>
    </li>
  )
}
