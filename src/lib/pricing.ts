export type PricingMethod = 'fixed' | 'avulso_x_qty'
/**
 * Tipos de desconto suportados no modo `avulso_x_qty`:
 *  - `none` — sem desconto, preço = dropIn × qty
 *  - `fixed_amount` — subtrai um R$ fixo do total (ex: R$20 off)
 *  - `percentage` — desconto percentual sobre o total
 *  - `per_session` — desconto R$X POR TREINO. Escala com a quantidade: em meses
 *    com mais treinos, o desconto total cresce proporcionalmente (ex: R$3 por
 *    treino × 5 treinos = R$15 de desconto; × 4 treinos = R$12).
 */
export type DiscountType = 'none' | 'fixed_amount' | 'percentage' | 'per_session'

export function calcTierPrice(
  dropInPrice: number,
  method: PricingMethod,
  fixedPrice: number,
  qty: number,
  discountType: DiscountType,
  discountValue: number
): number {
  if (method === 'fixed') return fixedPrice
  const base = dropInPrice * qty
  if (discountType === 'fixed_amount') return Math.max(0, base - discountValue)
  if (discountType === 'percentage') return Math.max(0, base * (1 - discountValue / 100))
  if (discountType === 'per_session') return Math.max(0, base - discountValue * qty)
  return base
}

const DAY_MAP: Record<string, number> = {
  Domingo: 0,
  Segunda: 1,
  'Terça': 2,
  Quarta: 3,
  Quinta: 4,
  Sexta: 5,
  'Sábado': 6,
}

/**
 * Conta exatamente quantos treinos ocorrem em um dado mês/ano
 * para os dias da semana configurados na categoria.
 */
export function countTrainingsInMonth(daysOfWeek: string[], month: number, year: number): number {
  const weekdays = daysOfWeek.map((d) => DAY_MAP[d]).filter((d) => d !== undefined)
  const daysInMonth = new Date(year, month, 0).getDate()
  let count = 0
  for (let d = 1; d <= daysInMonth; d++) {
    if (weekdays.includes(new Date(year, month - 1, d).getDay())) count++
  }
  return count
}

/**
 * Sugestão de quantidade de treinos por período.
 * Para 'monthly': usa o mês atual real (pode ser 4 ou 5 treinos).
 * Para outros: estimativa baseada em semanas típicas.
 */
export function suggestQty(
  daysOfWeek: string[],
  tier: 'weekly' | 'monthly' | 'semiannual' | 'annual',
  month?: number,
  year?: number
): number {
  const perWeek = daysOfWeek.length || 1
  if (tier === 'weekly') return perWeek
  if (tier === 'monthly') {
    const now = new Date()
    return countTrainingsInMonth(daysOfWeek, month ?? now.getMonth() + 1, year ?? now.getFullYear())
  }
  if (tier === 'semiannual') {
    // Conta 6 meses a partir do mês atual
    const now = new Date()
    let total = 0
    for (let i = 0; i < 6; i++) {
      const m = ((now.getMonth() + i) % 12) + 1
      const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12)
      total += countTrainingsInMonth(daysOfWeek, m, y)
    }
    return total
  }
  if (tier === 'annual') {
    const now = new Date()
    let total = 0
    for (let i = 0; i < 12; i++) {
      const m = ((now.getMonth() + i) % 12) + 1
      const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12)
      total += countTrainingsInMonth(daysOfWeek, m, y)
    }
    return total
  }
  return perWeek * 4
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
