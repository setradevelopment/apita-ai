export const PLANS = {
  basic: {
    id: 'basic',
    name: 'Basic',
    price: 30,
    max_categories: 1,
    max_members: 25,
    features: [
      'Até 1 categoria',
      'Até 25 membros',
      'Treinos e presenças',
      'Controle financeiro básico',
    ],
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    price: 60,
    max_categories: 3,
    max_members: 75,
    features: [
      'Até 3 categorias',
      'Até 75 membros',
      'Todos os recursos do Basic',
      'Suporte prioritário',
    ],
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 100,
    max_categories: 10,
    max_members: 200,
    features: [
      'Até 10 categorias',
      'Até 200 membros',
      'Todos os recursos do Plus',
      'Relatórios avançados',
    ],
  },
} as const

export type PlanId = keyof typeof PLANS
export type Plan = (typeof PLANS)[PlanId]

export const PLAN_LIST: Plan[] = Object.values(PLANS)

export function getPlan(id: string | null | undefined): Plan {
  if (!id) return PLANS.basic
  return (PLANS as Record<string, Plan>)[id] ?? PLANS.basic
}

export function formatPrice(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export type SubscriptionStatus = 'pending_payment' | 'active' | 'suspended' | 'cancelled'
