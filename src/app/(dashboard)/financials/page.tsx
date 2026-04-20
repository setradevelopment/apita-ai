import { getSessionContext } from '@/lib/auth/session'
import { computeCashFlow, listManualRevenues, listManualExpenses } from '@/app/actions/financials'
import { FinancialsClient } from './financials-client'
import { AthleteFinancialsClient } from './athlete-financials-client'
import {
  listMyPayments,
  listPendingConfirmations,
} from '@/app/actions/athlete-payments'

/**
 * Página `/financials` — dois modos baseados em role:
 *
 *   • `admin` / `coordinator` → dashboard completo com abas:
 *       - Visão Geral: caixa total da org + breakdown por categoria
 *       - Categorias: por categoria, tabela de receitas (auto + manuais) +
 *         despesas + saldo. CRUD de receitas/despesas manuais.
 *       - Confirmações Pendentes: atletas que marcaram "paguei" aguardando
 *         confirmação (fase 4).
 *
 *   • `member` / atleta → lista dos PRÓPRIOS treinos e pagamentos. Pode
 *     marcar "paguei" em pendentes (vira awaiting_confirmation até o
 *     coord confirmar).
 *
 * O período default é o mês atual. Pode ser ajustado via query string
 * `?from=YYYY-MM-DD&to=YYYY-MM-DD` no futuro.
 */
export default async function FinancialsPage() {
  const { orgId, role } = await getSessionContext()
  if (!orgId) throw new Error('Organização não definida.')

  // ── Modo atleta ──────────────────────────────────────────────────────
  if (role === 'member') {
    const payments = await listMyPayments()
    return (
      <div className="space-y-5 fade-in">
        <div>
          <h2 className="text-xl font-semibold tracking-tight font-heading">
            Meu Financeiro
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Histórico de treinos e pagamentos
          </p>
        </div>
        <AthleteFinancialsClient payments={payments} />
      </div>
    )
  }

  // ── Modo contratante/coord ───────────────────────────────────────────
  if (role !== 'admin' && role !== 'coordinator') {
    throw new Error('Sem permissão para ver o financeiro.')
  }

  // Período: mês atual (pode virar configurável via query string depois)
  const today = new Date()
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const daysInMonth = new Date(year, month, 0).getDate()
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

  const [cashFlow, manualRevenues, manualExpenses, pendingConfirmations] =
    await Promise.all([
      computeCashFlow(from, to),
      listManualRevenues(),
      listManualExpenses(),
      listPendingConfirmations(),
    ])

  return (
    <div className="space-y-5 fade-in">
      <div>
        <h2 className="text-xl font-semibold tracking-tight font-heading">
          Financeiro
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Caixa do clube por categoria · {formatMonthLabel(year, month)}
        </p>
      </div>
      <FinancialsClient
        cashFlow={cashFlow}
        manualRevenues={manualRevenues}
        manualExpenses={manualExpenses}
        pendingConfirmations={pendingConfirmations}
        period={{ from, to }}
      />
    </div>
  )
}

function formatMonthLabel(year: number, month: number): string {
  const names = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ]
  return `${names[month - 1]} de ${year}`
}
