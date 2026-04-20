'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, TrendingDown, Wallet, Plus, Pencil, Trash2,
  AlertCircle, Check, X, Loader2, ArrowUpRight, ArrowDownRight,
  Clock, Quote, Dumbbell,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  createManualRevenue, updateManualRevenue, deleteManualRevenue,
  createManualExpense, updateManualExpense, deleteManualExpense,
  listCategoryRevenueBreakdown,
  type CategoryCashFlow, type ManualEntry, type ManualEntryInput,
  type TrainingRevenueBreakdownItem,
} from '@/app/actions/financials'
import {
  confirmPayment, rejectPayment,
  type PendingConfirmation,
} from '@/app/actions/athlete-payments'

// ── Helpers ────────────────────────────────────────────────────────────

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatBRDate(iso: string): string {
  const str = iso.length === 10 ? iso + 'T00:00:00' : iso
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR')
}

// ── Main ───────────────────────────────────────────────────────────────

type Tab = 'overview' | 'categories' | 'confirmations'

interface FinancialsClientProps {
  cashFlow: CategoryCashFlow[]
  manualRevenues: ManualEntry[]
  manualExpenses: ManualEntry[]
  pendingConfirmations: PendingConfirmation[]
  period: { from: string; to: string }
}

export function FinancialsClient({
  cashFlow,
  manualRevenues,
  manualExpenses,
  pendingConfirmations,
  period,
}: FinancialsClientProps) {
  const [tab, setTab] = useState<Tab>('overview')
  // `null` = "Todas" (agregado). Default: Todas, que é a visão mais
  // útil pra quem chega na aba Categorias sem intenção específica. Click
  // em uma categoria na Visão Geral vai setar o id específico.
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  // Totais agregados pra tela "Visão Geral"
  const totals = useMemo(() => {
    return cashFlow.reduce(
      (acc, c) => ({
        auto_revenue: acc.auto_revenue + c.auto_revenue,
        manual_revenue: acc.manual_revenue + c.manual_revenue,
        total_revenue: acc.total_revenue + c.total_revenue,
        total_expense: acc.total_expense + c.total_expense,
        balance: acc.balance + c.balance,
      }),
      { auto_revenue: 0, manual_revenue: 0, total_revenue: 0, total_expense: 0, balance: 0 },
    )
  }, [cashFlow])

  const pendingCount = pendingConfirmations.length

  return (
    <div className="space-y-5">
      {/* ── Abas ─────────────────────────────────────────────────────── */}
      <div className="flex gap-0 border-b border-border/40">
        <TabButton active={tab === 'overview'} onClick={() => setTab('overview')} icon={<Wallet className="h-3.5 w-3.5" />}>
          Visão Geral
        </TabButton>
        <TabButton active={tab === 'categories'} onClick={() => setTab('categories')} icon={<TrendingUp className="h-3.5 w-3.5" />}>
          Categorias
        </TabButton>
        {pendingCount > 0 && (
          <TabButton
            active={tab === 'confirmations'}
            onClick={() => setTab('confirmations')}
            icon={<Clock className="h-3.5 w-3.5" />}
            accent="amber"
            badge={pendingCount}
          >
            Confirmações Pendentes
          </TabButton>
        )}
      </div>

      {/* ── Conteúdo ─────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <OverviewTab
          totals={totals}
          cashFlow={cashFlow}
          onCategoryClick={(id) => {
            setSelectedCategoryId(id)
            setTab('categories')
          }}
        />
      )}

      {tab === 'categories' && (
        <CategoriesTab
          cashFlow={cashFlow}
          manualRevenues={manualRevenues}
          manualExpenses={manualExpenses}
          selectedCategoryId={selectedCategoryId}
          onSelectCategory={setSelectedCategoryId}
          period={period}
        />
      )}

      {tab === 'confirmations' && pendingCount > 0 && (
        <ConfirmationsTab confirmations={pendingConfirmations} />
      )}
    </div>
  )
}

// ── Tab buttons ────────────────────────────────────────────────────────

function TabButton({
  active, onClick, children, icon, badge, accent = 'primary',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  icon?: React.ReactNode
  badge?: number
  accent?: 'primary' | 'amber'
}) {
  const activeColor = accent === 'amber' ? 'border-amber-500 text-amber-700' : 'border-primary text-primary'
  const badgeColor = active
    ? (accent === 'amber' ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground')
    : (accent === 'amber' ? 'bg-amber-50 text-amber-700' : 'bg-muted text-muted-foreground')
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
        active ? activeColor : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      }`}
    >
      {icon}
      {children}
      {badge !== undefined && (
        <span className={`ml-0.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${badgeColor}`}>
          {badge}
        </span>
      )}
    </button>
  )
}

// ── Aba 1: Visão Geral ─────────────────────────────────────────────────

function OverviewTab({
  totals,
  cashFlow,
  onCategoryClick,
}: {
  totals: { auto_revenue: number; manual_revenue: number; total_revenue: number; total_expense: number; balance: number }
  cashFlow: CategoryCashFlow[]
  onCategoryClick: (id: string) => void
}) {
  return (
    <div className="space-y-5">
      {/* Stats principais */}
      <div className="grid gap-3 grid-cols-2 md:gap-4 md:grid-cols-4">
        <StatCard
          label="Receita total"
          value={formatBRL(totals.total_revenue)}
          icon={TrendingUp}
          accent="emerald"
          hint={`Treinos: ${formatBRL(totals.auto_revenue)}  ·  Outras: ${formatBRL(totals.manual_revenue)}`}
        />
        <StatCard
          label="Despesas"
          value={formatBRL(totals.total_expense)}
          icon={TrendingDown}
          accent="rose"
          hint="Despesas do período"
        />
        <StatCard
          label="Saldo do caixa"
          value={formatBRL(totals.balance)}
          icon={Wallet}
          accent={totals.balance >= 0 ? 'indigo' : 'rose'}
          hint={totals.balance >= 0 ? 'Positivo' : 'Negativo'}
        />
        <StatCard
          label="Categorias"
          value={String(cashFlow.length)}
          icon={ArrowUpRight}
          accent="amber"
          hint={cashFlow.length === 0 ? 'Nenhuma cadastrada' : 'Ativas no período'}
        />
      </div>

      {/* Breakdown por categoria */}
      <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
        <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
          <h3 className="text-sm font-semibold font-heading">Caixa por categoria</h3>
          <span className="text-[11px] text-muted-foreground">Clique para ver detalhes</span>
        </div>
        {cashFlow.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma categoria cadastrada.
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {cashFlow.map((c) => (
              <button
                key={c.category_id}
                type="button"
                onClick={() => onCategoryClick(c.category_id)}
                className="w-full flex items-center justify-between gap-4 px-4 py-3 hover:bg-primary/5 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.category_name}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3 text-emerald-600" />
                      {formatBRL(c.total_revenue)}
                    </span>
                    <span className="flex items-center gap-1">
                      <TrendingDown className="h-3 w-3 text-rose-600" />
                      {formatBRL(c.total_expense)}
                    </span>
                  </div>
                </div>
                <div className={`text-sm font-bold font-mono tabular-nums ${c.balance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                  {formatBRL(c.balance)}
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Aba 2: Categorias (detalhe + CRUD) ─────────────────────────────────

/**
 * `selectedCategoryId` pode ser:
 *   • `null` → mostra "Todas" (agregado de toda a org, útil pra visão global
 *     de caixa sem abrir cada categoria separadamente).
 *   • `string` → categoria específica selecionada.
 *
 * Decisão: a opção "Todas" fica como PRIMEIRO item do seletor (posição
 * privilegiada) e é o default quando há mais de uma categoria. Em org com
 * 1 categoria só, "Todas" e a única categoria mostram o mesmo — por isso
 * o default cai na única categoria pra evitar redundância visual.
 */
function CategoriesTab({
  cashFlow,
  manualRevenues,
  manualExpenses,
  selectedCategoryId,
  onSelectCategory,
  period,
}: {
  cashFlow: CategoryCashFlow[]
  manualRevenues: ManualEntry[]
  manualExpenses: ManualEntry[]
  selectedCategoryId: string | null
  onSelectCategory: (id: string | null) => void
  period: { from: string; to: string }
}) {
  const isAll = selectedCategoryId === null
  const selected = cashFlow.find((c) => c.category_id === selectedCategoryId) ?? null

  // Totais agregados pro modo "Todas"
  const aggregateCashFlow = useMemo<CategoryCashFlow>(() => {
    return cashFlow.reduce<CategoryCashFlow>(
      (acc, c) => ({
        category_id: 'all',
        category_name: 'Todas as categorias',
        auto_revenue: acc.auto_revenue + c.auto_revenue,
        manual_revenue: acc.manual_revenue + c.manual_revenue,
        total_revenue: acc.total_revenue + c.total_revenue,
        total_expense: acc.total_expense + c.total_expense,
        balance: acc.balance + c.balance,
        pending_training_count: acc.pending_training_count + c.pending_training_count,
        awaiting_confirmation_count: acc.awaiting_confirmation_count + c.awaiting_confirmation_count,
      }),
      {
        category_id: 'all',
        category_name: 'Todas as categorias',
        auto_revenue: 0,
        manual_revenue: 0,
        total_revenue: 0,
        total_expense: 0,
        balance: 0,
        pending_training_count: 0,
        awaiting_confirmation_count: 0,
      },
    )
  }, [cashFlow])

  // Modo "Todas" = usa todos; modo single = filtra pela categoria
  const filteredRevenues = isAll
    ? manualRevenues
    : manualRevenues.filter((r) => r.category_id === selectedCategoryId)
  const filteredExpenses = isAll
    ? manualExpenses
    : manualExpenses.filter((e) => e.category_id === selectedCategoryId)

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      {/* Seletor vertical de categoria */}
      <div className="lg:w-64 shrink-0">
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border/40">
            <p className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground/70">Selecione</p>
          </div>
          {cashFlow.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Sem categorias
            </div>
          ) : (
            <div className="divide-y divide-border/20 max-h-[400px] overflow-y-auto">
              {/* "Todas" — agregado de tudo (default quando há múltiplas
                  categorias). Aparece mesmo com 1 categoria só, mas aí é
                  redundante — o peso visual do divider ajuda a separar
                  sem exigir lógica condicional. */}
              <button
                type="button"
                onClick={() => onSelectCategory(null)}
                className={`w-full text-left px-3 py-2.5 transition-colors ${
                  isAll ? 'bg-primary/8 text-primary' : 'hover:bg-muted/40'
                }`}
              >
                <p className={`text-sm font-semibold truncate ${isAll ? 'text-primary' : ''}`}>
                  Todas
                </p>
                <p className={`text-[11px] font-mono tabular-nums mt-0.5 ${aggregateCashFlow.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatBRL(aggregateCashFlow.balance)}
                </p>
              </button>

              {cashFlow.map((c) => {
                const isActive = c.category_id === selectedCategoryId
                return (
                  <button
                    key={c.category_id}
                    type="button"
                    onClick={() => onSelectCategory(c.category_id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${
                      isActive ? 'bg-primary/8 text-primary' : 'hover:bg-muted/40'
                    }`}
                  >
                    <p className={`text-sm font-medium truncate ${isActive ? 'text-primary' : ''}`}>
                      {c.category_name}
                    </p>
                    <p className={`text-[11px] font-mono tabular-nums mt-0.5 ${c.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatBRL(c.balance)}
                    </p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detalhe */}
      <div className="flex-1 min-w-0">
        {isAll ? (
          <CategoryDetail
            cashFlow={aggregateCashFlow}
            revenues={filteredRevenues}
            expenses={filteredExpenses}
            allCategories={cashFlow.map((c) => ({ id: c.category_id, name: c.category_name }))}
            trainingCategories={cashFlow.filter((c) => c.auto_revenue > 0).map((c) => ({ id: c.category_id, name: c.category_name, auto_revenue: c.auto_revenue }))}
            period={period}
            isAll
          />
        ) : !selected ? (
          <div className="bg-card rounded-xl border border-dashed border-border/60 p-10 text-center">
            <p className="text-sm text-muted-foreground">Selecione uma categoria para ver o caixa.</p>
          </div>
        ) : (
          <CategoryDetail
            cashFlow={selected}
            revenues={filteredRevenues}
            expenses={filteredExpenses}
            allCategories={cashFlow.map((c) => ({ id: c.category_id, name: c.category_name }))}
            trainingCategories={selected.auto_revenue > 0 ? [{ id: selected.category_id, name: selected.category_name, auto_revenue: selected.auto_revenue }] : []}
            period={period}
            isAll={false}
          />
        )}
      </div>
    </div>
  )
}

function CategoryDetail({
  cashFlow,
  revenues,
  expenses,
  allCategories,
  trainingCategories,
  period,
  isAll,
}: {
  cashFlow: CategoryCashFlow
  revenues: ManualEntry[]
  expenses: ManualEntry[]
  allCategories: Array<{ id: string; name: string }>
  /**
   * Categorias que têm receita automática (auto_revenue > 0) no período.
   * Em modo "Todas": são todas as categorias com pagamentos recebidos.
   * Em modo single: é a própria categoria (se tem receita) ou [].
   * Renderizadas como lista clicável que abre o sheet de drill-down.
   */
  trainingCategories: Array<{ id: string; name: string; auto_revenue: number }>
  period: { from: string; to: string }
  isAll: boolean
}) {
  const [editingRevenue, setEditingRevenue] = useState<ManualEntry | 'new' | null>(null)
  const [editingExpense, setEditingExpense] = useState<ManualEntry | 'new' | null>(null)

  // Drill-down sheet — abre quando coord clica numa linha "Treinos · [cat]".
  // Em modo "Todas", permite escolher qual categoria investigar. Em modo
  // single, só abre pra aquela categoria.
  const [drilldownCat, setDrilldownCat] = useState<{ id: string; name: string } | null>(null)

  return (
    <div className="space-y-4">
      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStat
          label="Receita"
          value={formatBRL(cashFlow.total_revenue)}
          hint={`Treinos: ${formatBRL(cashFlow.auto_revenue)}`}
          tone="emerald"
        />
        <MiniStat
          label="Despesas"
          value={formatBRL(cashFlow.total_expense)}
          hint={expenses.length === 0 ? 'Nenhuma' : `${expenses.length} lançamento(s)`}
          tone="rose"
        />
        <MiniStat
          label="Saldo"
          value={formatBRL(cashFlow.balance)}
          hint={cashFlow.balance >= 0 ? 'Positivo' : 'Negativo'}
          tone={cashFlow.balance >= 0 ? 'indigo' : 'rose'}
        />
      </div>

      {/* Receitas de treinos (drill-down). Só aparece se há auto_revenue.
          Cada linha é um botão — click abre sheet com detalhamento atleta ×
          treino × valor. Em modo "Todas", uma linha por categoria; em modo
          single, uma linha só pra categoria selecionada. */}
      {trainingCategories.length > 0 && (
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
          <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
              <Dumbbell className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold font-heading">Receitas de treinos</h3>
              <p className="text-[11px] text-muted-foreground">Clique pra ver quais atletas pagaram o quê</p>
            </div>
            <div className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
              {formatBRL(cashFlow.auto_revenue)}
            </div>
          </div>
          <div className="divide-y divide-border/30">
            {trainingCategories.map((tc) => (
              <button
                key={tc.id}
                type="button"
                onClick={() => setDrilldownCat({ id: tc.id, name: tc.name })}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50/40 transition-colors text-left"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 shrink-0">
                  <Dumbbell className="h-3 w-3" />
                </span>
                <span className="flex-1 text-sm font-medium truncate">
                  Treinos &middot; {tc.name}
                </span>
                <span className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                  {formatBRL(tc.auto_revenue)}
                </span>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Drill-down sheet — carrega atletas × valores ao abrir */}
      <TrainingRevenueDrilldownSheet
        open={drilldownCat !== null}
        onClose={() => setDrilldownCat(null)}
        category={drilldownCat}
        period={period}
      />

      {/* Receitas */}
      <EntryList
        title="Receitas"
        subtitle="Receitas (treinos, eventos, patrocínios, etc.)"
        entries={revenues}
        tone="emerald"
        onAdd={() => setEditingRevenue('new')}
        onEdit={(e) => setEditingRevenue(e)}
        kind="revenue"
      />

      {/* Despesas */}
      <EntryList
        title="Despesas"
        subtitle="Gastos da categoria (aluguel, material, arbitragem)"
        entries={expenses}
        tone="rose"
        onAdd={() => setEditingExpense('new')}
        onEdit={(e) => setEditingExpense(e)}
        kind="expense"
      />

      {/* Dialog de criar/editar receita. A `key` baseada em entry.id (ou 'new'
          ou 'closed') força remount quando troca de entrada, garantindo que
          o form state resete corretamente sem precisar de setState em effect.
          Em modo "Todas", defaultCategoryId cai na primeira categoria (o coord
          pode trocar no dropdown dentro do dialog). */}
      <ManualEntryDialog
        key={`rev-${editingRevenue === null ? 'closed' : editingRevenue === 'new' ? 'new' : editingRevenue.id}`}
        open={editingRevenue !== null}
        onClose={() => setEditingRevenue(null)}
        kind="revenue"
        entry={editingRevenue === 'new' ? null : editingRevenue}
        defaultCategoryId={isAll ? (allCategories[0]?.id ?? '') : cashFlow.category_id}
        allCategories={allCategories}
      />
      <ManualEntryDialog
        key={`exp-${editingExpense === null ? 'closed' : editingExpense === 'new' ? 'new' : editingExpense.id}`}
        open={editingExpense !== null}
        onClose={() => setEditingExpense(null)}
        kind="expense"
        entry={editingExpense === 'new' ? null : editingExpense}
        defaultCategoryId={isAll ? (allCategories[0]?.id ?? '') : cashFlow.category_id}
        allCategories={allCategories}
      />
    </div>
  )
}

function EntryList({
  title, subtitle, entries, tone, onAdd, onEdit, kind,
}: {
  title: string
  subtitle: string
  entries: ManualEntry[]
  tone: 'emerald' | 'rose'
  onAdd: () => void
  onEdit: (e: ManualEntry) => void
  kind: 'revenue' | 'expense'
}) {
  const router = useRouter()
  const { confirm } = useConfirm()
  const [isPending, startTransition] = useTransition()

  async function handleDelete(entry: ManualEntry) {
    const ok = await confirm({
      title: kind === 'revenue' ? 'Excluir receita?' : 'Excluir despesa?',
      description: `"${entry.description}" — ${formatBRL(entry.amount)}. Essa ação não pode ser desfeita.`,
      variant: 'destructive',
      confirmLabel: 'Excluir',
    })
    if (!ok) return
    startTransition(async () => {
      try {
        if (kind === 'revenue') await deleteManualRevenue(entry.id)
        else await deleteManualExpense(entry.id)
        router.refresh()
      } catch (err) {
        console.error(err)
      }
    })
  }

  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div>
          <h3 className="text-sm font-semibold font-heading">{title}</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <Button type="button" size="sm" onClick={onAdd} className="gap-1.5 h-8">
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </Button>
      </div>
      {entries.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {kind === 'revenue' ? 'Nenhuma receita manual lançada.' : 'Nenhuma despesa lançada.'}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border/20">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${
                  tone === 'emerald'
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300'
                }`}>
                  {tone === 'emerald' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{e.description}</p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{formatBRDate(e.occurred_on)}</span>
                    {e.notes && <>
                      <span>·</span>
                      <span className="truncate">{e.notes}</span>
                    </>}
                  </div>
                </div>
              </div>
              <div className={`text-sm font-bold font-mono tabular-nums shrink-0 ${
                tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
              }`}>
                {formatBRL(e.amount)}
              </div>
              <div className="flex gap-0.5 shrink-0">
                <button
                  onClick={() => onEdit(e)}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(e)}
                  disabled={isPending}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Dialog de criar/editar receita/despesa ─────────────────────────────

function ManualEntryDialog({
  open, onClose, kind, entry, defaultCategoryId, allCategories,
}: {
  open: boolean
  onClose: () => void
  kind: 'revenue' | 'expense'
  entry: ManualEntry | null
  defaultCategoryId: string
  allCategories: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  // Inicialização lazy — roda uma vez no mount. O componente pai passa
  // uma `key` única (baseada no entry.id ou 'new') pra forçar remount
  // sempre que o alvo de edição mudar; assim evitamos o anti-pattern de
  // setState em useEffect pra sincronizar props → state.
  const [form, setForm] = useState<ManualEntryInput>(() => ({
    category_id: entry?.category_id ?? defaultCategoryId,
    description: entry?.description ?? '',
    amount: entry?.amount ?? 0,
    occurred_on: entry?.occurred_on ?? new Date().toISOString().slice(0, 10),
    notes: entry?.notes ?? '',
  }))

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      try {
        const input: ManualEntryInput = {
          ...form,
          amount: Number(form.amount),
        }
        if (kind === 'revenue') {
          if (entry) await updateManualRevenue(entry.id, input)
          else await createManualRevenue(input)
        } else {
          if (entry) await updateManualExpense(entry.id, input)
          else await createManualExpense(input)
        }
        onClose()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar.')
      }
    })
  }

  const title = entry
    ? (kind === 'revenue' ? 'Editar receita' : 'Editar despesa')
    : (kind === 'revenue' ? 'Nova receita' : 'Nova despesa')

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Categoria *</Label>
            <select
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
              required
              disabled={isPending}
              className="w-full h-9 px-3 rounded-md border border-border/60 bg-background text-sm"
            >
              {allCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Descrição *</Label>
            <Input
              placeholder={kind === 'revenue' ? 'Ex: Patrocínio Mercado Bom Preço' : 'Ex: Aluguel da quadra — abril'}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="h-9"
              required
              disabled={isPending}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Valor (R$) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                value={form.amount || ''}
                onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
                className="h-9 font-mono"
                required
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Data *</Label>
              <Input
                type="date"
                value={form.occurred_on}
                onChange={(e) => setForm((f) => ({ ...f, occurred_on: e.target.value }))}
                className="h-9"
                required
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Observações</Label>
            <Textarea
              placeholder="Opcional"
              value={form.notes ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="min-h-[60px] text-sm"
              disabled={isPending}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 px-3 py-2 rounded-lg border border-destructive/15">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending} className="h-9">
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className="h-9 gap-1.5">
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {entry ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Aba 3: Confirmações pendentes ──────────────────────────────────────

function ConfirmationsTab({ confirmations }: { confirmations: PendingConfirmation[] }) {
  const router = useRouter()
  const { confirm } = useConfirm()
  const [isPending, startTransition] = useTransition()

  function handleConfirm(c: PendingConfirmation) {
    startTransition(async () => {
      try {
        await confirmPayment({ kind: c.kind, id: c.id })
        router.refresh()
      } catch (err) {
        console.error(err)
      }
    })
  }

  async function handleReject(c: PendingConfirmation) {
    const ok = await confirm({
      title: 'Rejeitar pagamento?',
      description: `O pagamento de ${c.member_name} vai voltar para "pendente". O atleta pode marcar como pago novamente.`,
      variant: 'destructive',
      confirmLabel: 'Rejeitar',
    })
    if (!ok) return
    startTransition(async () => {
      try {
        await rejectPayment({ kind: c.kind, id: c.id })
        router.refresh()
      } catch (err) {
        console.error(err)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <Clock className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
        <div className="flex-1 leading-relaxed">
          <strong className="font-semibold">{confirmations.length} pagamento(s) aguardando sua confirmação.</strong>{' '}
          Verifique o PIX/recebimento e aprove ou rejeite.
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
        <div className="divide-y divide-border/20">
          {confirmations.map((c) => (
            <div key={`${c.kind}-${c.id}`} className="px-4 py-3 hover:bg-muted/20 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 ring-1 ring-amber-200 flex items-center justify-center text-amber-700 font-semibold text-sm">
                  {c.member_name.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.member_name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.category_name} · {c.kind === 'training' ? 'Treino ' : 'Mensalidade '}
                    {c.reference_label}
                  </p>
                </div>
                <div className="text-sm font-bold font-mono tabular-nums shrink-0">
                  {formatBRL(c.amount)}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleReject(c)}
                    disabled={isPending}
                    className="h-8 gap-1 text-rose-700 border-rose-300 hover:bg-rose-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Rejeitar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleConfirm(c)}
                    disabled={isPending}
                    className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Confirmar
                  </Button>
                </div>
              </div>

              {/* Observação que o atleta escreveu — aparece em "balão" abaixo
                  do header da row. Dá contexto pro coord decidir confirmar
                  (ex: ver "paguei via PIX pro X" antes de conferir extrato).
                  Mantém visualmente separado via indent + ícone de aspas. */}
              {c.note && (
                <div className="mt-2 ml-12 flex items-start gap-2 rounded-lg bg-muted/40 border border-border/40 px-3 py-2">
                  <Quote className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/60" />
                  <p className="text-[12px] text-foreground/80 leading-relaxed italic whitespace-pre-wrap break-words flex-1">
                    {c.note}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Componentes auxiliares de stat ─────────────────────────────────────

function StatCard({
  label, value, icon: Icon, accent, hint,
}: {
  label: string
  value: string
  icon: React.ComponentType<{ className?: string }>
  accent: 'indigo' | 'amber' | 'rose' | 'emerald'
  hint?: string
}) {
  const accentMap = {
    indigo: { border: 'border-l-indigo-500', icon: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/15 dark:text-indigo-300' },
    amber:  { border: 'border-l-amber-500',  icon: 'text-amber-600 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300' },
    rose:   { border: 'border-l-rose-500',   icon: 'text-rose-600 bg-rose-50 dark:bg-rose-500/15 dark:text-rose-300' },
    emerald:{ border: 'border-l-emerald-500',icon: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300' },
  } as const
  const styles = accentMap[accent]
  return (
    <div className={`bg-card rounded-xl border border-border/50 border-l-[3px] ${styles.border} p-4 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] hover:shadow-[0_4px_12px_0_rgb(0_0_0/0.06)] hover:-translate-y-0.5 transition-all duration-200`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">{label}</span>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-lg md:text-xl font-bold tracking-tight mt-2 font-mono tabular-nums">{value}</div>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </div>
  )
}

function MiniStat({
  label, value, hint, tone,
}: {
  label: string
  value: string
  hint?: string
  tone: 'emerald' | 'rose' | 'indigo'
}) {
  const toneClass =
    tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-400' :
    tone === 'rose'    ? 'text-rose-700 dark:text-rose-400' :
                         'text-indigo-700 dark:text-indigo-400'
  return (
    <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] p-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">{label}</p>
      <p className={`text-base font-bold mt-0.5 font-mono tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground/70 mt-0.5 truncate">{hint}</p>}
    </div>
  )
}

// ── Sheet de drill-down da receita de treinos por categoria ──────────

/**
 * Slide-in que abre quando o coord clica em "Treinos - [Categoria]" na
 * Visão Geral do /financials. Mostra a lista discriminada de atletas ×
 * treinos (ou mensalidades) × valores que compõem aquele total.
 *
 * Carrega os dados via `listCategoryRevenueBreakdown` quando abre; mantém
 * o cache enquanto o user navega entre categorias (cada categoria é
 * independente, chave no useState).
 */
function TrainingRevenueDrilldownSheet({
  open, onClose, category, period,
}: {
  open: boolean
  onClose: () => void
  category: { id: string; name: string } | null
  period: { from: string; to: string }
}) {
  const [items, setItems] = useState<TrainingRevenueBreakdownItem[] | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (catId: string) => {
    setLoading(true)
    try {
      const data = await listCategoryRevenueBreakdown(catId, period.from, period.to)
      setItems(data)
    } catch (err) {
      console.error('[TrainingRevenueDrilldownSheet]', err)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [period.from, period.to])

  // Recarrega sempre que muda a categoria aberta (ou período).
  useEffect(() => {
    if (open && category) {
      void load(category.id)
    } else if (!open) {
      setItems(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id, period.from, period.to])

  const total = useMemo(
    () => (items ?? []).reduce((acc, i) => acc + i.amount, 0),
    [items],
  )

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-[92vw] sm:w-[440px] sm:max-w-[440px]"
      >
        <SheetHeader className="pb-3 border-b border-border/40">
          <SheetTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
              <Dumbbell className="h-3.5 w-3.5" />
            </span>
            Receitas · {category?.name ?? ''}
          </SheetTitle>
          <SheetDescription>
            Atletas que geraram esse valor no período
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading && (
            <div className="py-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}
          {!loading && items && items.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum pagamento registrado neste período.
              </p>
            </div>
          )}
          {!loading && items && items.length > 0 && (
            <div className="divide-y divide-border/30">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 py-2.5">
                  <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-50 ring-1 ring-emerald-200 flex items-center justify-center text-[10px] font-semibold text-emerald-700">
                    {item.member_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.member_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {item.kind === 'training' ? 'Treino' : 'Mensalidade'} · {item.reference_label}
                    </p>
                  </div>
                  <span className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 shrink-0">
                    {formatBRL(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer com total */}
        <div className="mt-auto border-t border-border/40 bg-emerald-50/30 px-4 py-3 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
            Total
          </span>
          <span className="text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatBRL(total)}
          </span>
        </div>
      </SheetContent>
    </Sheet>
  )
}

