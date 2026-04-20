/**
 * Parseia o parâmetro `m` da URL (formato YYYY-MM) e retorna { month, year }.
 * Se ausente ou inválido, retorna o mês atual.
 */
export function parseMonthParam(m: string | undefined): { month: number; year: number } {
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [y, mo] = m.split('-').map(Number)
    if (mo >= 1 && mo <= 12) return { month: mo, year: y }
  }
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

export function toMonthParam(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function prevMonth(month: number, year: number) {
  if (month === 1) return { month: 12, year: year - 1 }
  return { month: month - 1, year }
}

export function nextMonth(month: number, year: number) {
  if (month === 12) return { month: 1, year: year + 1 }
  return { month: month + 1, year }
}

export const MONTH_NAMES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/**
 * Quantos meses no futuro o MonthPicker permite navegar a partir de hoje.
 *
 * Acima desse limite o usuário não consegue avançar — também usado pelo
 * dashboard como teto pra geração de treinos: navegar dentro dessa janela
 * materializa o ano inteiro; fora dela, nada é gravado.
 */
export const MAX_MONTHS_AHEAD = 24

/** Retorna o (mês, ano) máximo permitido pelo cap, considerando `today`. */
export function maxAllowedMonth(today: Date = new Date()): { month: number; year: number } {
  const idx = today.getFullYear() * 12 + today.getMonth() + MAX_MONTHS_AHEAD
  return {
    month: (idx % 12) + 1,
    year: Math.floor(idx / 12),
  }
}

/** True se (m, y) está dentro do cap (≤ máximo permitido). */
export function isMonthAllowed(m: number, y: number, today: Date = new Date()): boolean {
  const cap = maxAllowedMonth(today)
  return y < cap.year || (y === cap.year && m <= cap.month)
}
