'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MapPin, Clock, Users, ExternalLink,
  ArrowUp, ArrowDown, ChevronsUpDown, AlertCircle, Funnel, X,
  CircleDollarSign, TrendingUp, ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// ── Tipos (vindos do page.tsx) ─────────────────────────────────────────

interface Training {
  id: string
  date: string
  status: string
}

interface Member {
  id: string
  name: string
  member_category_positions: { category_id: string; position_id: string }[]
}

interface Payment {
  member_id: string
  month: number
  year: number
  is_monthly_payer: boolean
  payment_status: string | null
}

interface Attendance {
  training_id: string
  member_id: string
  status: string
  payment_type: string | null
  payment_status: string | null
}

interface Position {
  id: string
  name: string
}

interface Category {
  id: string
  name: string
  days_of_week: string[]
  start_time: string
  end_time: string
  location: string
  observations?: string
  has_monthly: boolean
  price_monthly: number
  /**
   * URL pública do logo (Supabase Storage `category-logos`). Opcional —
   * categorias antigas ou que o admin ainda não configurou caem no
   * fallback da inicial estilizada. Upload via `settings/categories-section.tsx`.
   */
  logo_url?: string | null
}

// ── Filtros / Sort ─────────────────────────────────────────────────────

/**
 * Pendências — filtro boolean simplificado.
 *   `all`     → sem filtro
 *   `pending` → só atletas com 1+ pendências em aberto
 *   `ok`      → só atletas sem pendências (em dia)
 */
type PendingFilter = 'all' | 'pending' | 'ok'

/**
 * Assiduidade — modo livre (o usuário digita o %), não mais faixas fixas.
 *   `all` → sem filtro
 *   `gte` → atletas com assiduidade ≥ valor
 *   `lte` → atletas com assiduidade ≤ valor
 *
 * Quando o modo é gte/lte, `attendanceValue` guarda o número (0–100).
 * Atletas sem base (sem treinos no período) são excluídos do resultado
 * quando há filtro ativo — intuitivo: "≥50%" não mostra quem não tem dado.
 */
type AttendanceMode = 'all' | 'gte' | 'lte'

type SortCol = 'name' | 'pending' | 'attendance' | 'trainings'
type SortDir = 'asc' | 'desc'

// ── Row (dados pré-computados) ─────────────────────────────────────────

interface Row {
  member: Member
  positionsLabel: string
  /** Pendências totais no período (per-training drop_in + monthly_payments). */
  pendingCount: number
  /** Total de treinos não-cancelados que o atleta "deveria ter comparecido". */
  totalScheduled: number
  /** Quantas presenças confirmadas no período. */
  presentCount: number
  /** `null` quando não há treinos no período (denominador zero). */
  attendancePct: number | null
}

const MONTH_NAMES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// Records value→label que o Base UI Select usa via prop `items` pra exibir
// o label certo no trigger (em vez do value bruto). Padrão herdado do
// trainings-client.tsx — mantém consistência visual entre as duas telas.
const PENDING_FILTER_LABELS: Record<string, string> = {
  all:     'Todos',
  pending: 'Somente pendentes',
  ok:      'Somente em dia',
}

const ATTENDANCE_MODE_LABELS: Record<string, string> = {
  all: 'Todos',
  gte: 'Igual ou maior que',
  lte: 'Igual ou menor que',
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatDateBR(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

/** Hoje no formato YYYY-MM-DD (local timezone). */
function todayIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function monthStart(iso: string): string {
  return iso.slice(0, 7) + '-01'
}

function monthEnd(iso: string): string {
  const [y, m] = iso.slice(0, 7).split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return `${iso.slice(0, 7)}-${String(last).padStart(2, '0')}`
}

function yearStart(iso: string): string {
  return iso.slice(0, 4) + '-01-01'
}

function yearEnd(iso: string): string {
  return iso.slice(0, 4) + '-12-31'
}

// ── Presets de período ───────────────────────────────────────────────
// Declarados no módulo pra: (a) reuso entre render (pills) e action
// (applyPreset), e (b) checagem de "preset ativo" comparando os valores
// computados com o range atual sem refatorar a lógica em dois lugares.

type PresetId = 'thisMonth' | 'last30' | 'thisYear'

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'thisMonth', label: 'Este mês' },
  { id: 'last30',    label: 'Últimos 30 dias' },
  { id: 'thisYear',  label: 'Este ano' },
]

function computePreset(id: PresetId): { from: string; to: string } {
  const today = todayIso()
  if (id === 'thisMonth') return { from: monthStart(today), to: monthEnd(today) }
  if (id === 'last30')    return { from: addDays(today, -29), to: today }
  return { from: yearStart(today), to: yearEnd(today) }
}

/**
 * Gera o label curto do período pro header. Ex:
 * - Mesmo mês/ano: "Abril 2026"
 * - Range mais amplo: "01/04/2026 – 30/06/2026"
 */
function rangeLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  const lastFrom = new Date(fy, fm, 0).getDate()
  const isFullMonth =
    fy === ty && fm === tm && fd === 1 && td === lastFrom
  if (isFullMonth) return `${MONTH_NAMES[fm]} ${fy}`
  return `${formatDateBR(from)} – ${formatDateBR(to)}`
}

// ── Main ───────────────────────────────────────────────────────────────

export function CategoryClient({
  category,
  trainings,
  members,
  payments,
  attendances,
  positions,
  from,
  to,
  hidePaymentsOfOthers = false,
}: {
  category: Category
  trainings: Training[]
  members: Member[]
  payments: Payment[]
  attendances: Attendance[]
  positions: Position[]
  from: string
  to: string
  /**
   * Quando `true`, a coluna de Pendências na tabela some. Usado pra atleta:
   * ele não deve ver quantos pagamentos pendentes seus colegas têm — é
   * informação financeira privada. O ranking de assiduidade permanece
   * visível (comportamento competitivo/positivo, sem sensibilidade).
   */
  hidePaymentsOfOthers?: boolean
}) {
  const router = useRouter()

  // Inputs do range de datas. Separados de `from`/`to` pra permitir que o
  // usuário edite sem refetch instantâneo — push só no "Aplicar".
  const [localFrom, setLocalFrom] = useState(from)
  const [localTo, setLocalTo] = useState(to)

  // Filtros (puros cliente — não re-fetch)
  // `pendingFilter` e `attendanceMode`/`attendanceValue` substituem o antigo
  // `onlyPending` booleano + `band` fixa. Mais flexível e alinha com a UI
  // pedida (dropdown de Pendências + Assiduidade com valor livre).
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>('all')
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>('all')
  // String vazia = nenhum valor digitado. Mantemos como string (não number)
  // pra não confundir zero legítimo com "vazio"; parse só no filtro.
  const [attendanceValue, setAttendanceValue] = useState<string>('')

  // Drawer de filtros (abre do lado direito, estilo slide-in).
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Sort (puro cliente). Default depende da perspectiva:
  //   • Atleta: assiduidade desc (ranking do maior → menor). Foco em
  //     comparar desempenho de quem treina mais.
  //   • Coord/admin: nome asc (leitura operacional — procura por nome).
  // Em ambos os casos o coord pode clicar em qualquer coluna pra inverter.
  const [sortBy, setSortBy] = useState<{ col: SortCol; dir: SortDir } | null>(
    hidePaymentsOfOthers
      ? { col: 'attendance', dir: 'desc' }
      : { col: 'name', dir: 'asc' },
  )

  // ── Cálculo das rows (métricas por atleta) ───────────────────────────
  const rows: Row[] = useMemo(() => {
    const nonCancelled = trainings.filter((t) => t.status !== 'cancelled')

    // Indexa attendances e payments por member_id — evita O(members × attendances)
    // em cada cálculo (com 50 atletas e 20 treinos = 1000 rows, a diferença
    // entre map lookup e scan linear é pequena, mas o hábito é correto).
    const attByMember = new Map<string, Map<string, Attendance>>()
    for (const a of attendances) {
      let bucket = attByMember.get(a.member_id)
      if (!bucket) {
        bucket = new Map()
        attByMember.set(a.member_id, bucket)
      }
      bucket.set(a.training_id, a)
    }
    const paymentsByMember = new Map<string, Payment[]>()
    for (const p of payments) {
      const bucket = paymentsByMember.get(p.member_id) ?? []
      bucket.push(p)
      paymentsByMember.set(p.member_id, bucket)
    }

    return members.map<Row>((m) => {
      const attMap = attByMember.get(m.id) ?? new Map<string, Attendance>()

      let present = 0
      let pendingPerTraining = 0
      for (const t of nonCancelled) {
        const a = attMap.get(t.id)
        if (a?.status === 'present') present++
        // Conta só pagamentos por-treino NÃO-mensais. Pagamentos com
        // payment_type='monthly' já estão em monthly_payments — contá-los
        // aqui também seria double-counting.
        if (a?.payment_status === 'pending' && a.payment_type !== 'monthly') {
          pendingPerTraining++
        }
      }

      const memberPayments = paymentsByMember.get(m.id) ?? []
      const pendingMonthly = memberPayments.filter(
        (p) => p.is_monthly_payer && p.payment_status === 'pending',
      ).length

      const totalScheduled = nonCancelled.length
      const attendancePct = totalScheduled > 0 ? (present / totalScheduled) * 100 : null

      const positionsLabel = m.member_category_positions
        .filter((row) => row.category_id === category.id)
        .map((row) => positions.find((p) => p.id === row.position_id)?.name)
        .filter(Boolean)
        .join(', ') || '—'

      return {
        member: m,
        positionsLabel,
        pendingCount: pendingPerTraining + pendingMonthly,
        totalScheduled,
        presentCount: present,
        attendancePct,
      }
    })
  }, [members, trainings, attendances, payments, positions, category.id])

  // ── Filtro ───────────────────────────────────────────────────────────
  // `attThreshold` só é número quando o usuário digitou algo válido em [0, 100].
  // Se o modo é gte/lte mas o input está vazio/inválido, ignoramos o filtro
  // (não "quebra" a lista — o user vê tudo até digitar um valor).
  const attThreshold = useMemo(() => {
    if (attendanceMode === 'all' || attendanceValue === '') return null
    const n = Number(attendanceValue)
    if (Number.isNaN(n) || n < 0 || n > 100) return null
    return n
  }, [attendanceMode, attendanceValue])

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      // Pendências
      if (pendingFilter === 'pending' && r.pendingCount <= 0) return false
      if (pendingFilter === 'ok' && r.pendingCount > 0) return false

      // Assiduidade — só aplica se temos um threshold válido.
      if (attThreshold !== null) {
        // Sem dados (sem treinos no período) → esconde quando filtro ativo.
        if (r.attendancePct === null) return false
        if (attendanceMode === 'gte' && r.attendancePct < attThreshold) return false
        if (attendanceMode === 'lte' && r.attendancePct > attThreshold) return false
      }
      return true
    })
  }, [rows, pendingFilter, attendanceMode, attThreshold])

  // Contador de filtros ativos — usado pro badge do FAB. "Ativo" significa
  // diferente do default (`all` / `all` + value vazio).
  const activeFilterCount =
    (pendingFilter !== 'all' ? 1 : 0) +
    (attendanceMode !== 'all' && attThreshold !== null ? 1 : 0)

  function clearFilters() {
    setPendingFilter('all')
    setAttendanceMode('all')
    setAttendanceValue('')
  }

  // ── Sort ─────────────────────────────────────────────────────────────
  const sorted = useMemo(() => {
    if (!sortBy) return filtered
    const { col, dir } = sortBy
    const mult = dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (col === 'name') {
        return a.member.name.localeCompare(b.member.name, 'pt-BR') * mult
      }
      if (col === 'pending') {
        return (a.pendingCount - b.pendingCount) * mult
      }
      if (col === 'trainings') {
        return (a.presentCount - b.presentCount) * mult
      }
      // attendance — null sempre no fim (independente da direção)
      const va = a.attendancePct
      const vb = b.attendancePct
      if (va === null && vb === null) return 0
      if (va === null) return 1
      if (vb === null) return -1
      return (va - vb) * mult
    })
  }, [filtered, sortBy])

  function handleSort(col: SortCol) {
    setSortBy((prev) => {
      if (!prev || prev.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return null
    })
  }

  function renderSortIcon(col: SortCol) {
    const active = sortBy?.col === col
    if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-40" />
    return sortBy!.dir === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />
  }

  // ── Navegação por período (atualiza URL) ─────────────────────────────
  function applyRange(f: string, t: string) {
    if (!f || !t) return
    const q = new URLSearchParams()
    q.set('from', f)
    q.set('to', t)
    router.push(`/categories/${category.id}?${q.toString()}`)
  }

  function applyPreset(preset: PresetId) {
    const { from: f, to: t } = computePreset(preset)
    applyRange(f, t)
  }

  // ── Resumo (contadores pro header) ───────────────────────────────────
  const summary = useMemo(() => {
    const withPending = filtered.filter((r) => r.pendingCount > 0).length
    const totalPending = filtered.reduce((acc, r) => acc + r.pendingCount, 0)
    const withData = filtered.filter((r) => r.attendancePct !== null)
    const avgAttendance = withData.length > 0
      ? withData.reduce((acc, r) => acc + r.attendancePct!, 0) / withData.length
      : null
    return {
      athleteCount: filtered.length,
      withPending,
      totalPending,
      avgAttendance,
    }
  }, [filtered])

  return (
    <div className="space-y-5 fade-in">
      {/* ── Hero: card da categoria ───────────────────────────────────────
         Redesign v2: fundo `cream-raised` (não-branco) com sombra quente,
         blob gradient decorativo atrás do avatar dando profundidade. O
         avatar agora carrega o `category.logo_url` quando existe — fallback
         pra inicial estilizada mantém a tela sempre com "algo visual" no
         topo, mesmo pra categorias antigas sem upload. */}
      <section
        className="relative overflow-hidden rounded-2xl bg-cream-raised ring-1 ring-cream-border shadow-[0_4px_24px_-8px_rgb(180_140_90/0.12)] p-5 md:p-6 slide-up"
        style={{ animationDelay: '0ms' }}
      >
        {/* Blob decorativo de fundo — gradient radial sutil da cor primary
            que dá profundidade sem competir com o conteúdo. Posicionado
            atrás do avatar. Em dark mode, a opacity reduz automaticamente
            via `dark:opacity-40` (o blend fica saturado demais senão). */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -left-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl dark:opacity-40"
        />

        <div className="relative flex items-center gap-3 md:gap-4">
          {/* Logo da categoria ou fallback. Img tag pura (não usa next/image)
              porque os logos vêm do Supabase Storage como URLs arbitrárias
              e o projeto já usa esse padrão em settings/categories-section.tsx. */}
          {category.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={category.logo_url}
              alt={`Logo ${category.name}`}
              className="h-12 w-12 md:h-14 md:w-14 shrink-0 rounded-2xl object-cover ring-1 ring-cream-border shadow-sm bg-cream-sunken"
            />
          ) : (
            <div
              aria-hidden
              className="h-12 w-12 md:h-14 md:w-14 shrink-0 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center text-primary text-xl md:text-2xl font-bold font-heading shadow-sm"
            >
              {category.name.charAt(0).toUpperCase() || '?'}
            </div>
          )}
          <h1 className="font-heading text-xl md:text-3xl font-semibold tracking-tight truncate">
            {category.name}
          </h1>
        </div>

        {/* Metachips: cada pedaço vira uma pill legível, em vez de texto corrido.
            Bg `cream-sunken` pra contrastar suavemente com o cream-raised do card. */}
        <div className="relative flex flex-wrap gap-2 mt-4">
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-cream-sunken ring-1 ring-cream-border text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground/80">{category.days_of_week.join(', ')}</span>
            <span className="text-muted-foreground/60">·</span>
            {category.start_time}–{category.end_time}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-cream-sunken ring-1 ring-cream-border text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground/80">{category.location}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-cream-sunken ring-1 ring-cream-border text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground/80">{members.length}</span>
            {members.length === 1 ? 'membro' : 'membros'}
          </span>
        </div>

        {category.observations && (
          <p className="relative mt-4 pt-4 border-t border-cream-border text-sm text-muted-foreground leading-relaxed">
            {category.observations}
          </p>
        )}
      </section>

      {/* ── Banner "isto é um relatório" ──────────────────────────────────
         Callout sutil com accent esquerdo indigo (primary/50) + ícone em
         box colorido — marca ritmo visual sem poluir. O link pra /trainings
         vira um call-to-action compacto com seta → em vez de underline. */}
      <div
        className="flex items-center gap-3 text-xs md:text-sm text-muted-foreground bg-cream-sunken border border-cream-border border-l-2 border-l-primary/60 rounded-lg px-3 py-2.5 slide-up"
        style={{ animationDelay: '40ms' }}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <ExternalLink className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          Este é um <strong className="font-semibold text-foreground/80">relatório</strong>. Para marcar presenças e pagamentos, abra o módulo de treinos.
        </div>
        <button
          type="button"
          onClick={() => router.push('/trainings')}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
        >
          Treinos
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Card de Período ─────────────────────────────────────────────
         Reestruturado: presets em pill-buttons acima (prioridade visual),
         inputs abaixo num grid que vira flex no desktop. O preset ativo
         (se o range atual bate com o preset) destaca em primary. */}
      <Card
        data-size="sm"
        className="slide-up !bg-cream-raised ring-cream-border shadow-[0_2px_12px_-4px_rgb(180_140_90/0.10)]"
        style={{ animationDelay: '80ms' }}
      >
        <CardHeader>
          <CardTitle>Período</CardTitle>
          <CardDescription>{rangeLabel(from, to)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Presets — pills. O ativo compara os valores persistidos (from/to),
              não o local (que pode estar sendo digitado). */}
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => {
              const target = computePreset(p.id)
              const active = target.from === from && target.to === to
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id)}
                  className={`text-xs font-medium px-3 py-1 rounded-full ring-1 transition ${
                    active
                      ? 'bg-primary text-primary-foreground ring-primary shadow-[0_1px_3px_0_rgb(79_70_229/0.15)]'
                      : 'bg-cream-sunken ring-cream-border text-muted-foreground hover:bg-primary/10 hover:ring-primary/25 hover:text-primary'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* Inputs + Aplicar. Mobile: grid 2 colunas com Aplicar full-width
              abaixo. Desktop: flex inline. */}
          <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">De</label>
              <Input
                type="date"
                value={localFrom}
                max={localTo}
                onChange={(e) => setLocalFrom(e.target.value)}
                className="h-9 md:w-[160px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Até</label>
              <Input
                type="date"
                value={localTo}
                min={localFrom}
                onChange={(e) => setLocalTo(e.target.value)}
                className="h-9 md:w-[160px]"
              />
            </div>
            <Button
              size="sm"
              onClick={() => applyRange(localFrom, localTo)}
              disabled={localFrom === from && localTo === to}
              className="h-9 col-span-2 md:col-span-1 md:self-end"
            >
              Aplicar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Stats (4 cards) ─────────────────────────────────────────────
         Cada card tem seu accent colorido (indigo/amber/rose/emerald) via
         border-left + caixinha do ícone. Grid 2 cols mobile, 4 cols desktop.
         Hover com lift sutil + shadow cresce — padrão do dashboard. */}
      {filtered.length > 0 && (
        <div
          className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 slide-up"
          style={{ animationDelay: '120ms' }}
        >
          <SummaryCard
            label="Atletas"
            value={String(summary.athleteCount)}
            hint={members.length === summary.athleteCount ? 'Total da categoria' : `de ${members.length}`}
            icon={Users}
            accent="indigo"
          />
          {/* Stats de pagamento só pra quem tem perfil gerencial. O atleta
              não deve ver status financeiro agregado dos colegas — é
              informação privada. O card de Assiduidade (comportamento de
              treino) fica no lugar pra preencher o grid. */}
          {!hidePaymentsOfOthers && (
            <>
              <SummaryCard
                label="Com pendência"
                value={String(summary.withPending)}
                hint={summary.withPending === 0 ? 'Tudo em dia' : 'Atletas em atraso'}
                icon={AlertCircle}
                accent="amber"
              />
              <SummaryCard
                label="Pagamentos pendentes"
                value={String(summary.totalPending)}
                hint="Total no período"
                icon={CircleDollarSign}
                accent="rose"
              />
            </>
          )}
          <SummaryCard
            label="Assiduidade média"
            value={
              summary.avgAttendance !== null
                ? `${Math.round(summary.avgAttendance)}%`
                : '—'
            }
            hint="Dos atletas filtrados"
            icon={TrendingUp}
            accent="emerald"
          />
        </div>
      )}

      {/* Tabela de relatório */}
      {/* ── Tabela de atletas ───────────────────────────────────────────
         Container com ring (em vez de border simples) e `rounded-2xl` —
         mais moderno, consistente com o hero. Header sticky permite ler
         títulos ao scrollar em listas grandes. Avatar de inicial, zebra
         suave `odd:bg-muted/10` e hover em `primary/5`. Em mobile, as
         colunas `Posição` e `Treinos` somem via `hidden md:table-cell` —
         cabe `Atleta + Pendências + Assiduidade` sem scroll lateral. */}
      <div
        className="bg-cream-raised rounded-2xl ring-1 ring-cream-border shadow-[0_4px_24px_-8px_rgb(180_140_90/0.12)] overflow-hidden slide-up"
        style={{ animationDelay: '160ms' }}
      >
        {members.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cream-sunken ring-1 ring-cream-border mb-3">
              <Users className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              Nenhum atleta vinculado a esta categoria.
            </p>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center px-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cream-sunken ring-1 ring-cream-border mb-3">
              <AlertCircle className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <p className="text-sm text-muted-foreground">
              Nenhum atleta atende aos filtros atuais.
            </p>
            <button
              onClick={clearFilters}
              className="text-xs text-primary underline underline-offset-2 hover:no-underline mt-2"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-cream-sunken/80 backdrop-blur-sm border-b border-cream-border">
                  <th className="text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide py-2.5 px-4 min-w-[180px]">
                    <button
                      type="button"
                      onClick={() => handleSort('name')}
                      className="inline-flex items-center gap-1 uppercase tracking-wide font-medium hover:text-foreground transition-colors"
                    >
                      Atleta
                      {renderSortIcon('name')}
                    </button>
                  </th>
                  <th className="hidden md:table-cell text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wide py-2.5 px-3 min-w-[140px]">
                    Posição
                  </th>
                  {!hidePaymentsOfOthers && (
                    <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide py-2.5 px-3 min-w-[110px]">
                      <button
                        type="button"
                        onClick={() => handleSort('pending')}
                        className="inline-flex items-center gap-1 uppercase tracking-wide font-medium hover:text-foreground transition-colors mx-auto"
                      >
                        Pendências
                        {renderSortIcon('pending')}
                      </button>
                    </th>
                  )}
                  <th className="text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide py-2.5 px-3 min-w-[150px]">
                    <button
                      type="button"
                      onClick={() => handleSort('attendance')}
                      className="inline-flex items-center gap-1 uppercase tracking-wide font-medium hover:text-foreground transition-colors mx-auto"
                    >
                      Assiduidade
                      {renderSortIcon('attendance')}
                    </button>
                  </th>
                  <th className="hidden md:table-cell text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wide py-2.5 px-3 min-w-[100px]">
                    <button
                      type="button"
                      onClick={() => handleSort('trainings')}
                      className="inline-flex items-center gap-1 uppercase tracking-wide font-medium hover:text-foreground transition-colors mx-auto"
                    >
                      Treinos
                      {renderSortIcon('trainings')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.member.id}
                    className="border-b border-cream-border/60 last:border-0 odd:bg-cream-sunken/40 hover:bg-primary/8 transition-colors duration-150 cursor-default"
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          aria-hidden
                          className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-primary/15 via-primary/8 to-primary/5 ring-1 ring-primary/15 flex items-center justify-center text-xs font-semibold text-primary"
                        >
                          {r.member.name.charAt(0).toUpperCase() || '?'}
                        </div>
                        <span className="font-medium text-sm truncate">{r.member.name}</span>
                      </div>
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-3 text-xs text-muted-foreground">
                      {r.positionsLabel}
                    </td>
                    {!hidePaymentsOfOthers && (
                      <td className="py-2.5 px-3 text-center">
                        <PendingBadge count={r.pendingCount} />
                      </td>
                    )}
                    <td className="py-2.5 px-3">
                      <AttendanceCell pct={r.attendancePct} />
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-3 text-center text-xs text-muted-foreground font-mono">
                      {r.totalScheduled > 0
                        ? `${r.presentCount}/${r.totalScheduled}`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── FAB de filtros (canto inferior direito) ─────────────────────
         Tamanho responsivo: menor no mobile pra o polegar alcançar. Glow
         indigo via `color-mix` — mais "brand" que shadow genérica preta.
         Badge em `destructive` (semântica de atenção) em vez de `amber-500`
         arbitrário. `.slide-in-right` na montagem = aparece deslizando. */}
      <button
        type="button"
        onClick={() => setFiltersOpen(true)}
        aria-label="Abrir filtros"
        title="Filtros"
        className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 h-12 w-12 md:h-14 md:w-14 rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_-4px_color-mix(in_oklch,var(--primary)_45%,transparent)] hover:shadow-[0_12px_32px_-4px_color-mix(in_oklch,var(--primary)_60%,transparent)] hover:scale-105 active:scale-90 transition-all duration-200 flex items-center justify-center slide-in-right"
      >
        <Funnel className="h-5 w-5" />
        {activeFilterCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow-md ring-2 ring-background"
          >
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* ── Drawer de filtros (slide-in da direita) ─────────────────────── */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side="right"
          className="w-[92vw] sm:w-[380px] sm:max-w-[380px] !bg-cream-raised border-l-cream-border"
        >
          <SheetHeader className="pb-4 border-b border-border/40">
            <SheetTitle className="flex items-center gap-2">
              <Funnel className="h-4 w-4 text-primary" />
              Filtros
            </SheetTitle>
            <SheetDescription>
              Refine o relatório desta categoria por pendências e assiduidade.
            </SheetDescription>
          </SheetHeader>

          {/* Mini-cards: cada filtro num bloco distinto com bg leve + ring.
              Ajuda a segmentar visualmente — o olho identifica "pendências"
              e "assiduidade" como grupos, não como itens numa lista crua. */}
          <div className="flex flex-col gap-4 px-4 pb-4 pt-1">
            {/* Pendências */}
            <div className="rounded-xl ring-1 ring-cream-border bg-cream-sunken p-3 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                Pendências
              </label>
              <Select
                value={pendingFilter}
                onValueChange={(val) => {
                  if (val !== null) setPendingFilter(val as PendingFilter)
                }}
                items={PENDING_FILTER_LABELS}
              >
                <SelectTrigger className="w-full h-9 !bg-cream-raised ring-cream-border">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pending">Somente pendentes</SelectItem>
                  <SelectItem value="ok">Somente em dia</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Assiduidade */}
            <div className="rounded-xl ring-1 ring-cream-border bg-cream-sunken p-3 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                Assiduidade
              </label>
              <Select
                value={attendanceMode}
                onValueChange={(val) => {
                  if (val === null) return
                  const mode = val as AttendanceMode
                  setAttendanceMode(mode)
                  // Ao voltar pra "Todos", zera o valor — evita filtro fantasma
                  // que voltaria ao trocar o modo depois.
                  if (mode === 'all') setAttendanceValue('')
                }}
                items={ATTENDANCE_MODE_LABELS}
              >
                <SelectTrigger className="w-full h-9 !bg-cream-raised ring-cream-border">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="gte">Igual ou maior que</SelectItem>
                  <SelectItem value="lte">Igual ou menor que</SelectItem>
                </SelectContent>
              </Select>

              {/* Input de % aparece só nos modos gte/lte. Teclado numérico no
                  mobile via `inputMode="numeric"`; aceita 0–100 inteiros. */}
              {attendanceMode !== 'all' && (
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    placeholder="Ex: 80"
                    value={attendanceValue}
                    onChange={(e) => setAttendanceValue(e.target.value)}
                    className="h-9 pr-8 !bg-cream-raised"
                    autoFocus
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground select-none pointer-events-none">
                    %
                  </span>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground/70 leading-snug">
                Atletas sem treinos no período ficam ocultos quando há um valor
                de assiduidade aplicado.
              </p>
            </div>
          </div>

          {/* Footer dock: `mt-auto` empurra pro fim do Sheet (flex column).
              `backdrop-blur-sm` dá leve efeito "glass" que distingue o
              footer do conteúdo sem precisar de sombra pesada. */}
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-cream-border bg-cream-sunken/80 backdrop-blur-sm px-4 py-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              disabled={activeFilterCount === 0}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Limpar
            </Button>
            <Button size="sm" onClick={() => setFiltersOpen(false)}>
              Aplicar
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

// Paleta dos stats — cada accent agrupa border-l + caixinha do ícone
// (claro no light mode, saturado com alpha no dark). Mantidos hardcoded
// aqui (em vez de tokens) porque são acentos semânticos de UI, não de
// marca — indigo, amber, rose, emerald são universais pra "total, atenção,
// erro, sucesso" e já são a linguagem usada no dashboard.
const ACCENT_STYLES = {
  indigo:  { border: 'border-l-indigo-500',  icon: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-500/15 dark:text-indigo-300' },
  amber:   { border: 'border-l-amber-500',   icon: 'text-amber-600 bg-amber-50 dark:bg-amber-500/15 dark:text-amber-300' },
  rose:    { border: 'border-l-rose-500',    icon: 'text-rose-600 bg-rose-50 dark:bg-rose-500/15 dark:text-rose-300' },
  emerald: { border: 'border-l-emerald-500', icon: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300' },
} as const
type AccentKey = keyof typeof ACCENT_STYLES

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string
  value: string
  hint?: string
  icon: React.ComponentType<{ className?: string }>
  accent: AccentKey
}) {
  const styles = ACCENT_STYLES[accent]
  return (
    <div
      className={`bg-gradient-to-br from-cream-raised to-cream-raised/70 rounded-xl ring-1 ring-cream-border border-l-[3px] ${styles.border} p-4 shadow-[0_2px_12px_-4px_rgb(180_140_90/0.12)] hover:shadow-[0_8px_24px_-6px_rgb(180_140_90/0.22)] hover:-translate-y-0.5 transition-all duration-200`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] md:text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 leading-tight">
          {label}
        </span>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="text-xl md:text-2xl font-bold tracking-tight mt-2">{value}</div>
      {hint && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
    </div>
  )
}

function PendingBadge({ count }: { count: number }) {
  if (count === 0) {
    return (
      <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
        Em dia
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-md border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30">
      {count}
    </span>
  )
}

/**
 * Badge colorida por faixa — verde ≥80, âmbar 50–79, vermelho <50.
 * `null` = sem treinos no período (sem base pra calcular).
 * Dark-mode-aware: alpha + lighter text em tema escuro.
 */
function AttendanceBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-muted-foreground/60">—</span>
  }
  const rounded = Math.round(pct)
  const cls =
    pct >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30' :
    pct >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30' :
                'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30'
  return (
    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-md border ${cls}`}>
      {rounded}%
    </span>
  )
}

/**
 * Célula de Assiduidade: badge com `%` + mini barra de progresso sutil.
 * A barra usa a mesma faixa de cor do badge (emerald/amber/rose-500),
 * dando leitura periférica ("quem está baixo fica instantâneo"). Em
 * `null` (sem treinos no período), só renderiza um traço "—" central.
 */
function AttendanceCell({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-xs text-muted-foreground/60">—</span>
      </div>
    )
  }
  const rounded = Math.round(pct)
  const fillCls =
    pct >= 80 ? 'bg-emerald-500' :
    pct >= 50 ? 'bg-amber-500'   :
                'bg-rose-500'
  return (
    <div className="flex items-center gap-2 justify-center">
      <AttendanceBadge pct={pct} />
      <div
        className="h-1.5 w-12 md:w-14 rounded-full bg-cream-sunken ring-1 ring-cream-border overflow-hidden"
        aria-hidden
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${fillCls}`}
          style={{ width: `${Math.min(100, Math.max(0, rounded))}%` }}
        />
      </div>
    </div>
  )
}
