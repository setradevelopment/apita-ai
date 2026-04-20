'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { User, Mail, Lock, CheckCircle, AlertCircle, Shield } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { ImageUploadCrop } from '@/components/ui/image-upload-crop'
import { updateProfile, changePassword } from '@/app/actions/auth'
import { uploadOrgLogo, removeOrgLogo } from '@/app/actions/organization'

interface Props {
  name: string
  email: string
  role: string
  orgLogoUrl: string | null
}

export function ProfileClient({ name, email, role, orgLogoUrl }: Props) {
  const router = useRouter()
  const [currentLogo, setCurrentLogo] = useState<string | null>(orgLogoUrl)
  const isAdmin = role === 'admin'

  async function handleLogoUpload(blob: Blob, mime: string) {
    const fd = new FormData()
    fd.append('file', blob, `logo.${mime.split('/')[1]}`)
    const url = await uploadOrgLogo(fd)
    setCurrentLogo(url)
    router.refresh()
  }

  async function handleLogoRemove() {
    await removeOrgLogo()
    setCurrentLogo(null)
    router.refresh()
  }

  const [currentName, setCurrentName] = useState(name)
  const [nameMsg, setNameMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [isPendingName, startNameTransition] = useTransition()
  const [isPendingPwd, startPwdTransition] = useTransition()

  function handleUpdateName(e: React.FormEvent) {
    e.preventDefault()
    if (!currentName.trim()) return
    setNameMsg(null)
    startNameTransition(async () => {
      try {
        await updateProfile(currentName.trim())
        setNameMsg({ type: 'success', text: 'Nome atualizado com sucesso.' })
      } catch (err) {
        setNameMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao atualizar.' })
      }
    })
  }

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwdMsg(null)
    if (newPwd.length < 6) {
      setPwdMsg({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres.' })
      return
    }
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: 'error', text: 'As senhas não coincidem.' })
      return
    }
    startPwdTransition(async () => {
      try {
        await changePassword(currentPwd, newPwd)
        setPwdMsg({ type: 'success', text: 'Senha alterada com sucesso.' })
        setCurrentPwd('')
        setNewPwd('')
        setConfirmPwd('')
      } catch (err) {
        setPwdMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao alterar senha.' })
      }
    })
  }

  const roleLabel = role === 'coordinator' ? 'Coordenador' : role === 'admin' ? 'Administrador' : 'Atleta'

  return (
    <div className="space-y-6 fade-in max-w-xl">
      <div>
        <h2 className="text-xl font-semibold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Perfil
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">Gerencie suas informações pessoais e segurança</p>
      </div>

      {/* Team logo — admin only */}
      {isAdmin && (
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
          <div className="px-5 py-4 border-b border-border/40">
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
              <Shield className="h-4 w-4 text-muted-foreground" />
              Logo do time
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aparece na barra lateral e em outras telas. Também editável em{' '}
              <span className="font-medium">Configurações · Geral</span>.
            </p>
          </div>
          <div className="px-5 py-5">
            <ImageUploadCrop
              currentUrl={currentLogo}
              onUpload={handleLogoUpload}
              onRemove={handleLogoRemove}
              label="Imagem do logo"
              helpText="PNG (ideal para fundo transparente), JPEG ou WebP. Máximo 2MB. Recorte 1:1 antes do envio."
            />
          </div>
        </div>
      )}

      {/* Personal info card */}
      <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        <div className="px-5 py-4 border-b border-border/40">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
            <User className="h-4 w-4 text-muted-foreground" />
            Informações pessoais
          </h3>
        </div>
        <form onSubmit={handleUpdateName} className="px-5 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome</Label>
            <Input
              id="name"
              value={currentName}
              onChange={(e) => setCurrentName(e.target.value)}
              placeholder="Seu nome"
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">E-mail</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                id="email"
                value={email}
                disabled
                className="h-9 pl-8 bg-muted/30 text-muted-foreground cursor-not-allowed"
              />
            </div>
            <p className="text-[11px] text-muted-foreground/60">O e-mail não pode ser alterado.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Função</Label>
            <div className="h-9 flex items-center px-3 rounded-md border border-border/50 bg-muted/30 text-sm text-muted-foreground">
              {roleLabel}
            </div>
          </div>
          {nameMsg && (
            <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
              nameMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-rose-50 text-rose-700 border border-rose-100'
            }`}>
              {nameMsg.type === 'success'
                ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              {nameMsg.text}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <Button type="submit" disabled={isPendingName || !currentName.trim()} size="sm" className="h-8 shadow-sm">
              {isPendingName ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </div>
        </form>
      </div>

      {/* Password card */}
      <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        <div className="px-5 py-4 border-b border-border/40">
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ fontFamily: "'Outfit', sans-serif" }}>
            <Lock className="h-4 w-4 text-muted-foreground" />
            Alterar senha
          </h3>
        </div>
        <form onSubmit={handleChangePassword} className="px-5 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPwd" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Senha atual</Label>
            <Input
              id="currentPwd"
              type="password"
              value={currentPwd}
              onChange={(e) => setCurrentPwd(e.target.value)}
              placeholder="••••••••"
              className="h-9"
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="newPwd" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nova senha</Label>
            <Input
              id="newPwd"
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="••••••••"
              className="h-9"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirmPwd" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Confirmar nova senha</Label>
            <Input
              id="confirmPwd"
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              placeholder="••••••••"
              className="h-9"
              autoComplete="new-password"
            />
          </div>
          {pwdMsg && (
            <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
              pwdMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-rose-50 text-rose-700 border border-rose-100'
            }`}>
              {pwdMsg.type === 'success'
                ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              {pwdMsg.text}
            </div>
          )}
          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              disabled={isPendingPwd || !currentPwd || !newPwd || !confirmPwd}
              size="sm"
              className="h-8 shadow-sm"
            >
              {isPendingPwd ? 'Alterando…' : 'Alterar senha'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
