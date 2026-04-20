'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ArrowLeft, Loader2, Wrench, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getPlan, formatPrice, type PlanId } from '@/lib/plans'
import { signupOrganization } from '@/app/actions/signup'
import type { SignupDraft } from '../signup-form'

function calcDiscountedPrice(
  price: number,
  discountType?: 'fixed' | 'percent',
  discountValue?: number,
): number {
  if (!discountType || !discountValue) return price
  if (discountType === 'fixed') return Math.max(0, price - discountValue)
  if (discountType === 'percent') return Math.max(0, price * (1 - discountValue / 100))
  return price
}

function readDraft(): (SignupDraft & { plan?: PlanId }) | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = sessionStorage.getItem('signup_draft')
    return saved ? (JSON.parse(saved) as SignupDraft & { plan?: PlanId }) : null
  } catch {
    return null
  }
}

export function PaymentForm() {
  const router = useRouter()
  const [draft] = useState<(SignupDraft & { plan?: PlanId }) | null>(() => readDraft())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Redirect after first render if invalid (avoids setState-in-effect)
  if (typeof window !== 'undefined') {
    if (!draft) {
      router.push('/signup')
    } else if (!draft.plan) {
      router.push('/signup/plan')
    }
  }

  async function handleFinalize() {
    if (!draft || !draft.plan) return
    setLoading(true)
    setError('')
    try {
      const result = await signupOrganization({
        name: draft.name,
        document: draft.document,
        document_type: draft.document_type,
        email: draft.email,
        password: draft.password,
        organization_name: draft.organization_name,
        responsible_name: draft.responsible_name,
        whatsapp: draft.whatsapp,
        coupon_code: draft.coupon_valid ? draft.coupon_code : undefined,
        plan: draft.plan,
      })
      if (!result.success) {
        setError(result.error ?? 'Erro ao criar conta')
        setLoading(false)
        return
      }
      sessionStorage.removeItem('signup_draft')
      router.push('/signup/success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro inesperado')
      setLoading(false)
    }
  }

  if (!draft || !draft.plan) return null

  const plan = getPlan(draft.plan)
  const discountType = draft.coupon_valid ? draft.coupon_discount_type : undefined
  const discountValue = draft.coupon_valid ? draft.coupon_discount_value : undefined
  const finalPrice = calcDiscountedPrice(plan.price, discountType, discountValue)
  const hasDiscount = finalPrice < plan.price

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-2 pb-2">
        <div className="flex-1 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center">
            <Check className="h-4 w-4" />
          </div>
          <span className="text-xs font-medium text-slate-600">Dados</span>
        </div>
        <div className="flex-1 h-px bg-emerald-500" />
        <div className="flex-1 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center">
            <Check className="h-4 w-4" />
          </div>
          <span className="text-xs font-medium text-slate-600">Plano</span>
        </div>
        <div className="flex-1 h-px bg-emerald-500" />
        <div className="flex-1 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">
            3
          </div>
          <span className="text-xs font-medium text-slate-700">Pagamento</span>
        </div>
      </div>

      {/* Resumo */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
        <h3 className="text-base font-semibold text-slate-900">Resumo do pedido</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Organização</dt>
            <dd className="font-medium text-slate-900">{draft.organization_name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Responsável</dt>
            <dd className="font-medium text-slate-900">{draft.responsible_name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">E-mail</dt>
            <dd className="font-medium text-slate-900">{draft.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Plano</dt>
            <dd className="font-medium text-slate-900">{plan.name}</dd>
          </div>
          {draft.coupon_valid && (
            <div className="flex justify-between">
              <dt className="text-slate-500">Cupom</dt>
              <dd className="font-medium text-emerald-600">{draft.coupon_code}</dd>
            </div>
          )}
          <div className="pt-3 border-t border-slate-100 flex justify-between items-baseline">
            <dt className="text-slate-900 font-semibold">Total mensal</dt>
            <dd className="text-right">
              {hasDiscount && (
                <div className="text-xs text-slate-400 line-through">
                  {formatPrice(plan.price)}
                </div>
              )}
              <div className="text-2xl font-bold text-slate-900">{formatPrice(finalPrice)}</div>
            </dd>
          </div>
        </dl>
      </div>

      {/* Pagamento em manutenção */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <Wrench className="h-5 w-5 text-amber-600" />
        </div>
        <div className="space-y-1">
          <h4 className="font-semibold text-amber-900">Pagamento em manutenção</h4>
          <p className="text-sm text-amber-800">
            Nossa integração de pagamento está em manutenção. Clique em <strong>Finalizar</strong> para
            concluir o cadastro — você poderá acessar o sistema imediatamente, e nossa equipe entrará em
            contato para ativar sua assinatura.
          </p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/8 px-4 py-3 rounded-lg border border-destructive/15">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => router.push('/signup/plan')}
          className="gap-2"
          disabled={loading}
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button onClick={handleFinalize} className="gap-2 px-6" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processando...
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Finalizar cadastro
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
