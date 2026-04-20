'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar, CalendarOff, Check, X, MapPin, Clock, Users,
  Crown, Wallet, Plus, Trash2, Loader2, UserCheck, UserX,
  Wand2, CheckSquare, Square,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  setAttendance,
  setTrainingStatus,
  setMonthlyPayer,
  setPaymentStatus,
  setBulkPaymentStatus,
  setTrainingPayment,
} from '@/app/actions/trainings'
import type { TargetOrgOpts } from '@/lib/auth/resolve-org'

// ── Tipos ──────────────────────────────────────────────────────────────

interface Category {
  id: string
  name: string
  logo_url?: string | null
  location?: string | null
  start_time?: string | null
  end_time?: string | null
  has_drop_in: boolean
  has_monthly: boolean
  /** Campos legados do schema — UI atual só usa drop_in e monthly. */
  has_weekly: boolean
  has_semiannual: boolean
  has_annual: boolean
}

interface Training {
  id: string
  category_id: string
  date: string
  status: string
  cancellation_reason?: string | null
}

interface MemberCategory {
  member_id: string
  category_id: string
  /**
   * PostgREST retorna a relação embed (`members(...)`) como array mesmo
   * quando é 1:1. Aceita ambos os shapes pra ficar compatível com qualquer
   * forma que o caller montou a query.
   */
  members: { id: string; name: string } | { id: string; name: string }[] | null
}

interface Attendance {
  training_id: string
  member_id: string
  status: string
  payment_type: string | null
  payment_status: string | null
}

interface MonthlyPayment {
  id: string
  member_id: string
  category_id: string
  month: number
  year: number
  is_monthly_payer: boolean
  payment_status: string | null
  payment_note: string | null
}

// ── Constantes ─────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// Nomes completos em pt-BR pra o header do card de treino.
// Ex: "Segunda-feira · 13/04/2026".
const WEEKDAY_FULL = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
]

/**
 * Status possíveis do pagamento de um treino avulso, na UI:
 *   • `pending`    — cobrar, ainda não pagou
 *   • `paid`       — pagou
 *   • `exempt`     — isento (cortesia, convidado, dispensa)
 *   • `refunded`   — estornado: coord já devolveu (ou vai devolver) o valor
 *                    pro atleta. No /financials do atleta aparece como
 *                    "a receber" (clube deve pra ele).
 *   • `no_payment` — "sem pagamento": esse treino não gera cobrança
 *                    (meses futuros caem aqui por default)
 */
type DropInStatus = 'pending' | 'paid' | 'exempt' | 'refunded' | 'no_payment'
type MonthlyStatus = 'pending' | 'paid'

/**
 * Hoje em YYYY-MM-DD (timezone local). Usado pra decidir defaults de
 * atletas sem attendance em treinos FUTUROS vs passados.
 */
function todayIsoLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Defaults exibidos quando um atleta ainda não tem `member_attendance` num
 * treino. Diferencia passado/atual vs futuro — a regra do owner é:
 *   • Treinos futuros: presença "faltou", tipo e status = "sem pagamento"
 *     (o treino ainda não aconteceu, não faz sentido cobrar).
 *   • Treinos do passado/hoje: presença "faltou", tipo = avulso, status = pendente
 *     (comportamento legado — algo que precisa ser cobrado até que o coord
 *     resolva manualmente).
 */
function getDefaultsForDate(trainingDate: string) {
  const isFuture = trainingDate > todayIsoLocal()
  return {
    type: isFuture ? (null as string | null) : 'drop_in',
    status: isFuture ? ('no_payment' as const) : ('pending' as const),
  }
}

// ── Root ──────────────────────────────────────────────────────────────

export function TrainingsClient({
  categories,
  trainings,
  memberCategories,
  attendances,
  monthlyPayments,
  month,
  year,
  selectedCategoryId,
}: {
  categories: Category[]
  trainings: Training[]
  memberCategories: MemberCategory[]
  attendances: Attendance[]
  monthlyPayments: MonthlyPayment[]
  month: number
  year: number
  /**
   * Categoria selecionada via querystring `?cat=X`. Vem do sidebar —
   * quando atleta/coord clica numa categoria no submenu "Gerenciador
   * de Treinos". `null` = nenhuma especificada (mostra a primeira da org).
   */
  selectedCategoryId: string | null
}) {
  // Resolve categoria ativa:
  //   1. Se tem `?cat=X`: usa essa (se existir na lista)
  //   2. Senão: primeira categoria da org (mantém comportamento antigo)
  const activeCategory = (selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId)
    : null)
    ?? categories[0]
    ?? null

  // Hooks SEMPRE executam (mesmo sem categoria). Quando `activeCategory` é
  // null, retornam arrays vazios — cheap. Isso respeita rules-of-hooks sem
  // exigir early return antes dos hooks.
  const categoryTrainings = useMemo(
    () => activeCategory ? trainings.filter((t) => t.category_id === activeCategory.id) : [],
    [trainings, activeCategory],
  )
  const categoryAttendances = useMemo(
    () => {
      if (!activeCategory) return []
      return attendances.filter((a) => {
        const t = trainings.find((x) => x.id === a.training_id)
        return t?.category_id === activeCategory.id
      })
    },
    [attendances, trainings, activeCategory],
  )
  const categoryMonthlyPayments = useMemo(
    () => activeCategory ? monthlyPayments.filter((mp) => mp.category_id === activeCategory.id) : [],
    [monthlyPayments, activeCategory],
  )
  const categoryMembers = useMemo(
    () => {
      if (!activeCategory) return []
      const result: { id: string; name: string }[] = []
      for (const mc of memberCategories) {
        if (mc.category_id !== activeCategory.id) continue
        if (!mc.members) continue
        // Normaliza: PostgREST às vezes retorna embed como array, às vezes
        // como objeto. Achata pra sempre tratar como lista.
        const members = Array.isArray(mc.members) ? mc.members : [mc.members]
        for (const m of members) if (m) result.push(m)
      }
      return result.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    },
    [memberCategories, activeCategory],
  )

  if (categories.length === 0 || !activeCategory) return null

  // Se não temos categoria ativa (org sem categorias cadastradas):
  // nada a mostrar — o layout do page.tsx cuida do empty state global.
  if (!activeCategory) {
    return null
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb/header da categoria selecionada. Substitui as abas
          antigas — a troca de categoria agora acontece pelo sidebar via
          `?cat=ID`. Mostra logo + nome da categoria ativa pra deixar
          claro onde o coord está operando. */}
      <div className="flex items-center gap-3 pb-3 border-b border-border/40">
        {activeCategory.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeCategory.logo_url}
            alt=""
            className="h-10 w-10 rounded-lg object-cover ring-1 ring-border/40"
          />
        ) : (
          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center">
            {activeCategory.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold font-heading truncate">
            {activeCategory.name}
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Selecione outra categoria no menu lateral
          </p>
        </div>
      </div>

      <CategoryView
        key={activeCategory.id}
        category={activeCategory}
        members={categoryMembers}
        trainings={categoryTrainings}
        attendances={categoryAttendances}
        monthlyPayments={categoryMonthlyPayments}
        month={month}
        year={year}
      />
    </div>
  )
}

// ── View por categoria ────────────────────────────────────────────────

function CategoryView({
  category, members, trainings, attendances, monthlyPayments, month, year,
}: {
  category: Category
  members: { id: string; name: string }[]
  trainings: Training[]
  attendances: Attendance[]
  monthlyPayments: MonthlyPayment[]
  month: number
  year: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { confirm } = useConfirm()

  // Mapa rápido member_id → monthly_payment pra decidir se é mensalista.
  // Derivado direto das props — sem state local. Após cada ação chamamos
  // `router.refresh()` pra o servidor reenviar dados novos. Trade-off:
  // ~200ms de delay visual, mas zero complicação de sync.
  const monthlyByMember = useMemo(() => {
    const m = new Map<string, MonthlyPayment>()
    for (const mp of monthlyPayments) m.set(mp.member_id, mp)
    return m
  }, [monthlyPayments])

  // Lista agregada de confirmações pendentes (attendances com
  // payment_status='awaiting_confirmation'). Aparece em banner no topo
  // pro coord enxergar tudo o que a Natália (e cia) sinalizaram, sem
  // precisar procurar treino por treino. Se 0, banner não renderiza.
  const awaitingList = useMemo(() => {
    const memberNameById = new Map(members.map((m) => [m.id, m.name]))
    const trainingById = new Map(trainings.map((t) => [t.id, t]))
    type Row = {
      trainingId: string
      memberId: string
      memberName: string
      trainingDate: string
      paymentType: string | null
    }
    const rows: Row[] = []
    for (const a of attendances) {
      if (a.payment_status !== 'awaiting_confirmation') continue
      const t = trainingById.get(a.training_id)
      if (!t) continue
      const name = memberNameById.get(a.member_id)
      if (!name) continue
      rows.push({
        trainingId: a.training_id,
        memberId: a.member_id,
        memberName: name,
        trainingDate: t.date,
        paymentType: a.payment_type,
      })
    }
    // Mais recente primeiro
    rows.sort((a, b) => b.trainingDate.localeCompare(a.trainingDate))
    return rows
  }, [attendances, trainings, members])

  const orgOpts = useMemo<TargetOrgOpts | undefined>(() => undefined, [])

  // ── Handlers ────────────────────────────────────────────────────────

  function handleAttendance(trainingId: string, memberId: string, status: 'present' | 'absent') {
    startTransition(async () => {
      try {
        await setAttendance(trainingId, memberId, status, orgOpts)
        router.refresh()
      } catch (err) {
        console.error('[handleAttendance]', err)
      }
    })
  }

  function handleToggleMonthlyPayer(memberId: string, makeItMonthly: boolean) {
    startTransition(async () => {
      try {
        await setMonthlyPayer(memberId, category.id, month, year, makeItMonthly, orgOpts)
        router.refresh()
      } catch (err) {
        console.error('[handleToggleMonthlyPayer]', err)
      }
    })
  }

  function handleMonthlyStatus(memberId: string, status: MonthlyStatus) {
    startTransition(async () => {
      try {
        // 1) Atualiza o row em monthly_payments (status do mês)
        await setPaymentStatus(memberId, category.id, month, year, status, orgOpts)
        // 2) Propaga pros attendances do mês via setBulkPaymentStatus (a
        //    action calcula o range do mês inteiro). Usa o primeiro treino
        //    não-cancelado como âncora.
        const anchor = trainings.find((t) => t.status !== 'cancelled')
        if (anchor) {
          await setBulkPaymentStatus(
            memberId, category.id, anchor.id, anchor.date,
            'monthly', status, orgOpts,
          )
        }
        router.refresh()
      } catch (err) {
        console.error('[handleMonthlyStatus]', err)
      }
    })
  }

  // Dialog de justificativa de isento — quando coord escolhe "Isento" no
  // select, abre esse dialog pra coletar o motivo (opcional). Se cancelar,
  // a mudança de status não acontece.
  const [exemptState, setExemptState] = useState<{
    trainingId: string
    memberId: string
    trainingDate: string
  } | null>(null)
  const [exemptReason, setExemptReason] = useState('')

  function handleDropInStatus(
    trainingId: string, memberId: string, trainingDate: string, status: DropInStatus,
  ) {
    // "Isento" abre o dialog pra coletar justificativa ANTES de aplicar.
    if (status === 'exempt') {
      setExemptReason('')
      setExemptState({ trainingId, memberId, trainingDate })
      return
    }

    startTransition(async () => {
      try {
        if (status === 'no_payment' || status === 'refunded') {
          // Status excepcionais → single-training via setBulkPaymentStatus
          // (cobre casos isolados, não propaga pro mês todo). "refunded"
          // aparece no /financials do atleta como "a receber" (dinheiro
          // que o clube deve devolver pra ele).
          await setBulkPaymentStatus(
            memberId, category.id, trainingId, trainingDate,
            'drop_in', status, orgOpts,
          )
        } else {
          await setTrainingPayment(trainingId, memberId, 'drop_in', status, orgOpts)
        }
        router.refresh()
      } catch (err) {
        console.error('[handleDropInStatus]', err)
      }
    })
  }

  function handleSubmitExempt() {
    if (!exemptState) return
    const { trainingId, memberId, trainingDate } = exemptState
    const note = exemptReason.trim() || null
    setExemptState(null)
    setExemptReason('')
    startTransition(async () => {
      try {
        await setBulkPaymentStatus(
          memberId, category.id, trainingId, trainingDate,
          'drop_in', 'exempt', orgOpts, note,
        )
        router.refresh()
      } catch (err) {
        console.error('[handleSubmitExempt]', err)
      }
    })
  }

  /**
   * Seta tipo de pagamento avulso direto (sem mexer no status). Usado
   * pelo select de TIPO quando o coord muda pra "Avulso" ou "Sem pagamento"
   * sem querer alterar o status atual. Mensalistas são tratados via
   * `handleToggleMonthlyPayer`.
   */
  function handleSetPaymentType(
    trainingId: string, memberId: string, newType: 'drop_in' | null, currentStatus: string,
  ) {
    startTransition(async () => {
      try {
        // Se muda pra "sem pagamento" (newType=null), força status='no_payment'
        // junto — a regra do owner é que tipo+status sem pagamento andam juntos.
        const targetStatus = newType === null ? 'no_payment' : currentStatus
        await setTrainingPayment(
          trainingId, memberId, newType,
          targetStatus as 'pending' | 'paid' | 'no_payment' | 'refunded' | 'exempt',
          orgOpts,
        )
        router.refresh()
      } catch (err) {
        console.error('[handleSetPaymentType]', err)
      }
    })
  }

  /**
   * Handler de presença com confirmação contextual quando o coord marca
   * "faltou" em um treino atual/passado: pergunta se deseja resetar o
   * pagamento daquele treino pra "Sem pagamento" (tipo + status).
   *
   * Regras:
   *   • Treino futuro: presença direto sem perguntar (faz menos sentido).
   *   • Atleta mensalista (ou com payment_type='monthly' no attendance):
   *     presença direto sem perguntar. Mensalista paga mesmo ausente —
   *     não faz sentido zerar o pagamento individual nem sugerir trocar
   *     pra avulso/sem-pagamento no treino específico.
   *   • Status já é 'no_payment': não precisa perguntar (é o estado alvo).
   *   • Caso padrão: mostra confirm oferecendo a mudança.
   */
  async function handleAttendanceWithPrompt(
    trainingId: string, memberId: string, status: 'present' | 'absent',
    trainingDate: string, currentPaymentStatus: string | null, isMonthly: boolean,
    currentType: string | null,
  ) {
    // Sempre atualiza presença primeiro
    handleAttendance(trainingId, memberId, status)

    // Condições pra NÃO perguntar
    if (status !== 'absent') return
    // Double-gate contra mensalista: `isMonthly` do monthly_payments OU
    // payment_type='monthly' no attendance atual. Protege casos de
    // inconsistência transitória entre as duas fontes.
    if (isMonthly || currentType === 'monthly') return
    if (trainingDate > todayIsoLocal()) return
    if (currentPaymentStatus === 'no_payment') return

    const shouldReset = await confirm({
      title: 'Marcar pagamento como "Sem pagamento"?',
      description: 'Como o atleta faltou, você quer registrar que esse treino não gera cobrança? Isso zera o tipo e a situação de pagamento desse treino.',
      confirmLabel: 'Sim, sem pagamento',
      cancelLabel: 'Não, manter',
    })
    if (!shouldReset) return

    startTransition(async () => {
      try {
        await setBulkPaymentStatus(
          memberId, category.id, trainingId, trainingDate,
          'drop_in', 'no_payment', orgOpts,
        )
        router.refresh()
      } catch (err) {
        console.error('[handleAttendanceWithPrompt reset]', err)
      }
    })
  }

  // ── Ações em massa ──────────────────────────────────────────────────
  // Checkboxes de seleção ficam SEMPRE visíveis nas tabelas (owner pediu:
  // "não quero ter que clicar em 'ações em massa' antes de selecionar").
  // Ao marcar cada célula o coord vai montando a lista de pares
  // (trainingId, memberId); chave do Set = `${trainingId}:${memberId}`.
  //
  // `bulkOpen` controla só o Sheet de ação — abre quando o coord clica
  // "Ações em massa" após ter selecionado algo. Sem seleção, o botão
  // fica desabilitado (não tem ação a aplicar).
  const [bulkOpen, setBulkOpen] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [bulkPending, setBulkPending] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null)

  function makeKey(trainingId: string, memberId: string) {
    return `${trainingId}:${memberId}`
  }

  function toggleKey(trainingId: string, memberId: string) {
    const key = makeKey(trainingId, memberId)
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function clearSelection() {
    setSelectedKeys(new Set())
  }

  function closeBulkSheet() {
    setBulkOpen(false)
  }

  function removeKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  // Lista "rica" dos pares selecionados — adiciona nome do atleta e data
  // do treino. Passada pro BulkActionsSheet pra mostrar a revisão agrupada
  // por dia. useMemo recalcula só quando seleção/dataset muda.
  const selectedItems = useMemo(() => {
    const memberById = new Map(members.map((m) => [m.id, m.name]))
    const trainingById = new Map(trainings.map((t) => [t.id, t]))
    type Item = {
      key: string
      trainingId: string
      memberId: string
      memberName: string
      trainingDate: string
    }
    const items: Item[] = []
    for (const key of selectedKeys) {
      const [trainingId, memberId] = key.split(':')
      const t = trainingById.get(trainingId)
      const name = memberById.get(memberId)
      if (!t || !name) continue
      items.push({ key, trainingId, memberId, memberName: name, trainingDate: t.date })
    }
    return items
  }, [selectedKeys, members, trainings])

  /**
   * Aplica uma ação aos pares (trainingId, memberId) selecionados.
   *
   * Casos:
   *   • Presença e Status ("Pago" / "Pendente" / "Sem pagamento") são
   *     aplicados INDIVIDUALMENTE por par selecionado — o coord escolheu
   *     quais células mudar.
   *   • Tipo "Mensal" é AGREGADO por atleta único: promove como mensalista
   *     do mês (propaga pra todos os treinos). O coord normalmente não
   *     quer "X treinos mensais de N" misturado com "outros avulsos".
   *     Então extraímos os atletas distintos da seleção.
   *   • Tipo "Avulso" / "Sem pagamento": idem — aplica por atleta único
   *     (desmarca mensalista e propaga via setMonthlyPayer, depois
   *     eventualmente seta no_payment nos treinos específicos).
   *
   * Progresso mostrado na UI pra o user ver que está trabalhando.
   */
  async function handleBulkApply(
    action: 'attendance' | 'type' | 'status',
    value: string,
  ) {
    const keys = Array.from(selectedKeys)
    if (keys.length === 0) return

    // Decompõe pares selecionados
    const pairs = keys.map((k) => {
      const [trainingId, memberId] = k.split(':')
      return { trainingId, memberId }
    })
    // Atletas únicos pra ações "por atleta" (tipo Mensal)
    const uniqueMembers = Array.from(new Set(pairs.map((p) => p.memberId)))

    const total = action === 'type' && value === 'monthly'
      ? uniqueMembers.length
      : action === 'type' && value !== 'monthly'
        ? uniqueMembers.length + pairs.length
        : pairs.length

    setBulkPending(true)
    setBulkProgress({ done: 0, total })

    try {
      let done = 0

      if (action === 'attendance') {
        const status = value as 'present' | 'absent'
        for (const { trainingId, memberId } of pairs) {
          await setAttendance(trainingId, memberId, status, orgOpts)
          done++
          setBulkProgress({ done, total })
        }
      } else if (action === 'type') {
        if (value === 'monthly') {
          // Promove cada atleta único como mensalista do mês — propaga
          // pros treinos dele automaticamente.
          for (const memberId of uniqueMembers) {
            await setMonthlyPayer(memberId, category.id, month, year, true, orgOpts)
            done++
            setBulkProgress({ done, total })
          }
        } else {
          // Desmarca mensalista (se fosse) via setMonthlyPayer(false), que já
          // converte 'monthly' → 'drop_in' automaticamente nos treinos do mês.
          for (const memberId of uniqueMembers) {
            await setMonthlyPayer(memberId, category.id, month, year, false, orgOpts)
            done++
            setBulkProgress({ done, total })
          }
          if (value === 'no_payment') {
            // Para "sem pagamento", ainda seta o status nos treinos selecionados.
            for (const { trainingId, memberId } of pairs) {
              await setTrainingPayment(trainingId, memberId, null, 'no_payment', orgOpts)
              done++
              setBulkProgress({ done, total })
            }
          } else {
            // Pra "avulso" puro, o setMonthlyPayer(false) já fez o trabalho.
            // Marca o restante como done.
            done += pairs.length
            setBulkProgress({ done, total })
          }
        }
      } else if (action === 'status') {
        const status = value as 'pending' | 'paid' | 'no_payment'
        for (const { trainingId, memberId } of pairs) {
          await setTrainingPayment(trainingId, memberId, 'drop_in', status, orgOpts)
          done++
          setBulkProgress({ done, total })
        }
      }

      // Aplicou? Limpa seleção e fecha o sheet. Checkboxes continuam
      // visíveis na tabela (sempre estão) — só esvaziamos o que tinha
      // sido marcado, pronto pra próxima seleção.
      clearSelection()
      closeBulkSheet()
      router.refresh()
    } catch (err) {
      console.error('[handleBulkApply]', err)
    } finally {
      setBulkPending(false)
      setBulkProgress(null)
    }
  }

  // ── Cancelamento de treino ──────────────────────────────────────────
  const [cancelState, setCancelState] = useState<{ id: string; date: string } | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  function handleSubmitCancel() {
    if (!cancelState) return
    const reason = cancelReason.trim() || null
    const { id } = cancelState
    setCancelState(null)
    setCancelReason('')
    startTransition(async () => {
      try {
        await setTrainingStatus(id, 'cancelled', reason, orgOpts)
        router.refresh()
      } catch (err) {
        console.error('[handleSubmitCancel]', err)
      }
    })
  }

  async function handleReactivate(trainingId: string) {
    const ok = await confirm({
      title: 'Reativar este treino?',
      description: 'O treino volta a aparecer como ativo. Presenças e pagamentos anteriores (se existirem) são preservados.',
      confirmLabel: 'Reativar',
    })
    if (!ok) return
    startTransition(async () => {
      try {
        await setTrainingStatus(trainingId, 'scheduled', null, orgOpts)
        router.refresh()
      } catch (err) {
        console.error('[handleReactivate]', err)
      }
    })
  }

  // ── Guards de estado vazio ──────────────────────────────────────────
  if (members.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-dashed border-border/60 py-12 text-center">
        <Users className="h-5 w-5 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">Nenhum atleta nesta categoria.</p>
        <p className="text-[11px] text-muted-foreground/70 mt-1">Cadastre em <strong>Membros</strong>.</p>
      </div>
    )
  }

  if (trainings.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-dashed border-border/60 py-12 text-center">
        <Calendar className="h-5 w-5 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">Nenhum treino neste mês.</p>
      </div>
    )
  }

  return (
    <>
      {/* Aplicando (bar sticky sutil) + barra de progresso pra bulk. */}
      {(isPending || bulkPending) && (
        <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md">
          <Loader2 className="h-3.5 w-3.5 text-amber-600 animate-spin" />
          <span className="text-[11px] text-amber-800 font-medium">
            {bulkProgress
              ? `Aplicando em massa… ${bulkProgress.done}/${bulkProgress.total}`
              : 'Aplicando…'}
          </span>
        </div>
      )}

      {/* Toolbar — checkboxes de seleção ficam sempre visíveis nas tabelas;
          o coord vai marcando os pares (treino × atleta) e quando clica
          "Ações em massa", o Sheet abre pra escolher a alteração. Sem
          seleção o botão fica disabled (nada a aplicar). */}
      <div className="flex items-center justify-end gap-2">
        {selectedKeys.size > 0 && (
          <>
            <span className="text-[11px] text-muted-foreground">
              {selectedKeys.size} treino(s) selecionado(s)
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearSelection}
              disabled={bulkPending}
              className="gap-1.5 h-8"
            >
              <X className="h-3.5 w-3.5" />
              Limpar
            </Button>
          </>
        )}
        <Button
          type="button"
          variant={selectedKeys.size > 0 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBulkOpen(true)}
          disabled={isPending || bulkPending || selectedKeys.size === 0}
          className="gap-1.5 h-8"
          title={selectedKeys.size === 0
            ? 'Marque os treinos nas tabelas antes de abrir ações em massa'
            : `Aplicar ação em ${selectedKeys.size} treino(s) selecionado(s)`}
        >
          <Wand2 className="h-3.5 w-3.5" />
          Ações em massa
          {selectedKeys.size > 0 && (
            <span className="ml-0.5 text-[10px] font-bold bg-white/20 rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
              {selectedKeys.size}
            </span>
          )}
        </Button>
      </div>

      {/* Banner de confirmações pendentes — lista atletas que sinalizaram
          pagamento via /financials e aguardam aprovação. Cada linha tem
          Confirmar/Rejeitar direto (mesmos handlers que os cards). Só
          renderiza quando há >0 awaiting — evita barulho visual desnecessário. */}
      {awaitingList.length > 0 && (
        <AwaitingConfirmationsPanel
          items={awaitingList}
          onConfirm={(r) => handleDropInStatus(r.trainingId, r.memberId, r.trainingDate, 'paid')}
          onReject={(r) => handleDropInStatus(r.trainingId, r.memberId, r.trainingDate, 'pending')}
          disabled={isPending}
        />
      )}

      {/* Painel de mensalistas do mês */}
      <MonthlyPayersPanel
        members={members}
        category={category}
        month={month} year={year}
        monthlyByMember={monthlyByMember}
        onToggleMonthlyPayer={handleToggleMonthlyPayer}
        onSetStatus={handleMonthlyStatus}
        disabled={isPending}
      />

      {/* Cards de treino (um por dia) */}
      <div className="space-y-3">
        {trainings.map((t) => (
          <TrainingDayCard
            key={t.id}
            training={t}
            category={category}
            members={members}
            attendances={attendances}
            monthlyByMember={monthlyByMember}
            onAttendance={handleAttendanceWithPrompt}
            onDropInStatus={handleDropInStatus}
            onSetType={handleSetPaymentType}
            onToggleMonthly={handleToggleMonthlyPayer}
            onCancelRequest={() => { setCancelReason(''); setCancelState({ id: t.id, date: t.date }) }}
            onReactivate={() => handleReactivate(t.id)}
            disabled={isPending}
            bulkMode
            selectedKeys={selectedKeys}
            onToggleKey={toggleKey}
          />
        ))}
      </div>

      {/* Dialog de cancelamento */}
      <Dialog open={cancelState !== null} onOpenChange={(o) => !o && setCancelState(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar como sem treino?</DialogTitle>
            <DialogDescription>
              O treino não será contado pra presença nem pagamento. Você pode reativar depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium">Motivo (opcional)</label>
            <Textarea
              placeholder="Ex: Feriado, ginásio fechado, chuva forte…"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="min-h-[80px] text-sm"
              maxLength={200}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelState(null)} className="h-9">Cancelar</Button>
            <Button variant="destructive" onClick={handleSubmitCancel} className="h-9">
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sheet de ações em massa — resumo da seleção + ação + valor.
          `selectedItems` é a lista enriquecida (nome + data do treino)
          pra renderizar a revisão agrupada por dia dentro do sheet. */}
      <BulkActionsSheet
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        selectedItems={selectedItems}
        onRemoveItem={removeKey}
        onApply={handleBulkApply}
        onClear={clearSelection}
        pending={bulkPending}
      />

      {/* Dialog de justificativa de isenção — pedido quando o coord escolhe
          "Isento" no select. Texto livre opcional que grava em payment_note
          (visível pro próprio coord na lista de confirmações + auditoria). */}
      <Dialog open={exemptState !== null} onOpenChange={(o) => !o && setExemptState(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Justificativa da isenção</DialogTitle>
            <DialogDescription>
              Explique por que esse atleta está isento deste treino. O texto
              fica salvo na observação do pagamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-xs font-medium">Justificativa (opcional)</label>
            <Textarea
              placeholder="Ex: Atleta lesionado, treino de cortesia, convidado pra experimentar…"
              value={exemptReason}
              onChange={(e) => setExemptReason(e.target.value)}
              className="min-h-[90px] text-sm"
              maxLength={500}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExemptState(null)} className="h-9">
              Cancelar
            </Button>
            <Button onClick={handleSubmitExempt} className="h-9">
              Marcar como isento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Painel de confirmações pendentes ──────────────────────────────────
//
// Banner agrupando todos os attendances awaiting_confirmation da
// categoria/período ativo. Quando atleta (ex: Natália) sinaliza "paguei"
// via /financials, o coord enxerga TODOS os sinais aqui em um lugar só
// — sem precisar scrollar treino por treino. Cada linha tem botões
// Confirmar/Rejeitar; o handler é o mesmo do card inline (mudar status
// pra 'paid' ou 'pending').

function AwaitingConfirmationsPanel({
  items, onConfirm, onReject, disabled,
}: {
  items: Array<{
    trainingId: string
    memberId: string
    memberName: string
    trainingDate: string
    paymentType: string | null
  }>
  onConfirm: (row: {
    trainingId: string
    memberId: string
    trainingDate: string
  }) => void
  onReject: (row: {
    trainingId: string
    memberId: string
    trainingDate: string
  }) => void
  disabled: boolean
}) {
  return (
    <div className="bg-indigo-50/50 rounded-xl border border-indigo-200 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden dark:bg-indigo-500/5 dark:border-indigo-500/30">
      <div className="px-4 py-3 border-b border-indigo-200/60 flex items-center gap-2 dark:border-indigo-500/20">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
          <Clock className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold font-heading text-indigo-900 dark:text-indigo-100">
            {items.length} pagamento(s) aguardando sua confirmação
          </h3>
          <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/70">
            Confirme o recebimento (PIX/dinheiro) e aprove abaixo
          </p>
        </div>
      </div>
      <div className="divide-y divide-indigo-200/40 dark:divide-indigo-500/15">
        {items.map((r) => {
          const dateLabel = new Date(r.trainingDate + 'T00:00:00').toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
          })
          return (
            <div
              key={`${r.trainingId}:${r.memberId}`}
              className="px-4 py-2.5 flex items-center gap-3"
            >
              {/* Avatar com inicial */}
              <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-50 ring-1 ring-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-xs dark:from-indigo-500/20 dark:to-indigo-500/10 dark:text-indigo-200 dark:ring-indigo-500/30">
                {r.memberName.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{r.memberName}</p>
                <p className="text-[11px] text-muted-foreground">
                  Treino · {dateLabel}
                  {r.paymentType === 'drop_in' && ' · Avulso'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onReject({
                    trainingId: r.trainingId,
                    memberId: r.memberId,
                    trainingDate: r.trainingDate,
                  })}
                  disabled={disabled}
                  className="h-8 gap-1 text-rose-700 border-rose-300 hover:bg-rose-50 dark:text-rose-300 dark:border-rose-500/30 dark:hover:bg-rose-500/10"
                >
                  <X className="h-3.5 w-3.5" />
                  Rejeitar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onConfirm({
                    trainingId: r.trainingId,
                    memberId: r.memberId,
                    trainingDate: r.trainingDate,
                  })}
                  disabled={disabled}
                  className="h-8 gap-1 bg-emerald-600 hover:bg-emerald-700"
                >
                  <Check className="h-3.5 w-3.5" />
                  Confirmar
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Painel de mensalistas ─────────────────────────────────────────────

function MonthlyPayersPanel({
  members, category, month, year,
  monthlyByMember, onToggleMonthlyPayer, onSetStatus, disabled,
}: {
  members: { id: string; name: string }[]
  category: Category
  month: number
  year: number
  monthlyByMember: Map<string, MonthlyPayment>
  onToggleMonthlyPayer: (memberId: string, isMonthly: boolean) => void
  onSetStatus: (memberId: string, status: MonthlyStatus) => void
  disabled: boolean
}) {
  const [addOpen, setAddOpen] = useState(false)
  const { confirm } = useConfirm()

  const monthlyPayers = members.filter((m) => monthlyByMember.get(m.id)?.is_monthly_payer)
  const nonMonthly = members.filter((m) => !monthlyByMember.get(m.id)?.is_monthly_payer)

  async function handleRemove(memberId: string, name: string) {
    const ok = await confirm({
      title: `Tirar ${name} dos mensalistas?`,
      description: 'Ele passa a ser tratado como avulso — pagamento por treino. O status do mês é limpo.',
      variant: 'destructive',
      confirmLabel: 'Remover',
    })
    if (!ok) return
    onToggleMonthlyPayer(memberId, false)
  }

  // Painel só aparece quando há mensalistas. Se a categoria não tem mensal
  // habilitado OU ninguém foi marcado como mensalista, nem renderiza — o
  // coord "promove" um atleta a mensalista clicando no select de tipo de
  // pagamento na linha dele dentro do card do treino, e aí o painel ressurge.
  if (!category.has_monthly || monthlyPayers.length === 0) {
    return null
  }

  return (
    <div className="bg-card rounded-xl ring-1 ring-foreground/10 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 bg-gradient-to-r from-emerald-50/40 to-transparent">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
            <Crown className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Mensalistas</p>
            <p className="text-[11px] text-muted-foreground">
              {MONTH_NAMES[month]} · {year} · {monthlyPayers.length} atleta(s)
            </p>
          </div>
        </div>
        {nonMonthly.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAddOpen(true)}
            disabled={disabled}
            className="gap-1.5 h-8"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        )}
      </div>

      <div className="divide-y divide-border/20">
        {monthlyPayers.map((m) => {
          const mp = monthlyByMember.get(m.id)!
          const status = (mp.payment_status ?? 'pending') as string
          return (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors">
              <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-50 ring-1 ring-emerald-200 flex items-center justify-center text-xs font-semibold text-emerald-700">
                {m.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{m.name}</p>
                {mp.payment_note && (
                  <p className="text-[10px] text-muted-foreground/70 italic truncate">“{mp.payment_note}”</p>
                )}
              </div>
              <MonthlyStatusToggle
                status={status}
                onChange={(s) => onSetStatus(m.id, s)}
                disabled={disabled}
              />
              <button
                type="button"
                onClick={() => handleRemove(m.id, m.name)}
                disabled={disabled}
                className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-rose-700 hover:bg-rose-50 transition-colors disabled:opacity-50"
                title="Remover dos mensalistas"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Dialog adicionar mensalista */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar mensalista</DialogTitle>
            <DialogDescription>
              Escolha os atletas que pagam mensalidade neste mês em {category.name}.
              Eles não vão aparecer com pagamento avulso por treino.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[320px] overflow-y-auto divide-y divide-border/20 border border-border/40 rounded-lg">
            {nonMonthly.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onToggleMonthlyPayer(m.id, true)
                  setAddOpen(false)
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="h-7 w-7 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium flex-1 truncate">{m.name}</span>
                <Plus className="h-4 w-4 text-muted-foreground/50" />
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} className="h-9">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MonthlyStatusToggle({
  status, onChange, disabled,
}: {
  status: string
  onChange: (s: MonthlyStatus) => void
  disabled: boolean
}) {
  // 3 estados renderizáveis: pending, paid, awaiting_confirmation (readonly).
  // Atleta é quem dispara 'awaiting_confirmation' via /financials; aqui o coord
  // só visualiza e pode converter pra 'paid' ou 'pending' (rejeitando).
  const isPaid = status === 'paid'
  const isAwaiting = status === 'awaiting_confirmation'

  if (isAwaiting) {
    return (
      <div className="flex gap-0.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange('pending')}
          disabled={disabled}
          className="h-7 gap-1 text-[11px] border-rose-200 text-rose-700 hover:bg-rose-50"
        >
          <X className="h-3 w-3" />
          Rejeitar
        </Button>
        <Button
          size="sm"
          onClick={() => onChange('paid')}
          disabled={disabled}
          className="h-7 gap-1 text-[11px] bg-emerald-600 hover:bg-emerald-700"
        >
          <Check className="h-3 w-3" />
          Confirmar
        </Button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onChange(isPaid ? 'pending' : 'paid')}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-md border transition-all disabled:opacity-50 ${
        isPaid
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
          : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
      }`}
      title={isPaid ? 'Clique pra voltar a pendente' : 'Clique pra marcar como pago'}
    >
      {isPaid ? <Check className="h-3 w-3" /> : <Wallet className="h-3 w-3" />}
      {isPaid ? 'Pago' : 'Pendente'}
    </button>
  )
}

// ── Card de um dia de treino ──────────────────────────────────────────

function TrainingDayCard({
  training, category, members, attendances, monthlyByMember,
  onAttendance, onDropInStatus, onSetType, onToggleMonthly,
  onCancelRequest, onReactivate, disabled,
  bulkMode, selectedKeys, onToggleKey,
}: {
  training: Training
  category: Category
  members: { id: string; name: string }[]
  attendances: Attendance[]
  monthlyByMember: Map<string, MonthlyPayment>
  /** Marca presença. Quando muda pra 'absent', pode abrir confirm de reset. */
  onAttendance: (
    trainingId: string, memberId: string, status: 'present' | 'absent',
    trainingDate: string, currentPaymentStatus: string | null, isMonthly: boolean,
    currentType: string | null,
  ) => void
  onDropInStatus: (trainingId: string, memberId: string, trainingDate: string, status: DropInStatus) => void
  /** Troca o tipo do pagamento no treino (drop_in OU null=Sem pagamento). */
  onSetType: (trainingId: string, memberId: string, newType: 'drop_in' | null, currentStatus: string) => void
  /** Promove/desmarca o atleta como mensalista do mês (via select no card). */
  onToggleMonthly: (memberId: string, makeItMonthly: boolean) => void
  onCancelRequest: () => void
  onReactivate: () => void
  disabled: boolean
  /** Modo bulk: adiciona coluna de checkboxes na tabela. */
  bulkMode: boolean
  selectedKeys: Set<string>
  onToggleKey: (trainingId: string, memberId: string) => void
}) {
  const date = new Date(training.date + 'T00:00:00')
  const weekdayFull = WEEKDAY_FULL[date.getDay()]
  const dateFull = date.toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  const isCancelled = training.status === 'cancelled'
  const reason = training.cancellation_reason?.trim() ?? null

  // Defaults pra quando atleta não tem attendance ainda — passado vs futuro
  // (ver `getDefaultsForDate`).
  const defaults = useMemo(() => getDefaultsForDate(training.date), [training.date])

  // Lookup attendance por member
  const attByMember = useMemo(() => {
    const m = new Map<string, Attendance>()
    for (const a of attendances) {
      if (a.training_id === training.id) m.set(a.member_id, a)
    }
    return m
  }, [attendances, training.id])

  return (
    <div className={`bg-card rounded-xl ring-1 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden transition-all ${
      isCancelled ? 'ring-border/40 opacity-75' : 'ring-cream-border'
    }`}>
      {/* Header "areia" — dia da semana por extenso + data + horário + local.
          Fundo cream-sunken (tom areia quente) cria contraste suave com o
          corpo cream-raised abaixo. Altura maior que antes pra acomodar
          todos os metadados de um jeito mais "respirado". */}
      <div className={`flex items-start md:items-center gap-3 px-4 py-3 border-b ${
        isCancelled ? 'bg-slate-50/60 border-slate-200' : 'bg-cream-sunken border-cream-border'
      }`}>
        <div className="flex flex-col md:flex-row md:items-baseline md:gap-2 shrink-0 min-w-0">
          <span className={`text-sm md:text-base font-semibold tracking-tight ${
            isCancelled ? 'text-slate-400 line-through decoration-slate-300' : 'text-foreground'
          }`}>
            {weekdayFull}
          </span>
          {/* Data com o MESMO peso visual do dia da semana (ajuste pedido).
              Tabular-nums pra alinhar dígitos, mas sem font-mono (deixava
              muito diferente da label weekday). */}
          <span className={`text-sm md:text-base font-semibold tabular-nums tracking-tight ${
            isCancelled ? 'text-slate-400 line-through decoration-slate-300' : 'text-foreground'
          }`}>
            {dateFull}
          </span>
        </div>

        <div className="flex-1 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap min-w-0">
          {(category.start_time || category.end_time) && (
            <span className="flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3" />
              {category.start_time}{category.end_time ? `–${category.end_time}` : ''}
            </span>
          )}
          {category.location && (
            <span className="flex items-center gap-1 min-w-0">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{category.location}</span>
            </span>
          )}
          {isCancelled && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
              <CalendarOff className="h-3 w-3" />
              Sem treino
              {reason && <span className="italic font-normal">· {reason}</span>}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={isCancelled ? onReactivate : onCancelRequest}
          disabled={disabled}
          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border transition-colors disabled:opacity-50 shrink-0 ${
            isCancelled
              ? 'border-emerald-200 text-emerald-700 bg-card hover:bg-emerald-50'
              : 'border-cream-border text-muted-foreground bg-card hover:border-rose-200 hover:text-rose-700 hover:bg-rose-50'
          }`}
          title={isCancelled ? 'Reativar treino' : 'Marcar como sem treino'}
        >
          {isCancelled ? (<><Calendar className="h-3 w-3" /> Reativar</>) : (<><CalendarOff className="h-3 w-3" /> Sem treino</>)}
        </button>
      </div>

      {/* Tabela de atletas (se treino ativo) — 4 colunas: Atleta, Presença,
          Tipo, Pagamento. `table-fixed` + `<colgroup>` garante que cada
          coluna tenha a MESMA largura em todos os cards de treino do mês,
          mesmo com quantidades de atletas diferentes. Linhas intercaladas
          `odd:bg-cream-sunken/30` pra dar efeito zebra sutil. */}
      {!isCancelled && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <colgroup>
              {bulkMode && <col className="w-[44px]" />}
              <col />
              <col className="w-[200px]" />
              <col className="w-[160px]" />
              <col className="w-[180px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-cream-border/60">
                {bulkMode && (
                  <th className="py-2 px-3 w-[44px]">
                    <span className="sr-only">Seleção</span>
                  </th>
                )}
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 py-2 px-4">
                  Atleta
                </th>
                <th className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 py-2 px-3">
                  Presença
                </th>
                <th className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 py-2 px-3">
                  Tipo
                </th>
                <th className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 py-2 px-3">
                  Pagamento
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const mp = monthlyByMember.get(m.id)
                const isMonthly = mp?.is_monthly_payer ?? false
                const att = attByMember.get(m.id)
                const isPresent = att?.status === 'present'

                // Status efetivo: se tem attendance, usa o salvo; senão cai
                // nos defaults (futuro = no_payment, passado = pending).
                const effectiveStatus = (att?.payment_status ?? defaults.status) as string
                // Tipo efetivo: `monthly_payments` é a SOURCE OF TRUTH pra
                // mensalista do mês. Se `isMonthly=true`, o tipo é SEMPRE
                // 'monthly' mesmo que o attendance ainda tenha payment_type
                // obsoleto (inconsistência transitória resolvida na próxima
                // ação). Evita Gabriel aparecer como Avulso quando o coord
                // já o promoveu a mensalista.
                const effectiveType = isMonthly
                  ? 'monthly'
                  : (att?.payment_type ?? defaults.type)
                const isAttendanceAwaiting = effectiveStatus === 'awaiting_confirmation'

                const bulkKey = `${training.id}:${m.id}`
                const isSelected = bulkMode && selectedKeys.has(bulkKey)

                return (
                  <tr
                    key={m.id}
                    className={`border-b border-cream-border/30 last:border-0 transition-colors ${
                      isSelected
                        ? 'bg-primary/10'
                        : 'odd:bg-cream-sunken/30 hover:bg-primary/5'
                    }`}
                  >
                    {/* Coluna de seleção (só no modo bulk). Click no checkbox
                        OU na linha toda (via evento) marca/desmarca. */}
                    {bulkMode && (
                      <td className="py-2 px-3 align-middle">
                        <button
                          type="button"
                          onClick={() => onToggleKey(training.id, m.id)}
                          disabled={disabled}
                          aria-label={isSelected ? 'Desmarcar' : 'Marcar'}
                          className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted/40 transition-colors disabled:opacity-50"
                        >
                          {isSelected ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground/50" />
                          )}
                        </button>
                      </td>
                    )}

                    {/* Coluna Atleta — avatar + nome + chip Mensalista */}
                    <td className="py-2 px-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`h-8 w-8 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold ${
                          isMonthly
                            ? 'bg-gradient-to-br from-emerald-100 to-emerald-50 ring-1 ring-emerald-200 text-emerald-700'
                            : 'bg-gradient-to-br from-muted to-muted/50 text-muted-foreground'
                        }`}>
                          {m.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          {isMonthly && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 uppercase tracking-wider">
                              <Crown className="h-2.5 w-2.5" />
                              Mensalista
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Coluna Presença */}
                    <td className="py-2 px-3 align-middle">
                      <div className="flex justify-center">
                        <AttendanceToggle
                          isPresent={isPresent}
                          onChange={(s) =>
                            onAttendance(
                              training.id, m.id, s, training.date,
                              effectiveStatus, isMonthly, effectiveType,
                            )
                          }
                          disabled={disabled}
                        />
                      </div>
                    </td>

                    {/* Coluna Tipo (avulso / mensal / sem pagamento) */}
                    <td className="py-2 px-3 align-middle">
                      <div className="flex justify-center">
                        {isAttendanceAwaiting ? (
                          <span className="text-[10px] text-muted-foreground/60">—</span>
                        ) : (
                          <TypeSelect
                            currentType={effectiveType}
                            onChange={(newType) => {
                              if (newType === 'monthly') {
                                onToggleMonthly(m.id, true)
                              } else if (newType === 'drop_in') {
                                if (isMonthly) onToggleMonthly(m.id, false)
                                else onSetType(training.id, m.id, 'drop_in', effectiveStatus)
                              } else {
                                // 'no_payment' no TIPO = sem pagamento (type=null)
                                if (isMonthly) onToggleMonthly(m.id, false)
                                else onSetType(training.id, m.id, null, effectiveStatus)
                              }
                            }}
                            disabled={disabled}
                          />
                        )}
                      </div>
                    </td>

                    {/* Coluna Pagamento (status) — quando `awaiting_confirmation`
                        o atleta sinalizou via /financials que pagou. Mostra
                        botões pro coord Confirmar (→ paid) ou Rejeitar
                        (→ pending). É o mesmo fluxo da aba "Confirmações
                        Pendentes" no /financials, só que contextualizado
                        dentro do treino — evita fazer o coord pingar entre
                        as duas telas pra revisar. */}
                    <td className="py-2 px-3 align-middle">
                      <div className="flex justify-center">
                        {isAttendanceAwaiting ? (
                          <AwaitingConfirmActions
                            onConfirm={() => onDropInStatus(training.id, m.id, training.date, 'paid')}
                            onReject={() => onDropInStatus(training.id, m.id, training.date, 'pending')}
                            disabled={disabled}
                          />
                        ) : isMonthly ? (
                          <MonthlyStatusBadge status={mp?.payment_status ?? 'pending'} />
                        ) : (
                          <StatusSelect
                            status={effectiveStatus}
                            onChange={(s) => onDropInStatus(training.id, m.id, training.date, s)}
                            disabled={disabled}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Toggle de presença ────────────────────────────────────────────────

function AttendanceToggle({
  isPresent, onChange, disabled,
}: {
  isPresent: boolean
  onChange: (status: 'present' | 'absent') => void
  disabled: boolean
}) {
  return (
    <div className="inline-flex rounded-md overflow-hidden ring-1 ring-border/60 shrink-0">
      <button
        type="button"
        onClick={() => onChange('present')}
        disabled={disabled}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 transition-colors disabled:opacity-50 ${
          isPresent
            ? 'bg-emerald-500 text-white'
            : 'bg-transparent text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700'
        }`}
        title="Marcar presente"
      >
        <UserCheck className="h-3 w-3" />
        Presente
      </button>
      <button
        type="button"
        onClick={() => onChange('absent')}
        disabled={disabled}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 transition-colors disabled:opacity-50 ${
          !isPresent
            ? 'bg-rose-500 text-white'
            : 'bg-transparent text-muted-foreground hover:bg-rose-50 hover:text-rose-700'
        }`}
        title="Marcar falta"
      >
        <UserX className="h-3 w-3" />
        Faltou
      </button>
    </div>
  )
}

// ── Selects de Tipo e Status (cada coluna da tabela usa 1) ────────────
//
// Tipo (coluna 3): Avulso / Mensal / Sem pagamento
//   - Avulso (drop_in): pagamento por treino
//   - Mensal (monthly): promove pra painel de mensalistas
//   - Sem pagamento (no_payment): treino não gera cobrança (treino futuro)
//
// Status (coluna 4, só pra avulso): Pendente / Pago / Isento / Sem pagamento
//   - Pro mensalista, a coluna mostra badge readonly (controle no painel).
//   - Pro atleta que pediu confirmação via /financials, badge "Aguardando".

const TYPE_ITEMS: Record<string, string> = {
  drop_in:    'Avulso',
  monthly:    'Mensal',
  no_payment: 'Sem pagamento',
}
const TYPE_DOT: Record<string, string> = {
  drop_in:    'bg-amber-500',
  monthly:    'bg-emerald-500',
  no_payment: 'bg-slate-400',
}

const STATUS_ITEMS: Record<string, string> = {
  pending:    'Pendente',
  paid:       'Pago',
  exempt:     'Isento',
  refunded:   'Estornado',
  no_payment: 'Sem pagamento',
}
const STATUS_DOT: Record<string, string> = {
  pending:    'bg-amber-500',
  paid:       'bg-emerald-500',
  exempt:     'bg-sky-400',
  refunded:   'bg-violet-500',
  no_payment: 'bg-slate-400',
}

/**
 * Select do TIPO de pagamento. Normaliza:
 *   • `currentType = 'monthly'`  → atleta é mensalista
 *   • `currentType = 'drop_in'`  → avulso
 *   • `currentType = null`       → sem pagamento (mostra como 'no_payment')
 */
function TypeSelect({
  currentType, onChange, disabled,
}: {
  currentType: string | null
  onChange: (newType: 'drop_in' | 'monthly' | 'no_payment') => void
  disabled: boolean
}) {
  const effective = currentType ?? 'no_payment'
  return (
    <Select
      value={effective}
      onValueChange={(val) => {
        if (val !== null) onChange(val as 'drop_in' | 'monthly' | 'no_payment')
      }}
      items={TYPE_ITEMS}
      modal={false}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        className="!h-auto min-h-0 py-[3px] px-1.5 text-[10px] font-medium rounded-md border-cream-border hover:border-border/70 gap-1 bg-card [&_svg:not([class*='size-'])]:size-3"
      >
        <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${TYPE_DOT[effective]}`} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {(['drop_in', 'monthly', 'no_payment'] as const).map((t) => (
          <SelectItem key={t} value={t} className="text-xs">
            <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${TYPE_DOT[t]}`} />
            {TYPE_ITEMS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Select do STATUS de pagamento avulso (não aparece pra mensalista).
 */
function StatusSelect({
  status, onChange, disabled,
}: {
  status: string
  onChange: (s: DropInStatus) => void
  disabled: boolean
}) {
  const effective = status || 'pending'
  return (
    <Select
      value={effective}
      onValueChange={(val) => {
        if (val !== null) onChange(val as DropInStatus)
      }}
      items={STATUS_ITEMS}
      modal={false}
      disabled={disabled}
    >
      <SelectTrigger
        size="sm"
        className="!h-auto min-h-0 py-[3px] px-1.5 text-[10px] font-medium rounded-md border-cream-border hover:border-border/70 gap-1 bg-card [&_svg:not([class*='size-'])]:size-3"
      >
        <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[effective]}`} />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {(['pending', 'paid', 'exempt', 'refunded', 'no_payment'] as DropInStatus[]).map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[s]}`} />
            {STATUS_ITEMS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ── Sheet de ações em massa ────────────────────────────────────────────
//
// Painel lateral que o coord abre pra aplicar uma mesma ação a vários
// atletas de uma vez. Fluxo típico:
//   1. Coord clica "Ações em massa" no topo da tela
//   2. Sheet abre com lista de atletas + checkbox
//   3. Coord seleciona quem quer afetar
//   4. Escolhe o tipo de ação (Presença / Tipo de pagamento / Status)
//   5. Escolhe o valor (ex: Presente, Avulso, Pago)
//   6. Clica "Aplicar"
//   7. Loop no cliente aplica a ação aos selecionados + refresh
//
// A lógica client-side é intencionalmente simples (1 chamada por par
// atleta×treino). Pra orgs muito grandes pode ser otimizado com action
// server que faz batch — mas pro tamanho típico já é rápido o suficiente.

type BulkAction = 'attendance' | 'type' | 'status'

const BULK_ACTION_LABELS: Record<BulkAction, string> = {
  attendance: 'Presença',
  type:       'Tipo de pagamento',
  status:     'Situação do pagamento',
}

const BULK_VALUE_OPTIONS: Record<BulkAction, Array<{ value: string; label: string }>> = {
  attendance: [
    { value: 'present', label: 'Presente' },
    { value: 'absent',  label: 'Faltou' },
  ],
  type: [
    { value: 'drop_in',    label: 'Avulso' },
    { value: 'monthly',    label: 'Mensal' },
    { value: 'no_payment', label: 'Sem pagamento' },
  ],
  status: [
    { value: 'pending',    label: 'Pendente' },
    { value: 'paid',       label: 'Pago' },
    { value: 'no_payment', label: 'Sem pagamento' },
  ],
}

function BulkActionsSheet({
  open, onClose, selectedItems, onRemoveItem, onApply, onClear, pending,
}: {
  open: boolean
  onClose: () => void
  /** Lista enriquecida (nome do atleta + data do treino) dos pares marcados. */
  selectedItems: Array<{
    key: string
    trainingId: string
    memberId: string
    memberName: string
    trainingDate: string
  }>
  /** Remove um par específico da seleção (ícone X na linha do atleta). */
  onRemoveItem: (key: string) => void
  onApply: (action: BulkAction, value: string) => void
  onClear: () => void
  pending: boolean
}) {
  const [action, setAction] = useState<BulkAction>('attendance')
  const [value, setValue] = useState<string>('present')
  /**
   * Ordem dos grupos de dia na revisão:
   *   • 'asc'  = mais antigo no topo (dia 03 antes do dia 28)
   *   • 'desc' = mais novo no topo (default — normalmente o coord está
   *     revisando algo recente e quer ver primeiro)
   * O toggle vive só dentro do sheet — não persiste entre aberturas,
   * é decisão contextual da revisão atual.
   */
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const { confirm } = useConfirm()

  const selectedCount = selectedItems.length

  // Ao trocar a ação, reseta o valor pro primeiro da lista da nova ação —
  // evita ficar com valor inválido (ex: 'present' quando troca pra 'type').
  function handleActionChange(a: BulkAction) {
    setAction(a)
    setValue(BULK_VALUE_OPTIONS[a][0].value)
  }

  const options = BULK_VALUE_OPTIONS[action]
  const currentValueLabel = options.find((o) => o.value === value)?.label ?? value

  // Agrupa pares selecionados por dia de treino. Cada grupo tem os atletas
  // daquele dia; ordem dos grupos controlada pelo `sortOrder`. Atletas
  // dentro de cada grupo vão ordenados alfabeticamente.
  const groupsByDay = useMemo(() => {
    const map = new Map<string, typeof selectedItems>()
    for (const it of selectedItems) {
      const arr = map.get(it.trainingDate) ?? []
      arr.push(it)
      map.set(it.trainingDate, arr)
    }
    const entries = Array.from(map.entries()).map(([date, items]) => ({
      date,
      items: items.slice().sort((a, b) => a.memberName.localeCompare(b.memberName, 'pt-BR')),
    }))
    entries.sort((a, b) => sortOrder === 'desc'
      ? b.date.localeCompare(a.date)
      : a.date.localeCompare(b.date),
    )
    return entries
  }, [selectedItems, sortOrder])

  async function handleClickApply() {
    if (selectedCount === 0) return
    // Confirmação explícita antes de aplicar — evita acidentes com lotes
    // grandes. Deixa claro: ação, valor, quantos, e que é irreversível
    // (precisa refazer manualmente se der errado).
    const ok = await confirm({
      title: 'Tem certeza que deseja alterar?',
      description: `Vai aplicar "${BULK_ACTION_LABELS[action]} → ${currentValueLabel}" em ${selectedCount} treino(s) marcado(s). Essa ação pode afetar presenças e pagamentos — reverter manualmente depois leva tempo.`,
      confirmLabel: 'Sim, aplicar',
      cancelLabel: 'Não',
    })
    if (!ok) return
    onApply(action, value)
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-[92vw] sm:w-[400px] sm:max-w-[400px] flex flex-col"
      >
        <SheetHeader className="pb-3 border-b border-border/40">
          <SheetTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-primary" />
            Ações em massa
          </SheetTitle>
          <SheetDescription>
            Revise os treinos selecionados e escolha a ação a aplicar.
          </SheetDescription>
        </SheetHeader>

        {/* Resumo da seleção + toggle de ordem */}
        <div className="px-4 py-3 border-b border-border/40 space-y-3">
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary font-bold font-mono tabular-nums shrink-0">
              {selectedCount}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                Treino(s) selecionado(s)
              </p>
              <p className="text-[11px] text-muted-foreground">
                {selectedCount === 0
                  ? 'Volte pro card do dia e marque pelo menos 1.'
                  : 'Escolha a ação abaixo e aplique.'}
              </p>
            </div>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={onClear}
                disabled={pending}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
              >
                Limpar
              </button>
            )}
          </div>

          {/* Toggle de ordenação dos grupos — 2 botões pill, compacto.
              Só mostra quando há mais de 1 dia selecionado (senão não faz
              diferença e polui a UI). */}
          {selectedCount > 0 && groupsByDay.length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                Ordenar por dia
              </span>
              <div className="inline-flex rounded-md overflow-hidden ring-1 ring-border/60">
                <button
                  type="button"
                  onClick={() => setSortOrder('desc')}
                  disabled={pending}
                  className={`text-[10px] font-medium px-2 py-1 transition-colors disabled:opacity-50 ${
                    sortOrder === 'desc'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-transparent text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  Mais novo
                </button>
                <button
                  type="button"
                  onClick={() => setSortOrder('asc')}
                  disabled={pending}
                  className={`text-[10px] font-medium px-2 py-1 transition-colors disabled:opacity-50 ${
                    sortOrder === 'asc'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-transparent text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  Mais antigo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Revisão dos selecionados (agrupada por dia) + seletores
            de ação/valor. Tudo dentro do mesmo scroll — revisa, escolhe,
            aplica, sem sair da tela. */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {selectedCount > 0 && (
            <div className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                Revisão
              </label>
              <div className="rounded-lg border border-border/50 bg-card/50 divide-y divide-border/30">
                {groupsByDay.map((group) => {
                  const d = new Date(group.date + 'T00:00:00')
                  const dateLabel = d.toLocaleDateString('pt-BR', {
                    day: '2-digit', month: '2-digit',
                  })
                  const weekday = WEEKDAY_FULL[d.getDay()]
                  return (
                    <div key={group.date}>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30">
                        <Calendar className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                        <span className="text-[11px] font-semibold text-foreground/80">
                          {dateLabel}
                        </span>
                        <span className="text-[10px] text-muted-foreground/70 truncate">
                          {weekday}
                        </span>
                        <span className="ml-auto text-[10px] font-mono tabular-nums text-muted-foreground/60 shrink-0">
                          {group.items.length}
                        </span>
                      </div>
                      <div className="divide-y divide-border/20">
                        {group.items.map((it) => (
                          <div
                            key={it.key}
                            className="flex items-center gap-2 px-3 py-1.5"
                          >
                            <span className="text-xs truncate flex-1 min-w-0">
                              {it.memberName}
                            </span>
                            <button
                              type="button"
                              onClick={() => onRemoveItem(it.key)}
                              disabled={pending}
                              className="h-5 w-5 flex items-center justify-center rounded hover:bg-rose-50 text-muted-foreground/50 hover:text-rose-600 transition-colors disabled:opacity-50 shrink-0"
                              title="Remover desta seleção"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Ação
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(['attendance', 'type', 'status'] as BulkAction[]).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => handleActionChange(a)}
                  disabled={pending}
                  className={`text-[11px] font-medium px-2 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${
                    action === a
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {BULK_ACTION_LABELS[a]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Valor
            </label>
            <div className="grid grid-cols-3 gap-1">
              {options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue(opt.value)}
                  disabled={pending}
                  className={`text-[11px] font-medium px-2 py-1.5 rounded-md border transition-colors disabled:opacity-50 ${
                    value === opt.value
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-card border-border/60 text-muted-foreground hover:border-emerald-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {action === 'type' && value === 'monthly' && (
            <p className="text-[11px] text-muted-foreground/80 italic leading-snug bg-muted/30 border border-border/40 rounded-lg px-3 py-2">
              Ao marcar &quot;Mensal&quot;, os atletas únicos dos treinos
              selecionados ficam mensalistas do mês inteiro (propaga pros
              demais treinos deles). Seleção treino-a-treino só importa pra
              saber <em>quem</em> vira mensalista.
            </p>
          )}
        </div>

        {/* Footer: botão aplicar. Desabilitado sem seleção ou durante pending. */}
        <div className="border-t border-border/40 px-4 py-3 bg-muted/20">
          <Button
            type="button"
            onClick={handleClickApply}
            disabled={selectedCount === 0 || pending}
            className="w-full gap-1.5"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Aplicando…
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Aplicar a {selectedCount} treino{selectedCount === 1 ? '' : 's'}
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ── Badge readonly do status mensal (quando atleta é mensalista) ──────

function MonthlyStatusBadge({ status }: { status: string }) {
  const isPaid = status === 'paid'
  const isAwaiting = status === 'awaiting_confirmation'
  const cls = isPaid
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
    : isAwaiting
    ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30'
    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30'
  const label = isPaid ? 'Pago' : isAwaiting ? 'Aguardando' : 'Pendente'
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-1 rounded-md border whitespace-nowrap ${cls}`}
      title="Status do mês — altere no painel de Mensalistas"
    >
      {label}
    </span>
  )
}

// ── Botões Confirmar/Rejeitar para attendances awaiting_confirmation ──
//
// Substitui o antigo badge "Aguardando" readonly. Quando o atleta sinaliza
// pagamento via /financials, o status vai pra awaiting_confirmation —
// aqui o coord pode confirmar direto (→ paid) ou rejeitar (→ pending).
// UI compacta porque vive dentro de uma célula de tabela.

function AwaitingConfirmActions({
  onConfirm, onReject, disabled,
}: {
  onConfirm: () => void
  onReject: () => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={onReject}
        disabled={disabled}
        className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-1 rounded-md border border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30"
        title="Rejeitar — atleta volta pra pendente"
      >
        <X className="h-2.5 w-2.5" />
        Rejeitar
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
        title="Confirmar — marca como pago"
      >
        <Check className="h-2.5 w-2.5" />
        Confirmar
      </button>
    </div>
  )
}
