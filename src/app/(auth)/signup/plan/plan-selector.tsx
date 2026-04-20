'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PLAN_LIST, formatPrice, type PlanId } from '@/lib/plans'
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

function readDraft(): SignupDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const saved = sessionStorage.getItem('signup_draft')
    return saved ? (JSON.parse(saved) as SignupDraft) : null
  } catch {
    return null
  }
}

export function PlanSelector() {
  const router = useRouter()
  const [draft] = useState<SignupDraft | null>(() => readDraft())
  const [selected, setSelected] = useState<PlanId>('basic')

  // Redirect after first render if no draft (avoids setState-in-effect)
  if (typeof window !== 'undefined' && !draft) {
    router.push('/signup')
  }

  function handleSelect(planId: PlanId) {
    setSelected(planId)
  }

  function handleContinue() {
    if (!draft) return
    sessionStorage.setItem(
      'signup_draft',
      JSON.stringify({ ...draft, plan: selected }),
    )
    router.push('/signup/payment')
  }

  if (!draft) return null

  const discountType = draft.coupon_valid ? draft.coupon_discount_type : undefined
  const discountValue = draft.coupon_valid ? draft.coupon_discount_value : undefined

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
          <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center">
            2
          </div>
          <span className="text-xs font-medium text-slate-700">Plano</span>
        </div>
        <div className="flex-1 h-px bg-slate-200" />
        <div className="flex-1 flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-500 text-xs font-semibold flex items-center justify-center">
            3
          </div>
          <span className="text-xs text-slate-500">Pagamento</span>
        </div>
      </div>

      {draft.coupon_valid && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">
          <Sparkles className="h-4 w-4" />
          <span>
            Cupom <strong>{draft.coupon_code}</strong> aplicado —{' '}
            {discountType === 'percent'
              ? `${discountValue}% de desconto`
              : `R$${discountValue} de desconto`}
          </span>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {PLAN_LIST.map((plan) => {
          const isSelected = selected === plan.id
          const finalPrice = calcDiscountedPrice(plan.price, discountType, discountValue)
          const hasDiscount = finalPrice < plan.price
          const isMiddle = plan.id === 'plus'

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => handleSelect(plan.id as PlanId)}
              className={`relative text-left rounded-xl border-2 p-5 transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50/40 shadow-lg shadow-blue-500/10 scale-[1.02]'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
              }`}
            >
              {isMiddle && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] font-semibold tracking-wide uppercase">
                  Mais popular
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                  <div className="mt-2">
                    {hasDiscount ? (
                      <>
                        <span className="text-sm text-slate-400 line-through">
                          {formatPrice(plan.price)}
                        </span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-slate-900">
                            {formatPrice(finalPrice)}
                          </span>
                          <span className="text-sm text-slate-500">/mês</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-slate-900">
                          {formatPrice(plan.price)}
                        </span>
                        <span className="text-sm text-slate-500">/mês</span>
                      </div>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center">
                    <Check className="h-4 w-4" />
                  </div>
                )}
              </div>

              <ul className="space-y-2">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm text-slate-600">
                    <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button
          variant="outline"
          onClick={() => router.push('/signup')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button onClick={handleContinue} className="gap-2 px-6">
          Continuar para pagamento
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
