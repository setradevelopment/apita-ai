'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Wallet, Clock, CheckCircle2, AlertCircle, Loader2,
  Calendar, Tag, ArrowUp, ArrowDown, Filter, X, RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { markAsPaid, type MyPayment } from '@/app/actions/athlete-payments'

// ── Helpers ────────────────────────────────────────────────────────────

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatBRDate(iso: string): string {
  const str = iso.length === 10 ? iso + 'T00:00:00' : iso
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR')
}

function formatMonthLabel(month: number, year: number): string {
  const names = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ]
  return `${names[month - 1]} ${year}`
}

function paymentTypeLabel(t: string): string {
  switch (t) {
    case 'drop_in': return 'Avulso'
    case 'weekly': return 'Semanal'
    case 'monthly': return 'Mensal'
    case 'semiannual': return 'Semestral'
    case 'annual': return 'Anual'
    default: return t
  }
}

/** Retorna o "date key" normalizado pra ordenação (YYYY-MM-DD). */
function dateKeyOf(p: MyPayment): string {
  if (p.kind === 'training') return p.training_date
  // Monthly: usa o dia 01 do mês como proxy
  return `${p.year}-${String(p.month).padStart(2, '0')}-01`
}

/** Hoje em YYYY-MM-DD (timezone local — consistente com input type=date). */
function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Mês atual em YYYY-MM — usado pra filtrar mensalidades futuras. */
function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Main ───────────────────────────────────────────────────────────────

type FilterTab = 'pending' | 'paid' | 'all'
type SortDir = 'asc' | 'desc'

export function AthleteFinancialsClient({ payments }: { payments: MyPayment[] }) {
  const [tab, setTab] = useState<FilterTab>('pending')
  // Default de ordenação muda por aba:
  //   • pending → asc (mais antigo primeiro — o mais urgente a pagar)
  //   • paid/all → desc (mais recente primeiro — histórico)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  // Categorias únicas pra filtro (ordenadas alfabeticamente)
  const availableCategories = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of payments) {
      if (!map.has(p.category_id)) map.set(p.category_id, p.category_name)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [payments])

  // Conta "pendente" + "aguardando" pro badge (pendente aqui já respeita
  // o filtro "sem futuros" — o atleta só vê o que ele DEVE ver).
  const today = todayKey()
  const currentYM = currentMonthKey()

  const pendingFiltered = useMemo(() => {
    return payments.filter((p) => {
      // Só status pendente ou aguardando
      const isPendingLike = p.payment_status === 'pending' || p.payment_status === 'awaiting_confirmation'
      if (!isPendingLike) return false
      // Esconde FUTUROS — treinos com data > hoje, ou mensalidades com mês > atual
      if (p.kind === 'training') {
        if (p.training_date > today) return false
      } else {
        const ym = `${p.year}-${String(p.month).padStart(2, '0')}`
        if (ym > currentYM) return false
      }
      return true
    })
  }, [payments, today, currentYM])

  const paidFiltered = useMemo(
    () => payments.filter((p) => p.payment_status === 'paid'),
    [payments],
  )

  const counts = {
    pending: pendingFiltered.length,
    paid: paidFiltered.length,
    all: payments.length,
  }

  // Estornos = valores que o clube deve devolver pro atleta. Aparece como
  // card "A receber" (separado dos pendentes, que são dívidas dele).
  const refundedFiltered = useMemo(
    () => payments.filter((p) => p.payment_status === 'refunded'),
    [payments],
  )

  const totals = useMemo(() => {
    const pendingAmount = pendingFiltered
      .filter((p) => p.payment_status === 'pending')
      .reduce((acc, p) => acc + p.amount, 0)
    const awaitingAmount = pendingFiltered
      .filter((p) => p.payment_status === 'awaiting_confirmation')
      .reduce((acc, p) => acc + p.amount, 0)
    const refundedAmount = refundedFiltered.reduce((acc, p) => acc + p.amount, 0)
    const paidAmount = paidFiltered.reduce((acc, p) => acc + p.amount, 0)
    return { pendingAmount, awaitingAmount, paidAmount, refundedAmount }
  }, [pendingFiltered, paidFiltered, refundedFiltered])

  // Lista efetiva da aba atual, depois filtro de categoria, depois sort.
  const visible = useMemo(() => {
    const base = tab === 'pending' ? pendingFiltered
      : tab === 'paid' ? paidFiltered
      : payments
    const byCategory = categoryFilter === 'all'
      ? base
      : base.filter((p) => p.category_id === categoryFilter)
    // Sort por data
    return [...byCategory].sort((a, b) => {
      const ka = dateKeyOf(a)
      const kb = dateKeyOf(b)
      return sortDir === 'asc' ? ka.localeCompare(kb) : kb.localeCompare(ka)
    })
  }, [tab, pendingFiltered, paidFiltered, payments, categoryFilter, sortDir])

  // Troca de aba reseta defaults razoáveis — pendentes começam asc,
  // demais começam desc. Filtro de categoria persiste (se o user estava
  // olhando uma categoria específica, faz sentido continuar na nova aba).
  function handleTabChange(next: FilterTab) {
    setTab(next)
    setSortDir(next === 'pending' ? 'asc' : 'desc')
  }

  return (
    <div className="space-y-5">
      {/* Stats. Grid dinâmico: 3 cols normalmente, 4 quando há estornos
          (card "A receber" entra no fim). */}
      <div className={`grid grid-cols-1 gap-3 ${
        totals.refundedAmount > 0 ? 'sm:grid-cols-2 md:grid-cols-4' : 'sm:grid-cols-3'
      }`}>
        <SummaryCard
          label="A pagar"
          value={formatBRL(totals.pendingAmount)}
          hint={counts.pending === 0 ? 'Tudo em dia!' : `${counts.pending} pendência(s) — só até o mês atual`}
          tone={totals.pendingAmount > 0 ? 'amber' : 'emerald'}
          icon={Wallet}
        />
        <SummaryCard
          label="Aguardando confirmação"
          value={formatBRL(totals.awaitingAmount)}
          hint="Coord vai validar"
          tone="indigo"
          icon={Clock}
        />
        <SummaryCard
          label="Já pago"
          value={formatBRL(totals.paidAmount)}
          hint={`${counts.paid} pagamento(s)`}
          tone="emerald"
          icon={CheckCircle2}
        />
        {/* Card "A receber" — só aparece quando há estornos. Valor que o
            clube deve devolver pro atleta. Cor violeta pra diferenciar
            das outras categorias (pending=amber, awaiting=indigo, paid=emerald). */}
        {totals.refundedAmount > 0 && (
          <SummaryCard
            label="A receber (estornos)"
            value={formatBRL(totals.refundedAmount)}
            hint={`${refundedFiltered.length} pagamento(s) estornado(s)`}
            tone="violet"
            icon={RotateCcw}
          />
        )}
      </div>

      {/* Abas de filtro */}
      <div className="flex gap-0 border-b border-border/40">
        <FilterButton active={tab === 'pending'} onClick={() => handleTabChange('pending')} accent="amber">
          Pendentes
          <span className={`ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${tab === 'pending' ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700'}`}>
            {counts.pending}
          </span>
        </FilterButton>
        <FilterButton active={tab === 'paid'} onClick={() => handleTabChange('paid')} accent="emerald">
          Pagos
          <span className={`ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${tab === 'paid' ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
            {counts.paid}
          </span>
        </FilterButton>
        <FilterButton active={tab === 'all'} onClick={() => handleTabChange('all')} accent="primary">
          Todos
          <span className={`ml-1.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 ${tab === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            {counts.all}
          </span>
        </FilterButton>
      </div>

      {/* Toolbar: sort + filtro por categoria */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md border border-border/60 bg-card hover:bg-muted/40 transition-colors"
          title="Alterar ordenação"
        >
          {sortDir === 'asc' ? (
            <>
              <ArrowUp className="h-3.5 w-3.5" />
              Mais antigo primeiro
            </>
          ) : (
            <>
              <ArrowDown className="h-3.5 w-3.5" />
              Mais recente primeiro
            </>
          )}
        </button>

        {availableCategories.length > 1 && (
          <>
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
              <Filter className="h-3.5 w-3.5" />
              <span>Categoria:</span>
            </div>
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
              }`}
            >
              Todas
            </button>
            {availableCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryFilter(c.id)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  categoryFilter === c.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
                }`}
              >
                {c.name}
              </button>
            ))}
            {categoryFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1"
                title="Limpar filtro de categoria"
              >
                <X className="h-3 w-3" />
                Limpar
              </button>
            )}
          </>
        )}
      </div>

      {/* Lista */}
      {visible.length === 0 ? (
        <EmptyState tab={tab} hasCategoryFilter={categoryFilter !== 'all'} />
      ) : (
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
          <div className="divide-y divide-border/20">
            {visible.map((p) => (
              <PaymentRow key={`${p.kind}-${p.id}`} payment={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Row individual ─────────────────────────────────────────────────────

function PaymentRow({ payment }: { payment: MyPayment }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [noteDialog, setNoteDialog] = useState(false)
  const [note, setNote] = useState('')

  function handleSubmitNote(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      try {
        await markAsPaid({
          kind: payment.kind,
          id: payment.id,
          note: note.trim() || undefined,
        })
        setNoteDialog(false)
        setNote('')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao marcar.')
      }
    })
  }

  const isPendingStatus = payment.payment_status === 'pending'
  const isAwaiting = payment.payment_status === 'awaiting_confirmation'
  const isPaid = payment.payment_status === 'paid'

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Ícone de status */}
        <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center ${
          isPaid
            ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300'
            : isAwaiting
            ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300'
            : 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
        }`}>
          {isPaid ? <CheckCircle2 className="h-4 w-4" /> : isAwaiting ? <Clock className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium truncate">
              {payment.kind === 'training'
                ? `Treino ${formatBRDate(payment.training_date)}`
                : `Mensalidade ${formatMonthLabel(payment.month, payment.year)}`}
            </p>
            <StatusBadge status={payment.payment_status} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
            <span className="flex items-center gap-1">
              {/* Logo da categoria no lugar do ícone Tag genérico. Fallback
                  pra ícone quando a categoria não tem logo configurado. */}
              {payment.category_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={payment.category_logo_url}
                  alt=""
                  className="h-3 w-3 rounded object-cover"
                />
              ) : (
                <Tag className="h-3 w-3" />
              )}
              {payment.category_name}
            </span>
            {payment.kind === 'training' && (
              <>
                <span>·</span>
                <span>{paymentTypeLabel(payment.payment_type)}</span>
                {/* Presença do atleta no treino — só aparece quando o coord
                    já marcou algo (attendance_status !== null). Dá contexto
                    pro atleta conferir "eu fui nesse treino?" antes de pagar. */}
                {payment.attendance_status && (
                  <>
                    <span>·</span>
                    <span className={`inline-flex items-center gap-0.5 font-semibold ${
                      payment.attendance_status === 'present'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}>
                      {payment.attendance_status === 'present' ? (
                        <>
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Presente
                        </>
                      ) : (
                        <>
                          <X className="h-2.5 w-2.5" />
                          Faltou
                        </>
                      )}
                    </span>
                  </>
                )}
              </>
            )}
          </div>
          {error && (
            <p className="text-[11px] text-destructive mt-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3 shrink-0" />
              {error}
            </p>
          )}
        </div>

        {/* Valor */}
        <div className={`text-sm font-bold font-mono tabular-nums shrink-0 ${
          isPaid ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground'
        }`}>
          {formatBRL(payment.amount)}
        </div>

        {/* Ação */}
        {isPendingStatus && (
          <Button
            size="sm"
            onClick={() => setNoteDialog(true)}
            disabled={isPending}
            className="h-8 gap-1.5 shrink-0"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Paguei
          </Button>
        )}
      </div>

      {/* Dialog "Alguma observação?" — substitui o confirm() antigo.
          A observação vai pro coord na lista de confirmações, ajudando-o
          a validar (ex: "paguei via PIX", "depositei segunda à tarde"). */}
      <Dialog open={noteDialog} onOpenChange={(o) => { if (!o) setNoteDialog(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Alguma observação para adicionar? :D</DialogTitle>
            <DialogDescription>
              {payment.kind === 'training'
                ? `Marcar o treino de ${formatBRDate(payment.training_date)} (${payment.category_name}) como pago.`
                : `Marcar a mensalidade de ${formatMonthLabel(payment.month, payment.year)} (${payment.category_name}) como paga.`}
              {' '}O valor é <strong>{formatBRL(payment.amount)}</strong>. O coordenador vai receber sua observação junto com o pedido de confirmação.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitNote} className="space-y-3">
            <Textarea
              placeholder="Ex: Paguei via PIX pro número 11 99999-9999 — hoje de manhã"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[90px] text-sm"
              maxLength={500}
              disabled={isPending}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground/70 leading-snug">
              Opcional. Você só deve marcar como pago depois de efetivamente ter
              feito o pagamento. O coord vai verificar antes de confirmar.
            </p>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 px-3 py-2 rounded-lg border border-destructive/15">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setNoteDialog(false)}
                disabled={isPending}
                className="h-9"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="h-9 gap-1.5">
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <CheckCircle2 className="h-3.5 w-3.5" />
                Confirmar pagamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function StatusBadge({ status }: { status: MyPayment['payment_status'] }) {
  switch (status) {
    case 'paid':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
          <CheckCircle2 className="h-2.5 w-2.5" />
          Pago
        </span>
      )
    case 'awaiting_confirmation':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30">
          <Clock className="h-2.5 w-2.5" />
          Aguardando
        </span>
      )
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
          <Wallet className="h-2.5 w-2.5" />
          Pendente
        </span>
      )
    case 'refunded':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200">
          Estornado
        </span>
      )
    case 'no_payment':
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-50 text-slate-700 border border-slate-200">
          Sem cobrança
        </span>
      )
  }
}

// ── Auxiliares ─────────────────────────────────────────────────────────

function EmptyState({ tab, hasCategoryFilter }: { tab: FilterTab; hasCategoryFilter: boolean }) {
  // Se tem filtro de categoria aplicado, a mensagem muda pra ser específica
  if (hasCategoryFilter) {
    return (
      <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center py-14 text-center px-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
          <Filter className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold">Nada encontrado nessa categoria</p>
        <p className="text-[11px] text-muted-foreground mt-1">Tente outra categoria ou clique em &quot;Todas&quot;.</p>
      </div>
    )
  }

  const messages = {
    pending: {
      title: 'Você está em dia!',
      hint: 'Nenhum pagamento pendente pro mês atual ou anterior.',
      icon: CheckCircle2,
      color: 'emerald',
    },
    paid: {
      title: 'Sem pagamentos registrados',
      hint: 'Seus pagamentos confirmados vão aparecer aqui.',
      icon: Wallet,
      color: 'indigo',
    },
    all: {
      title: 'Nenhum pagamento',
      hint: 'Você ainda não tem treinos ou mensalidades lançadas.',
      icon: Calendar,
      color: 'muted',
    },
  } as const
  const m = messages[tab]
  const iconClass =
    m.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
    m.color === 'indigo'  ? 'bg-indigo-50 text-indigo-600' :
                            'bg-muted text-muted-foreground'
  return (
    <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center py-14 text-center px-5">
      <div className={`flex h-16 w-16 items-center justify-center rounded-full ${iconClass} mb-3`}>
        <m.icon className="h-6 w-6" />
      </div>
      <p className="text-sm font-semibold">{m.title}</p>
      <p className="text-[11px] text-muted-foreground mt-1">{m.hint}</p>
    </div>
  )
}

function FilterButton({
  active, onClick, children, accent,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  accent: 'amber' | 'emerald' | 'primary'
}) {
  const activeColor =
    accent === 'amber'   ? 'border-amber-500 text-amber-700' :
    accent === 'emerald' ? 'border-emerald-500 text-emerald-700' :
                           'border-primary text-primary'
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
        active ? activeColor : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
      }`}
    >
      {children}
    </button>
  )
}

function SummaryCard({
  label, value, hint, tone, icon: Icon,
}: {
  label: string
  value: string
  hint?: string
  tone: 'amber' | 'emerald' | 'indigo' | 'violet'
  icon: React.ComponentType<{ className?: string }>
}) {
  const accentMap = {
    amber:  { border: 'border-l-amber-500',  icon: 'text-amber-600 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300' },
    emerald:{ border: 'border-l-emerald-500',icon: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300' },
    indigo: { border: 'border-l-indigo-500', icon: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/15 dark:text-indigo-300' },
    violet: { border: 'border-l-violet-500', icon: 'text-violet-600 bg-violet-50 dark:bg-violet-500/15 dark:text-violet-300' },
  } as const
  const styles = accentMap[tone]
  return (
    <div className={`bg-card rounded-xl border border-border/50 border-l-[3px] ${styles.border} p-4 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]`}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">{label}</span>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-xl md:text-2xl font-bold tracking-tight mt-2 font-mono tabular-nums">{value}</div>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </div>
  )
}
