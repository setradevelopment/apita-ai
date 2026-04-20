'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionContext } from '@/lib/auth/session'

// ── Tipos ──────────────────────────────────────────────────────────────

/**
 * Item agregado que o atleta vê na tela dele. Pode ser:
 *   - `kind: 'training'` → attendance de um treino específico (com data)
 *   - `kind: 'monthly'`  → monthly_payment (mês inteiro, sem data específica)
 */
export type MyPayment =
  | {
      kind: 'training'
      id: string // attendance id
      category_id: string
      category_name: string
      category_logo_url: string | null
      training_id: string
      training_date: string
      payment_type: string
      payment_status: 'pending' | 'awaiting_confirmation' | 'paid' | 'no_payment' | 'refunded'
      /** Presença do atleta NAQUELE treino (se o coord já registrou). */
      attendance_status: 'present' | 'absent' | null
      amount: number // calculado em runtime
    }
  | {
      kind: 'monthly'
      id: string // monthly_payment id
      category_id: string
      category_name: string
      category_logo_url: string | null
      month: number
      year: number
      payment_status: 'pending' | 'awaiting_confirmation' | 'paid' | 'refunded'
      amount: number
    }

export interface PendingConfirmation {
  kind: 'training' | 'monthly'
  id: string
  member_id: string
  member_name: string
  category_name: string
  amount: number
  /** Pra training: data do treino. Pra monthly: "MM/YYYY". */
  reference_label: string
  marked_at: string | null
  /**
   * Observação que o atleta escreveu ao marcar como pago (ex: "PIX via
   * conta X", "paguei segunda"). `null` quando o atleta não escreveu nada.
   */
  note: string | null
}

// ── Leitura (atleta) ───────────────────────────────────────────────────

/**
 * Lista todos os pagamentos do atleta logado (próprio `auth.uid()`).
 * Inclui tanto treinos (attendances) quanto mensalidades (monthly_payments).
 *
 * Ordena por data desc (treinos mais recentes primeiro), com treinos antes
 * de monthlies dentro do mesmo mês — o atleta normalmente quer ver o que
 * tem mais recente ou o que está pendente.
 *
 * Filtra `payment_status IN ('no_payment', 'refunded')` por default — esses
 * status significam "não precisa pagar" ou "foi estornado", não interessam
 * pro atleta. Se precisar mostrar histórico completo depois, adiciona flag.
 */
export async function listMyPayments(): Promise<MyPayment[]> {
  const ctx = await getSessionContext()
  if (!ctx.orgId) return []

  const admin = createAdminClient()

  // Descobre os member IDs do atleta (pode ter mais de 1 row em `members` se
  // estiver em múltiplas orgs no futuro, mas por ora é 1 por org).
  const { data: myMembers } = await admin
    .from('members')
    .select('id')
    .eq('user_id', ctx.user.id)
    .eq('organization_id', ctx.orgId)

  const memberIds = (myMembers ?? []).map((m) => m.id)
  if (memberIds.length === 0) return []

  // Categorias da org pra pegar nome + logo + preço
  const { data: cats } = await admin
    .from('categories')
    .select('id, name, logo_url, price_drop_in, price_weekly, price_monthly, price_semiannual, price_annual')
    .eq('organization_id', ctx.orgId)

  type CatRow = NonNullable<typeof cats>[number]
  const catById = new Map<string, CatRow>()
  for (const c of cats ?? []) catById.set(c.id, c)

  // Attendances dos meus members
  const { data: attendances } = await admin
    .from('member_attendances')
    .select(`
      id, payment_type, payment_status, status,
      trainings:training_id(id, date, category_id)
    `)
    .in('member_id', memberIds)
    .not('payment_status', 'is', null)

  // Monthly payments dos meus members
  const { data: monthlies } = await admin
    .from('monthly_payments')
    .select('id, category_id, month, year, payment_status, is_monthly_payer')
    .in('member_id', memberIds)

  const items: MyPayment[] = []

  type AttRow = {
    id: string
    payment_type: string | null
    payment_status: string | null
    status: string | null
    trainings: { id: string; date: string; category_id: string } | null
  }
  for (const a of (attendances ?? []) as unknown as AttRow[]) {
    if (!a.trainings) continue
    const status = a.payment_status
    // "no_payment" não aparece (é estado "não se aplica"), mas "refunded"
    // SIM — o atleta precisa saber que tem dinheiro a receber do clube.
    if (!status || status === 'no_payment') continue
    // Monthly fica representado no monthly_payments; evita double-listing
    if (a.payment_type === 'monthly') continue

    const cat = catById.get(a.trainings.category_id)
    if (!cat) continue
    const priceField = `price_${a.payment_type ?? 'drop_in'}` as keyof CatRow
    const priceVal = cat[priceField] as unknown as number | string | null
    const amount = typeof priceVal === 'string' ? parseFloat(priceVal) : Number(priceVal ?? 0)

    items.push({
      kind: 'training',
      id: a.id,
      category_id: a.trainings.category_id,
      category_name: cat.name,
      category_logo_url: (cat as { logo_url?: string | null }).logo_url ?? null,
      training_id: a.trainings.id,
      training_date: a.trainings.date,
      payment_type: a.payment_type ?? 'drop_in',
      payment_status: status as Extract<MyPayment, { kind: 'training' }>['payment_status'],
      attendance_status:
        a.status === 'present' ? 'present' :
        a.status === 'absent' ? 'absent' : null,
      amount,
    })
  }

  type MonthlyRow = {
    id: string
    category_id: string
    month: number
    year: number
    payment_status: string | null
    is_monthly_payer: boolean | null
  }
  for (const m of (monthlies ?? []) as MonthlyRow[]) {
    // Só mostra se o atleta é monthly payer naquele mês — senão é só row
    // fantasma que o sistema cria pra tracking.
    if (!m.is_monthly_payer) continue
    const status = m.payment_status
    if (!status || status === 'refunded') continue

    const cat = catById.get(m.category_id)
    if (!cat) continue
    const priceVal = cat.price_monthly as unknown as number | string | null
    const amount = typeof priceVal === 'string' ? parseFloat(priceVal) : Number(priceVal ?? 0)

    items.push({
      kind: 'monthly',
      id: m.id,
      category_id: m.category_id,
      category_name: cat.name,
      category_logo_url: (cat as { logo_url?: string | null }).logo_url ?? null,
      month: m.month,
      year: m.year,
      payment_status: status as 'pending' | 'awaiting_confirmation' | 'paid' | 'refunded',
      amount,
    })
  }

  // Ordenação: mais recentes primeiro. Treinos usam date; monthlies usam
  // year-month (dia 01 como proxy).
  items.sort((a, b) => {
    const dateA = a.kind === 'training' ? a.training_date : `${a.year}-${String(a.month).padStart(2, '0')}-01`
    const dateB = b.kind === 'training' ? b.training_date : `${b.year}-${String(b.month).padStart(2, '0')}-01`
    return dateB.localeCompare(dateA)
  })

  return items
}

// ── Mutação (atleta marca como pago) ───────────────────────────────────

/**
 * Atleta marca o próprio pagamento como "paguei" (vira awaiting_confirmation).
 * Aceita uma `note` opcional — observação que o atleta escreve no dialog
 * (ex: "paguei via PIX", "depositei segunda"). A note aparece pro coord
 * na lista de confirmações pendentes, ajudando a validar.
 *
 * Só passa de `pending` → `awaiting_confirmation`. Outras transições são
 * bloqueadas (e.g. atleta não pode marcar diretamente como 'paid' — isso
 * é privilégio do coord/admin).
 *
 * Gate duplo: RLS policy na migration 030 + validação na action.
 */
export async function markAsPaid(input: {
  kind: 'training' | 'monthly'
  id: string
  /** Texto livre (< 500 chars). Opcional. `null`/vazio = sem observação. */
  note?: string
}): Promise<void> {
  const ctx = await getSessionContext()
  if (ctx.role !== 'member') {
    throw new Error('Apenas atletas podem marcar o próprio pagamento.')
  }
  if (!ctx.orgId) throw new Error('Organização não definida.')

  const admin = createAdminClient()

  // Verifica ownership: a row tem que ser de um member que é o user atual
  const table = input.kind === 'training' ? 'member_attendances' : 'monthly_payments'
  const { data: row } = await admin
    .from(table)
    .select('id, member_id, payment_status, organization_id')
    .eq('id', input.id)
    .single()

  if (!row || row.organization_id !== ctx.orgId) {
    throw new Error('Pagamento não encontrado.')
  }

  const { data: member } = await admin
    .from('members')
    .select('user_id')
    .eq('id', row.member_id)
    .single()

  if (!member || member.user_id !== ctx.user.id) {
    throw new Error('Você não pode alterar um pagamento que não é seu.')
  }

  if (row.payment_status !== 'pending') {
    throw new Error('Este pagamento não está pendente.')
  }

  // Normaliza note: trim + cap em 500 chars pra evitar abuso. Vazio vira
  // null pra ficar semanticamente claro ("sem observação") em vez de "".
  const trimmedNote = (input.note ?? '').trim().slice(0, 500)
  const noteValue = trimmedNote.length > 0 ? trimmedNote : null

  const { error } = await admin
    .from(table)
    .update({
      payment_status: 'awaiting_confirmation',
      payment_note: noteValue,
    })
    .eq('id', input.id)
  if (error) throw new Error(error.message)

  revalidatePath('/financials')
  revalidatePath('/')
}

// ── Coord: lista e confirma/rejeita ────────────────────────────────────

/**
 * Lista TODOS os pagamentos com `payment_status='awaiting_confirmation'` na org.
 * Usado por:
 *   • Aba "Confirmações Pendentes" em /financials (contratante/coord)
 *   • Sino unificado no header (conta + lista curta)
 */
export async function listPendingConfirmations(): Promise<PendingConfirmation[]> {
  const ctx = await getSessionContext()
  if (!ctx.orgId) return []
  if (ctx.role !== 'admin' && ctx.role !== 'coordinator') return []

  const admin = createAdminClient()

  // Attendances aguardando confirmação
  const { data: attendances } = await admin
    .from('member_attendances')
    .select(`
      id, member_id, payment_type, payment_note,
      trainings:training_id(date, category_id),
      members:member_id(name),
      updated_at
    `)
    .eq('organization_id', ctx.orgId)
    .eq('payment_status', 'awaiting_confirmation')

  const { data: monthlies } = await admin
    .from('monthly_payments')
    .select(`
      id, member_id, month, year, category_id, payment_note,
      members:member_id(name),
      updated_at
    `)
    .eq('organization_id', ctx.orgId)
    .eq('payment_status', 'awaiting_confirmation')

  // Categorias pra resolver nomes + preços
  const { data: cats } = await admin
    .from('categories')
    .select('id, name, price_drop_in, price_weekly, price_monthly, price_semiannual, price_annual')
    .eq('organization_id', ctx.orgId)

  type CatRow = NonNullable<typeof cats>[number]
  const catById = new Map<string, CatRow>()
  for (const c of cats ?? []) catById.set(c.id, c)

  const result: PendingConfirmation[] = []

  type AttRow = {
    id: string
    member_id: string
    payment_type: string | null
    payment_note: string | null
    trainings: { date: string; category_id: string } | null
    members: { name: string } | null
    updated_at: string | null
  }
  for (const a of (attendances ?? []) as unknown as AttRow[]) {
    if (!a.trainings) continue
    const cat = catById.get(a.trainings.category_id)
    if (!cat) continue

    const priceField = `price_${a.payment_type ?? 'drop_in'}` as keyof CatRow
    const priceVal = cat[priceField] as unknown as number | string | null
    const amount = typeof priceVal === 'string' ? parseFloat(priceVal) : Number(priceVal ?? 0)

    result.push({
      kind: 'training',
      id: a.id,
      member_id: a.member_id,
      member_name: a.members?.name ?? '—',
      category_name: cat.name,
      amount,
      reference_label: formatBRDate(a.trainings.date),
      marked_at: a.updated_at,
      note: a.payment_note,
    })
  }

  type MonthlyRow = {
    id: string
    member_id: string
    month: number
    year: number
    category_id: string
    payment_note: string | null
    members: { name: string } | null
    updated_at: string | null
  }
  for (const m of (monthlies ?? []) as unknown as MonthlyRow[]) {
    const cat = catById.get(m.category_id)
    if (!cat) continue
    const priceVal = cat.price_monthly as unknown as number | string | null
    const amount = typeof priceVal === 'string' ? parseFloat(priceVal) : Number(priceVal ?? 0)

    result.push({
      kind: 'monthly',
      id: m.id,
      member_id: m.member_id,
      member_name: m.members?.name ?? '—',
      category_name: cat.name,
      amount,
      reference_label: `${String(m.month).padStart(2, '0')}/${m.year}`,
      marked_at: m.updated_at,
      note: m.payment_note,
    })
  }

  // Ordena por `marked_at` (atleta que marcou há mais tempo primeiro)
  result.sort((a, b) => {
    const aT = a.marked_at ? new Date(a.marked_at).getTime() : 0
    const bT = b.marked_at ? new Date(b.marked_at).getTime() : 0
    return aT - bT
  })

  return result
}

/**
 * Conta quantos pagamentos estão aguardando confirmação. Usado pelo sino.
 */
export async function countPendingConfirmations(): Promise<number> {
  const ctx = await getSessionContext().catch(() => null)
  if (!ctx?.orgId) return 0
  if (ctx.role !== 'admin' && ctx.role !== 'coordinator') return 0

  const admin = createAdminClient()

  const [attRes, monthRes] = await Promise.all([
    admin
      .from('member_attendances')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)
      .eq('payment_status', 'awaiting_confirmation'),
    admin
      .from('monthly_payments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', ctx.orgId)
      .eq('payment_status', 'awaiting_confirmation'),
  ])

  return (attRes.count ?? 0) + (monthRes.count ?? 0)
}

/**
 * Coord confirma o pagamento (awaiting_confirmation → paid). Idempotente.
 */
export async function confirmPayment(input: {
  kind: 'training' | 'monthly'
  id: string
}): Promise<void> {
  const ctx = await getSessionContext()
  if (ctx.role !== 'admin' && ctx.role !== 'coordinator') {
    throw new Error('Apenas contratante ou coordenador pode confirmar pagamentos.')
  }
  if (!ctx.orgId) throw new Error('Organização não definida.')

  const admin = createAdminClient()
  const table = input.kind === 'training' ? 'member_attendances' : 'monthly_payments'
  const { error } = await admin
    .from(table)
    .update({ payment_status: 'paid' })
    .eq('id', input.id)
    .eq('organization_id', ctx.orgId)
    .eq('payment_status', 'awaiting_confirmation')
  if (error) throw new Error(error.message)

  revalidatePath('/financials')
  revalidatePath('/')
}

/**
 * Coord rejeita o pagamento — volta pra 'pending'. Atleta vai ver o status
 * voltar e pode marcar de novo (se de fato pagou e só houve desencontro).
 *
 * Limpa `payment_note` ao rejeitar — a nota estava vinculada àquela
 * tentativa de pagamento. Se o atleta marcar de novo, escreve uma nota
 * nova (possivelmente esclarecendo).
 */
export async function rejectPayment(input: {
  kind: 'training' | 'monthly'
  id: string
}): Promise<void> {
  const ctx = await getSessionContext()
  if (ctx.role !== 'admin' && ctx.role !== 'coordinator') {
    throw new Error('Apenas contratante ou coordenador pode rejeitar pagamentos.')
  }
  if (!ctx.orgId) throw new Error('Organização não definida.')

  const admin = createAdminClient()
  const table = input.kind === 'training' ? 'member_attendances' : 'monthly_payments'
  const { error } = await admin
    .from(table)
    .update({ payment_status: 'pending', payment_note: null })
    .eq('id', input.id)
    .eq('organization_id', ctx.orgId)
    .eq('payment_status', 'awaiting_confirmation')
  if (error) throw new Error(error.message)

  revalidatePath('/financials')
  revalidatePath('/')
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatBRDate(iso: string): string {
  const str = iso.length === 10 ? iso + 'T00:00:00' : iso
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR')
}
