'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowRight, CheckCircle2, XCircle, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { validateCoupon } from '@/app/actions/signup'
import {
  checkPasswordRules,
  getPasswordError,
  PASSWORD_MIN_LENGTH,
} from '@/lib/validators/password'

export interface SignupDraft {
  name: string
  document: string
  document_type: 'cpf' | 'cnpj'
  email: string
  password: string
  organization_name: string
  responsible_name: string
  whatsapp: string
  coupon_code: string
  coupon_valid?: boolean
  coupon_discount_type?: 'fixed' | 'percent'
  coupon_discount_value?: number
}

const emptyDraft: SignupDraft = {
  name: '',
  document: '',
  document_type: 'cpf',
  email: '',
  password: '',
  organization_name: '',
  responsible_name: '',
  whatsapp: '',
  coupon_code: '',
}

function formatCPF(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1-$2')
}

function formatCNPJ(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function formatWhatsapp(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function SignupForm() {
  const router = useRouter()
  const [draft, setDraft] = useState<SignupDraft>(emptyDraft)
  const [error, setError] = useState('')
  const [couponChecking, setCouponChecking] = useState(false)
  const [couponMessage, setCouponMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // Hydrate from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem('signup_draft')
      if (saved) {
        const parsed = JSON.parse(saved) as SignupDraft
        setDraft(parsed)
        if (parsed.coupon_valid) {
          setCouponMessage({ ok: true, text: 'Cupom aplicado' })
        }
      }
    } catch {
      // ignore
    }
  }, [])

  function update<K extends keyof SignupDraft>(key: K, value: SignupDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  async function handleValidateCoupon() {
    if (!draft.coupon_code.trim()) return
    setCouponChecking(true)
    setCouponMessage(null)
    try {
      const result = await validateCoupon(draft.coupon_code)
      if (result.valid) {
        setDraft((d) => ({
          ...d,
          coupon_valid: true,
          coupon_discount_type: result.discount_type,
          coupon_discount_value: result.discount_value,
        }))
        setCouponMessage({
          ok: true,
          text:
            result.discount_type === 'percent'
              ? `Cupom aplicado: ${result.discount_value}% de desconto`
              : `Cupom aplicado: R$${result.discount_value} de desconto`,
        })
      } else {
        setDraft((d) => ({
          ...d,
          coupon_valid: false,
          coupon_discount_type: undefined,
          coupon_discount_value: undefined,
        }))
        setCouponMessage({ ok: false, text: result.error ?? 'Cupom inválido' })
      }
    } finally {
      setCouponChecking(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const digits = draft.document.replace(/\D/g, '')
    if (draft.document_type === 'cpf' && digits.length !== 11) {
      setError('CPF deve ter 11 dígitos')
      return
    }
    if (draft.document_type === 'cnpj' && digits.length !== 14) {
      setError('CNPJ deve ter 14 dígitos')
      return
    }
    const passwordError = getPasswordError(draft.password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    sessionStorage.setItem('signup_draft', JSON.stringify(draft))
    router.push('/signup/plan')
  }

  // Live checklist — only shown while the user is typing the password
  const pwChecks = checkPasswordRules(draft.password)

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 pb-4">
        <div className="flex-1 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">1</div>
          <span className="text-xs font-medium text-slate-700">Dados</span>
        </div>
        <div className="flex-1 h-px bg-slate-200" />
        <div className="flex-1 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-500 text-xs font-semibold flex items-center justify-center">2</div>
          <span className="text-xs text-slate-500">Plano</span>
        </div>
        <div className="flex-1 h-px bg-slate-200" />
        <div className="flex-1 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-500 text-xs font-semibold flex items-center justify-center">3</div>
          <span className="text-xs text-slate-500">Pagamento</span>
        </div>
      </div>

      {/* Nome/razão social */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80">Nome / Razão social</label>
        <Input
          placeholder="Nome completo ou razão social"
          value={draft.name}
          onChange={(e) => update('name', e.target.value)}
          required
        />
      </div>

      {/* Tipo de documento */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80">Tipo de documento</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => update('document_type', 'cpf')}
            className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
              draft.document_type === 'cpf'
                ? 'bg-blue-50 border-blue-500 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            CPF
          </button>
          <button
            type="button"
            onClick={() => update('document_type', 'cnpj')}
            className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
              draft.document_type === 'cnpj'
                ? 'bg-blue-50 border-blue-500 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            CNPJ
          </button>
        </div>
      </div>

      {/* Documento */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80">
          {draft.document_type === 'cpf' ? 'CPF' : 'CNPJ'}
        </label>
        <Input
          placeholder={draft.document_type === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
          value={draft.document}
          onChange={(e) =>
            update(
              'document',
              draft.document_type === 'cpf'
                ? formatCPF(e.target.value)
                : formatCNPJ(e.target.value),
            )
          }
          required
        />
      </div>

      {/* E-mail */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80">E-mail (login)</label>
        <Input
          type="email"
          placeholder="seu@email.com"
          value={draft.email}
          onChange={(e) => update('email', e.target.value)}
          required
        />
      </div>

      {/* Senha */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80">Senha</label>
        <Input
          type="password"
          placeholder={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres`}
          value={draft.password}
          onChange={(e) => update('password', e.target.value)}
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
        {draft.password.length > 0 && (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1.5 text-[11px]">
            <PasswordRule ok={pwChecks.length} label={`${PASSWORD_MIN_LENGTH}+ caracteres`} />
            <PasswordRule ok={pwChecks.lowercase} label="Uma minúscula" />
            <PasswordRule ok={pwChecks.uppercase} label="Uma maiúscula" />
            <PasswordRule ok={pwChecks.digit} label="Um número" />
            <PasswordRule ok={pwChecks.special} label="Um caractere especial" />
          </ul>
        )}
      </div>

      {/* Nome da organização */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80">Nome do time / organização</label>
        <Input
          placeholder="Ex: Clube Atlético FC"
          value={draft.organization_name}
          onChange={(e) => update('organization_name', e.target.value)}
          required
        />
      </div>

      {/* Responsável */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80">Responsável</label>
        <Input
          placeholder="Nome do responsável"
          value={draft.responsible_name}
          onChange={(e) => update('responsible_name', e.target.value)}
          required
        />
      </div>

      {/* WhatsApp */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80">WhatsApp</label>
        <Input
          placeholder="(00) 00000-0000"
          value={draft.whatsapp}
          onChange={(e) => update('whatsapp', formatWhatsapp(e.target.value))}
          required
        />
      </div>

      {/* Cupom */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80">Cupom (opcional)</label>
        <div className="flex gap-2">
          <Input
            placeholder="CODIGO10"
            value={draft.coupon_code}
            onChange={(e) => {
              update('coupon_code', e.target.value.toUpperCase())
              setCouponMessage(null)
              setDraft((d) => ({ ...d, coupon_valid: false }))
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleValidateCoupon}
            disabled={couponChecking || !draft.coupon_code.trim()}
          >
            {couponChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validar'}
          </Button>
        </div>
        {couponMessage && (
          <div
            className={`flex items-center gap-1.5 text-xs ${
              couponMessage.ok ? 'text-emerald-600' : 'text-destructive'
            }`}
          >
            {couponMessage.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {couponMessage.text}
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/8 px-4 py-3 rounded-lg border border-destructive/15">
          {error}
        </div>
      )}

      <Button type="submit" className="w-full h-11 gap-2">
        Continuar para escolha de plano
        <ArrowRight className="h-4 w-4" />
      </Button>

      <p className="text-center text-xs text-muted-foreground pt-2">
        Já tem uma conta?{' '}
        <Link href="/login" className="text-primary hover:underline">
          Entrar
        </Link>
      </p>
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
