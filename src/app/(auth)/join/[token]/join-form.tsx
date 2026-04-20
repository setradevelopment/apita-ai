'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight, Loader2, Search, AlertCircle, Eye, EyeOff, Check, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { signupViaInvite, type InviteSignupData } from '@/app/actions/invite-links'
import { checkPasswordRules } from '@/lib/validators/password'

const ADDRESS_TYPES = ['casa', 'trabalho', 'faculdade', 'outros'] as const

const INITIAL_FORM: InviteSignupData = {
  name: '',
  email: '',
  password: '',
  password_confirm: '',
  dob: '',
  cpf: '',
  rg: '',
  origin_type: 'casa',
  origin_street: '',
  origin_neighborhood: '',
  origin_zip: '',
  destination_type: 'casa',
  destination_street: '',
  destination_neighborhood: '',
  destination_zip: '',
}

/**
 * Formulário de auto-cadastro do atleta via link de convite.
 *
 * Organização em 3 seções: Dados pessoais → Logística → Senha. Segue o
 * mesmo padrão visual do `/onboarding` pra manter consistência, mas tem
 * email+senha (onboarding não pede — lá o user já está logado).
 *
 * Pós-submit bem-sucedido:
 *   • Action cria auth.user + profile + member e retorna `{ ok, email }`.
 *   • Client faz `signInWithPassword` com o email retornado + a senha que
 *     o user acabou de digitar (ainda em memória). Auto-login.
 *   • Redirect pra /dashboard.
 *
 * Validação de senha usa `checkPasswordRules` pra feedback em tempo real —
 * o user vê quais regras faltam enquanto digita (checklist visual).
 */
export function JoinForm({ token, orgName }: { token: string; orgName: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<InviteSignupData>(INITIAL_FORM)
  const [error, setError] = useState('')
  const [cepLoading, setCepLoading] = useState({ origin: false, destination: false })
  const [cepError, setCepError] = useState<{ origin: string | null; destination: string | null }>(
    { origin: null, destination: null },
  )
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  // Valida em tempo real pra dar feedback visual (checklist) enquanto digita.
  // Fonte única de verdade fica em `src/lib/validators/password.ts` — mesmo
  // que o signup público da home usa. Evita divergência de regra.
  const passwordRules = useMemo(() => checkPasswordRules(form.password), [form.password])
  const passwordsMatch = form.password === form.password_confirm && form.password.length > 0

  /**
   * Busca endereço no ViaCEP quando o CEP tem 8 dígitos. Preenche rua/bairro
   * automaticamente; o atleta ainda pode editar depois. Padrão herdado do
   * `onboarding-form.tsx` — mesma integração.
   */
  async function fetchCep(dir: 'origin' | 'destination', rawValue: string) {
    const digits = rawValue.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading((p) => ({ ...p, [dir]: true }))
    setCepError((p) => ({ ...p, [dir]: null }))
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.erro) {
        setCepError((p) => ({ ...p, [dir]: 'CEP não encontrado.' }))
        return
      }
      setForm((f) => ({
        ...f,
        [`${dir}_street`]: data.logradouro ?? f[`${dir}_street` as keyof InviteSignupData],
        [`${dir}_neighborhood`]: data.bairro ?? f[`${dir}_neighborhood` as keyof InviteSignupData],
      }))
    } catch {
      setCepError((p) => ({ ...p, [dir]: 'Erro ao consultar CEP.' }))
    } finally {
      setCepLoading((p) => ({ ...p, [dir]: false }))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Sanity check antes de disparar — mesmo que a action valide, pegar
    // erros óbvios antes evita roundtrip.
    if (form.password !== form.password_confirm) {
      setError('As senhas não conferem.')
      return
    }

    startTransition(async () => {
      const result = await signupViaInvite(token, form)
      if (!result.ok) {
        setError(result.error)
        return
      }

      // Auto-login: a action criou o user no servidor, agora o client faz
      // signIn com email + a senha que o user digitou (ainda em memória).
      // Isso cria a session no browser via cookie Supabase.
      try {
        const supabase = createClient()
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: result.email,
          password: form.password,
        })
        if (signInError) {
          // Falhou auto-login? Manda pra /login com mensagem de sucesso
          // parcial — pelo menos a conta foi criada.
          router.push('/login?registered=1')
          return
        }
        // Sucesso total → vai direto pro app. O layout do dashboard cuida
        // do gate (profile_completed_at já foi stamped pela action).
        router.push('/dashboard')
        router.refresh()
      } catch {
        router.push('/login?registered=1')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Dados pessoais ────────────────────────────────────────── */}
      <section className="space-y-4 bg-card border border-border/50 rounded-xl p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        <h3 className="text-sm font-semibold tracking-tight font-heading">
          Dados pessoais
        </h3>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">E-mail (será seu login) *</Label>
          <Input
            type="email"
            placeholder="seu@email.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="h-10"
            required
            disabled={isPending}
            autoComplete="email"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Nome completo *</Label>
          <Input
            placeholder="Seu nome completo"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="h-10"
            required
            disabled={isPending}
            autoComplete="name"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Data de nascimento *</Label>
            <Input
              type="date"
              value={form.dob}
              onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
              className="h-10"
              required
              disabled={isPending}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">CPF *</Label>
            <Input
              placeholder="00000000000"
              value={form.cpf}
              inputMode="numeric"
              className="h-10 font-mono tracking-wider"
              maxLength={11}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 11)
                setForm((f) => ({ ...f, cpf: v }))
              }}
              required
              disabled={isPending}
            />
            <p className="text-[11px] text-muted-foreground/70 leading-snug">
              *usado para cadastro em torneios e campeonatos
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">RG *</Label>
          <Input
            placeholder="0000000000"
            value={form.rg}
            inputMode="numeric"
            className="h-10 font-mono tracking-wider"
            maxLength={10}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 10)
              setForm((f) => ({ ...f, rg: v }))
            }}
            required
            disabled={isPending}
          />
          <p className="text-[11px] text-muted-foreground/70 leading-snug">
            *usado para cadastro em torneios e campeonatos
          </p>
        </div>
      </section>

      {/* ── Logística ─────────────────────────────────────────────── */}
      <section className="space-y-5 bg-card border border-border/50 rounded-xl p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        <div>
          <h3 className="text-sm font-semibold tracking-tight font-heading">
            Logística
          </h3>
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-snug">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              *usado para ver quem mora perto e melhorar a logística dos atletas do {orgName}. Não é necessário informar número/apartamento — <strong>apenas</strong> a rua.
            </span>
          </div>
        </div>

        {(['origin', 'destination'] as const).map((dir) => {
          const label = dir === 'origin' ? 'Saída para o treino' : 'Volta do treino'
          const typeKey = `${dir}_type` as keyof InviteSignupData
          const streetKey = `${dir}_street` as keyof InviteSignupData
          const nbhKey = `${dir}_neighborhood` as keyof InviteSignupData
          const zipKey = `${dir}_zip` as keyof InviteSignupData
          return (
            <div key={dir} className="space-y-3">
              <Label className="text-sm font-semibold">{label} *</Label>

              <div className="flex gap-1.5 flex-wrap">
                {ADDRESS_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, [typeKey]: t }))}
                    disabled={isPending}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all capitalize ${
                      form[typeKey] === t
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">CEP *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="00000000"
                    value={form[zipKey] as string}
                    inputMode="numeric"
                    className="h-10 w-36 font-mono"
                    maxLength={8}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 8)
                      setForm((f) => ({ ...f, [zipKey]: v }))
                      if (v.length === 8) fetchCep(dir, v)
                    }}
                    required
                    disabled={isPending}
                  />
                  <button
                    type="button"
                    onClick={() => fetchCep(dir, form[zipKey] as string)}
                    disabled={cepLoading[dir] || isPending}
                    title="Buscar endereço pelo CEP (ViaCEP)"
                    className="h-10 w-10 flex items-center justify-center rounded-md border border-border/60 bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {cepLoading[dir]
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Search className="h-4 w-4" />}
                  </button>
                  <span className="text-[11px] text-muted-foreground">
                    Preenche rua e bairro automaticamente.
                  </span>
                </div>
                {cepError[dir] && (
                  <p className="text-[11px] text-rose-600 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {cepError[dir]}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Rua *</Label>
                  <Input
                    value={form[streetKey] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [streetKey]: e.target.value }))}
                    className="h-10"
                    required
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Bairro *</Label>
                  <Input
                    value={form[nbhKey] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [nbhKey]: e.target.value }))}
                    className="h-10"
                    required
                    disabled={isPending}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {/* ── Senha ─────────────────────────────────────────────────── */}
      <section className="space-y-4 bg-card border border-border/50 rounded-xl p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        <h3 className="text-sm font-semibold tracking-tight font-heading">
          Senha de acesso
        </h3>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Senha *</Label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              placeholder="Crie uma senha"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              className="h-10 pr-9"
              required
              disabled={isPending}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Checklist em tempo real — aparece só quando o user começou a digitar.
            Cada linha vira verde quando a regra passa. Padrão UI consagrado
            (Apple, Google) pra dar feedback de senha forte sem errar no submit. */}
        {form.password.length > 0 && (
          <div className="rounded-lg bg-muted/30 border border-border/40 px-3 py-2 space-y-1">
            <PasswordRuleRow ok={passwordRules.length} label="Pelo menos 6 caracteres" />
            <PasswordRuleRow ok={passwordRules.lowercase} label="1 letra minúscula" />
            <PasswordRuleRow ok={passwordRules.uppercase} label="1 letra maiúscula" />
            <PasswordRuleRow ok={passwordRules.digit} label="1 número" />
            <PasswordRuleRow ok={passwordRules.special} label="1 caractere especial (ex: !@#$)" />
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Confirmar senha *</Label>
          <div className="relative">
            <Input
              type={showConfirm ? 'text' : 'password'}
              placeholder="Digite a senha novamente"
              value={form.password_confirm}
              onChange={(e) => setForm((f) => ({ ...f, password_confirm: e.target.value }))}
              className={`h-10 pr-9 ${
                form.password_confirm.length > 0 && !passwordsMatch
                  ? 'border-rose-400 focus-visible:ring-rose-200'
                  : ''
              }`}
              required
              disabled={isPending}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              tabIndex={-1}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              aria-label={showConfirm ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {form.password_confirm.length > 0 && !passwordsMatch && (
            <p className="text-[11px] text-rose-600 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              As senhas não conferem.
            </p>
          )}
        </div>
      </section>

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
            Criando sua conta…
          </>
        ) : (
          <>
            Concluir cadastro
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  )
}

/**
 * Uma linha do checklist de regras de senha — verde/check quando a regra
 * passa, cinza/x quando ainda não. Componente interno mini pra manter o
 * JSX principal limpo.
 */
function PasswordRuleRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-[11px] ${ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'}`}>
      {ok
        ? <Check className="h-3 w-3 shrink-0" />
        : <X className="h-3 w-3 shrink-0 opacity-50" />
      }
      {label}
    </div>
  )
}
