'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  Check,
  KeyRound,
  Copy,
  Eye,
  EyeOff,
  ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  superAdminUpdateOrgAdmin,
  type OrganizationAdminUser,
} from '@/app/actions/super-admin'

function formatWhatsapp(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function AdminUserForm({
  orgId,
  initial,
}: {
  orgId: string
  initial: OrganizationAdminUser
}) {
  const router = useRouter()
  const { confirm } = useConfirm()
  const [isSaving, startSave] = useTransition()
  const [isResetting, startReset] = useTransition()

  const [name, setName] = useState(initial.name ?? '')
  const [email, setEmail] = useState(initial.email ?? '')
  const [whatsapp, setWhatsapp] = useState(
    initial.whatsapp ? formatWhatsapp(initial.whatsapp) : '',
  )
  const [responsibleName, setResponsibleName] = useState(initial.responsible_name ?? '')

  const [formError, setFormError] = useState('')
  const [savedOnce, setSavedOnce] = useState(false)

  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(true)
  const [passwordCopied, setPasswordCopied] = useState(false)
  const [resetError, setResetError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    startSave(async () => {
      try {
        const payload: {
          name?: string
          email?: string
          whatsapp?: string | null
          responsible_name?: string | null
        } = {}

        if (name.trim() !== (initial.name ?? '')) payload.name = name.trim()
        if (email.trim() !== (initial.email ?? '') && email.trim() !== '') {
          payload.email = email.trim()
        }
        const whNormalized = whatsapp.replace(/\D/g, '')
        const whInitial = (initial.whatsapp ?? '').replace(/\D/g, '')
        if (whNormalized !== whInitial) {
          payload.whatsapp = whNormalized || null
        }
        if (responsibleName.trim() !== (initial.responsible_name ?? '')) {
          payload.responsible_name = responsibleName.trim() || null
        }

        if (Object.keys(payload).length === 0) {
          setSavedOnce(true)
          setTimeout(() => setSavedOnce(false), 2000)
          return
        }

        await superAdminUpdateOrgAdmin(orgId, payload)
        setSavedOnce(true)
        setTimeout(() => setSavedOnce(false), 2500)
        router.refresh()
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : 'Erro ao atualizar admin.')
      }
    })
  }

  async function handleResetPassword() {
    const ok = await confirm({
      title: 'Gerar uma nova senha para este admin?',
      description: 'A senha atual será invalidada imediatamente. A nova senha será exibida apenas uma vez.',
      variant: 'destructive',
      confirmLabel: 'Gerar nova senha',
    })
    if (!ok) return
    setResetError('')
    setGeneratedPassword(null)
    setPasswordCopied(false)
    setShowPassword(true)

    startReset(async () => {
      try {
        const result = await superAdminUpdateOrgAdmin(orgId, { resetPassword: true })
        if (!result.generatedPassword) {
          setResetError(
            'A senha foi atualizada mas não foi possível exibi-la. Tente novamente.',
          )
          return
        }
        setGeneratedPassword(result.generatedPassword)
      } catch (err: unknown) {
        setResetError(err instanceof Error ? err.message : 'Erro ao gerar nova senha.')
      }
    })
  }

  async function copyPassword() {
    if (!generatedPassword) return
    try {
      await navigator.clipboard.writeText(generatedPassword)
      setPasswordCopied(true)
      setTimeout(() => setPasswordCopied(false), 2000)
    } catch {
      // clipboard unavailable
    }
  }

  async function dismissGeneratedPassword() {
    const ok = await confirm({
      title: 'Descartar a senha?',
      description: 'Ela não será exibida novamente. Confirme apenas após copiar e entregar ao contratante.',
      variant: 'destructive',
      confirmLabel: 'Descartar',
    })
    if (!ok) return
    setGeneratedPassword(null)
  }

  return (
    <div className="space-y-6">
      {/* Data form */}
      <form
        onSubmit={handleSave}
        className="bg-card rounded-xl border border-border/50 p-6 space-y-5"
      >
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nome do admin</label>
          <Input
            placeholder="Nome completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">E-mail de login</label>
          <Input
            type="email"
            placeholder="email@clube.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">
            Alterar o e-mail atualiza o login do admin no Supabase Auth.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">WhatsApp</label>
          <Input
            placeholder="(00) 00000-0000"
            value={whatsapp}
            onChange={(e) => setWhatsapp(formatWhatsapp(e.target.value))}
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">
            Campo <code className="px-1 font-mono text-[11px]">organizations.whatsapp</code>{' '}
            — contato principal do contratante.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nome do responsável (contratante)</label>
          <Input
            placeholder="Nome do responsável pela contratação"
            value={responsibleName}
            onChange={(e) => setResponsibleName(e.target.value)}
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">
            Pode ser diferente do admin de login. Exibido no dashboard do contratante.
          </p>
        </div>

        {formError && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 px-3 py-2 rounded-lg border border-destructive/15">
            <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
            {formError}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
          {savedOnce && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium mr-auto">
              <Check className="h-3.5 w-3.5" /> Alterações salvas
            </span>
          )}
          <Button type="submit" size="sm" disabled={isSaving} className="gap-1.5">
            {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      </form>

      {/* Password reset */}
      <div className="bg-card rounded-xl border border-amber-200/60 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-amber-500/10 shrink-0">
            <KeyRound className="h-4 w-4 text-amber-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold">Gerar nova senha</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Útil quando o admin esqueceu a senha ou bloqueou o acesso. Uma senha aleatória
              será gerada e mostrada <strong>apenas uma vez</strong>. Copie-a e entregue ao
              contratante por um canal seguro.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetPassword}
            disabled={isResetting}
            className="gap-1.5 shrink-0"
          >
            {isResetting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            Gerar nova senha
          </Button>
        </div>

        {resetError && (
          <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 px-3 py-2 rounded-lg border border-destructive/15">
            <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
            {resetError}
          </div>
        )}

        {generatedPassword && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
              <ShieldAlert className="h-3.5 w-3.5" />
              Copie agora — não será exibida novamente
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-white border border-amber-200 rounded-lg px-3 py-2 font-mono select-all truncate">
                {showPassword ? generatedPassword : '•'.repeat(generatedPassword.length)}
              </code>
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-amber-100 text-amber-700 transition-colors"
                title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={copyPassword}
                className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-amber-100 text-amber-700 transition-colors"
                title="Copiar senha"
              >
                {passwordCopied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[11px] text-amber-800/90">
                A senha anterior já foi invalidada. O contratante precisa usar esta para
                entrar.
              </p>
              <button
                type="button"
                onClick={dismissGeneratedPassword}
                className="text-[11px] font-medium text-amber-800 hover:text-amber-900 underline underline-offset-2"
              >
                Descartar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
