'use server'

import { resolveTargetOrg, type TargetOrgOpts } from '@/lib/auth/resolve-org'

const DAY_MAP: Record<string, number> = {
  Domingo: 0,
  Segunda: 1,
  'Terça': 2,
  Quarta: 3,
  Quinta: 4,
  Sexta: 5,
  'Sábado': 6,
}

export async function ensureTrainingsForMonth(
  categoryId: string,
  daysOfWeek: string[],
  month: number,
  year: number,
  opts?: TargetOrgOpts,
) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  const weekdays = daysOfWeek.map((d) => DAY_MAP[d]).filter((d) => d !== undefined)

  const daysInMonth = new Date(year, month, 0).getDate()
  const dates: string[] = []

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d)
    if (weekdays.includes(date.getDay())) {
      const mm = String(month).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      dates.push(`${year}-${mm}-${dd}`)
    }
  }

  if (dates.length === 0) return

  const { data: existing } = await supabase
    .from('trainings')
    .select('date')
    .eq('category_id', categoryId)
    .eq('organization_id', orgId)
    .in('date', dates)

  const existingDates = new Set((existing ?? []).map((t) => t.date))
  const toInsert = dates.filter((d) => !existingDates.has(d))

  if (toInsert.length === 0) return

  await supabase.from('trainings').insert(
    toInsert.map((date) => ({
      category_id: categoryId,
      date,
      status: 'scheduled',
      organization_id: orgId,
    }))
  )
}

/**
 * Materializa todos os treinos do ano para uma categoria, baseado nos
 * `days_of_week` configurados. Idempotente: faz um único SELECT do ano inteiro,
 * descobre as datas faltantes e insere só essas em um único INSERT.
 *
 * Usado pelo dashboard operacional para que navegar para qualquer mês de um
 * ano (futuro ou retroativo dentro do ano corrente) já apresente os treinos
 * recorrentes implicados pela configuração da categoria.
 */
export async function ensureTrainingsForYear(
  categoryId: string,
  daysOfWeek: string[],
  year: number,
  opts?: TargetOrgOpts,
) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  const weekdays = daysOfWeek.map((d) => DAY_MAP[d]).filter((d) => d !== undefined)
  if (weekdays.length === 0) return

  const dates: string[] = []
  for (let m = 1; m <= 12; m++) {
    const daysInMonth = new Date(year, m, 0).getDate()
    const mm = String(m).padStart(2, '0')
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, m - 1, d)
      if (weekdays.includes(date.getDay())) {
        const dd = String(d).padStart(2, '0')
        dates.push(`${year}-${mm}-${dd}`)
      }
    }
  }

  if (dates.length === 0) return

  const { data: existing } = await supabase
    .from('trainings')
    .select('date')
    .eq('category_id', categoryId)
    .eq('organization_id', orgId)
    .gte('date', `${year}-01-01`)
    .lte('date', `${year}-12-31`)

  const existingDates = new Set((existing ?? []).map((t) => t.date))
  const toInsert = dates.filter((d) => !existingDates.has(d))

  if (toInsert.length === 0) return

  await supabase.from('trainings').insert(
    toInsert.map((date) => ({
      category_id: categoryId,
      date,
      status: 'scheduled',
      organization_id: orgId,
    })),
  )
}

export async function setAttendance(
  trainingId: string,
  memberId: string,
  status: 'present' | 'absent',
  opts?: TargetOrgOpts,
) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)

  // Ensure-then-update: primeiro tenta inserir com defaults (Faltou + Avulso +
  // pendente) respeitando o estado que o usuário efetivamente clicou (status).
  // `ignoreDuplicates: true` evita sobrescrever payment_type/payment_status
  // de uma row já existente — no segundo passo só atualizamos `status`.
  await supabase.from('member_attendances').upsert(
    {
      training_id: trainingId,
      member_id: memberId,
      status,
      payment_type: 'drop_in',
      payment_status: 'pending',
      organization_id: orgId,
    },
    { onConflict: 'training_id,member_id', ignoreDuplicates: true }
  )

  const { error } = await supabase
    .from('member_attendances')
    .update({ status })
    .eq('training_id', trainingId)
    .eq('member_id', memberId)
  if (error) throw new Error(error.message)
}

/**
 * Alterna o status do treino em si (não do atleta): 'scheduled' = houve
 * treino, 'cancelled' = feriado/sem treino. Usado pelo painel "Houve treino?"
 * no Gerenciador de Treinos — treinos cancelados são excluídos das contagens
 * de presença, das pendências de pagamento e dos relatórios financeiros.
 *
 * `reason` é opcional e só é considerado quando status='cancelled' (preserva
 * o motivo pra relatórios futuros: "feriado X", "quadra interditada", etc.).
 * Ao reativar (status='scheduled'), o motivo é limpo automaticamente.
 */
export async function setTrainingStatus(
  trainingId: string,
  status: 'scheduled' | 'cancelled',
  reason?: string | null,
  opts?: TargetOrgOpts,
) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  const payload: { status: string; cancellation_reason: string | null } = {
    status,
    cancellation_reason: status === 'cancelled' ? (reason?.trim() || null) : null,
  }
  const { error } = await supabase
    .from('trainings')
    .update(payload)
    .eq('id', trainingId)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
}

export async function setMonthlyPayer(
  memberId: string,
  categoryId: string,
  month: number,
  year: number,
  isMonthlyPayer: boolean,
  opts?: TargetOrgOpts,
) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  const { error } = await supabase.from('monthly_payments').upsert(
    {
      member_id: memberId,
      category_id: categoryId,
      month,
      year,
      is_monthly_payer: isMonthlyPayer,
      payment_status: isMonthlyPayer ? 'pending' : null,
      organization_id: orgId,
    },
    { onConflict: 'member_id,category_id,month,year' }
  )
  if (error) throw new Error(error.message)

  // Propaga pros attendances do mês:
  //   • MARCA mensalista (true) → todo treino do mês do atleta vira
  //     `type='monthly'` + `status='pending'`, sobrescrevendo inclusive
  //     drop_in 'paid'/'no_payment' anteriores (owner: "pagamento fica
  //     pendente até trocar pra pago ou isento"). Intencional resetar:
  //     a cobrança passa a ser agregada na mensalidade, não por treino.
  //   • DESMARCA mensalista (false) → converte SÓ as rows que estavam
  //     `type='monthly'` de volta pra `drop_in` + `pending`. Preserva
  //     edits anteriores de drop_in/outros tipos.
  const mm = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  const startDate = `${year}-${mm}-01`
  const endDate = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`

  const { data: monthTrainings } = await supabase
    .from('trainings')
    .select('id')
    .eq('category_id', categoryId)
    .eq('organization_id', orgId)
    .gte('date', startDate)
    .lte('date', endDate)

  const trainingIds = (monthTrainings ?? []).map((t) => t.id)
  if (trainingIds.length > 0) {
    if (isMonthlyPayer) {
      await supabase
        .from('member_attendances')
        .update({ payment_type: 'monthly', payment_status: 'pending' })
        .in('training_id', trainingIds)
        .eq('member_id', memberId)
    } else {
      await supabase
        .from('member_attendances')
        .update({ payment_type: 'drop_in', payment_status: 'pending' })
        .in('training_id', trainingIds)
        .eq('member_id', memberId)
        .eq('payment_type', 'monthly')
    }
  }
}

export async function setPaymentStatus(
  memberId: string,
  categoryId: string,
  month: number,
  year: number,
  paymentStatus: 'pending' | 'paid' | 'refunded',
  opts?: TargetOrgOpts,
) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  const { error } = await supabase.from('monthly_payments').upsert(
    {
      member_id: memberId,
      category_id: categoryId,
      month,
      year,
      is_monthly_payer: true,
      payment_status: paymentStatus,
      organization_id: orgId,
    },
    { onConflict: 'member_id,category_id,month,year' }
  )
  if (error) throw new Error(error.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPER
// ─────────────────────────────────────────────────────────────────────────────
async function applyPaymentTypeToRange(
  memberId: string,
  categoryId: string,
  startDate: string,
  endDate: string,
  paymentType: string,
  opts?: TargetOrgOpts,
) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)

  console.log(`[applyPaymentTypeToRange] START paymentType=${paymentType} member=${memberId} category=${categoryId} range=${startDate}→${endDate}`)

  // 1. Fetch category to know its training days
  const { data: cat, error: catError } = await supabase
    .from('categories')
    .select('days_of_week')
    .eq('id', categoryId)
    .eq('organization_id', orgId)
    .single()

  if (catError || !cat) {
    console.error(`[applyPaymentTypeToRange] Could not fetch category: `, catError)
    return
  }

  // 2. Ensure training rows exist for every month in the range
  const sy = parseInt(startDate.slice(0, 4), 10)
  const sm = parseInt(startDate.slice(5, 7), 10)
  const ey = parseInt(endDate.slice(0, 4), 10)
  const em = parseInt(endDate.slice(5, 7), 10)

  let cy = sy, cm = sm
  while (cy < ey || (cy === ey && cm <= em)) {
    console.log(`[applyPaymentTypeToRange] ensureTrainings month=${cy}-${String(cm).padStart(2, '0')}`)
    await ensureTrainingsForMonth(categoryId, cat.days_of_week, cm, cy, opts)
    cm++
    if (cm > 12) { cm = 1; cy++ }
  }

  // 3. Fetch all training IDs in the date range
  //    Exclui `cancelled` (feriados / dias sem treino) — esses dias não
  //    entram no pagamento do atleta.
  const { data: trainings, error: trainingsError } = await supabase
    .from('trainings')
    .select('id')
    .eq('category_id', categoryId)
    .eq('organization_id', orgId)
    .gte('date', startDate)
    .lte('date', endDate)
    .neq('status', 'cancelled')

  if (trainingsError) {
    console.error(`[applyPaymentTypeToRange] Error fetching trainings: `, trainingsError)
    return
  }

  console.log(`[applyPaymentTypeToRange] Found ${trainings?.length ?? 0} training(s) in range`)

  if (!trainings?.length) return
  const trainingIds = trainings.map((t) => t.id)

  // 4. Find which training IDs already have an attendance record for this member
  const { data: existing, error: existingError } = await supabase
    .from('member_attendances')
    .select('training_id')
    .in('training_id', trainingIds)
    .eq('member_id', memberId)

  if (existingError) {
    console.error(`[applyPaymentTypeToRange] Error fetching existing attendances: `, existingError)
    return
  }

  const existingSet = new Set((existing ?? []).map((a) => a.training_id))
  const toInsert = trainingIds.filter((id) => !existingSet.has(id))

  console.log(`[applyPaymentTypeToRange] Inserting ${toInsert.length} new record(s), updating ${existingSet.size} existing`)

  // 5. Insert new attendance records
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from('member_attendances').insert(
      toInsert.map((id) => ({
        training_id: id,
        member_id: memberId,
        status: 'absent',
        payment_type: paymentType,
        payment_status: 'pending',
        organization_id: orgId,
      }))
    )
    if (insertError) console.error(`[applyPaymentTypeToRange] Insert error: `, insertError)
  }

  // 6. Update payment fields on ALL records
  if (trainingIds.length > 0) {
    const { error: updateError } = await supabase
      .from('member_attendances')
      .update({ payment_type: paymentType, payment_status: 'pending' })
      .in('training_id', trainingIds)
      .eq('member_id', memberId)
    if (updateError) console.error(`[applyPaymentTypeToRange] Update error: `, updateError)
  }

  console.log(`[applyPaymentTypeToRange] DONE paymentType=${paymentType} range=${startDate}→${endDate}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function setBulkPaymentType(
  memberId: string,
  categoryId: string,
  trainingDate: string,
  paymentType: string,
  _trainingId?: string,
  opts?: TargetOrgOpts,
) {
  console.log(`[setBulkPaymentType] paymentType=${paymentType} trainingDate=${trainingDate}`)

  const date = new Date(trainingDate + 'T00:00:00')
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  let startDate: string
  let endDate: string

  if (paymentType === 'drop_in' || paymentType === 'monthly') {
    const mm = String(month).padStart(2, '0')
    const lastDay = new Date(year, month, 0).getDate()
    startDate = `${year}-${mm}-01`
    endDate   = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
  } else if (paymentType === 'weekly') {
    const dow = date.getDay()
    const monday = new Date(date)
    monday.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    startDate = monday.toISOString().split('T')[0]
    endDate   = sunday.toISOString().split('T')[0]
  } else if (paymentType === 'semiannual') {
    startDate = month <= 6 ? `${year}-01-01` : `${year}-07-01`
    endDate   = month <= 6 ? `${year}-06-30` : `${year}-12-31`
  } else if (paymentType === 'annual') {
    startDate = `${year}-01-01`
    endDate   = `${year}-12-31`
  } else {
    console.log(`[setBulkPaymentType] Unknown paymentType "${paymentType}" — aborting`)
    return
  }

  console.log(`[setBulkPaymentType] Computed range: ${startDate} → ${endDate}`)
  await applyPaymentTypeToRange(memberId, categoryId, startDate, endDate, paymentType, opts)
}

export async function setBulkPaymentTypeInRange(
  memberId: string,
  categoryId: string,
  startDate: string,
  endDate: string,
  paymentType: string,
  opts?: TargetOrgOpts,
) {
  console.log(`[setBulkPaymentTypeInRange] paymentType=${paymentType} range=${startDate}→${endDate}`)
  await applyPaymentTypeToRange(memberId, categoryId, startDate, endDate, paymentType, opts)
}

export async function setBulkPaymentTypeForRemainingYear(
  memberId: string,
  categoryId: string,
  fromMonth: number,
  year: number,
  paymentType: string,
  opts?: TargetOrgOpts,
) {
  const startMonth = fromMonth + 1
  if (startMonth > 12) {
    console.log(`[setBulkPaymentTypeForRemainingYear] fromMonth=${fromMonth} — already December, nothing to do`)
    return
  }

  const startDate = `${year}-${String(startMonth).padStart(2, '0')}-01`
  const endDate   = `${year}-12-31`

  console.log(`[setBulkPaymentTypeForRemainingYear] paymentType=${paymentType} range=${startDate}→${endDate}`)
  await applyPaymentTypeToRange(memberId, categoryId, startDate, endDate, paymentType, opts)
}

export async function setTrainingPayment(
  trainingId: string,
  memberId: string,
  paymentType: string | null,
  paymentStatus: 'pending' | 'paid' | 'no_payment' | 'refunded' | 'exempt',
  opts?: TargetOrgOpts,
) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  await supabase.from('member_attendances').upsert(
    {
      training_id: trainingId,
      member_id: memberId,
      status: 'absent',
      organization_id: orgId,
    },
    { onConflict: 'training_id,member_id', ignoreDuplicates: true }
  )
  const { error } = await supabase
    .from('member_attendances')
    .update({ payment_type: paymentType, payment_status: paymentStatus })
    .eq('training_id', trainingId)
    .eq('member_id', memberId)
  if (error) throw new Error(error.message)
}

export async function setBulkPaymentStatus(
  memberId: string,
  categoryId: string,
  trainingId: string,
  trainingDate: string,
  paymentType: string,
  paymentStatus: 'pending' | 'paid' | 'no_payment' | 'refunded' | 'exempt',
  opts?: TargetOrgOpts,
  /**
   * Observação opcional gravada em `payment_note`. Usada principalmente pra
   * status 'exempt' (coord escreve a justificativa no dialog) e 'refunded'
   * (motivo do estorno). Não tem efeito em pending/paid do fluxo bulk mensal.
   */
  note?: string | null,
) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)

  console.log(`[setBulkPaymentStatus] paymentType=${paymentType} paymentStatus=${paymentStatus} trainingDate=${trainingDate}`)

  // Status excepcionais ("Sem Pagamento" / "Estornado" / "Isento"): sempre
  // single-training. Não faz sentido espalhar no mês inteiro — são casos por
  // dia específico (convidado, cortesia, estorno pontual, isenção). Preserva
  // o payment_type existente pra não destruir a configuração bulk
  // (ex.: mensalista que teve 1 dia cortesia continua mensalista nos outros).
  if (paymentStatus === 'no_payment' || paymentStatus === 'refunded' || paymentStatus === 'exempt') {
    await supabase.from('member_attendances').upsert(
      {
        training_id: trainingId,
        member_id: memberId,
        status: 'absent',
        organization_id: orgId,
      },
      { onConflict: 'training_id,member_id', ignoreDuplicates: true }
    )
    const normalizedNote = (note ?? '').trim().slice(0, 500)
    // Patch: inclui payment_note quando fornecido. Pra 'exempt' o coord
    // pode escrever a justificativa ("lesionado", "convidado", etc);
    // pra 'refunded' escreve motivo do estorno. Vazio limpa a nota.
    const patch: Record<string, unknown> = { payment_status: paymentStatus }
    if (note !== undefined) {
      patch.payment_note = normalizedNote.length > 0 ? normalizedNote : null
    }
    const { error } = await supabase
      .from('member_attendances')
      .update(patch)
      .eq('training_id', trainingId)
      .eq('member_id', memberId)
    if (error) throw new Error(error.message)
    console.log(`[setBulkPaymentStatus] DONE (${paymentStatus} — single training)`)
    return
  }

  // Avulso: apenas este treino. Primeiro garante a row (ignora se já existe)
  // para suportar o caso em que o atleta ainda não tinha attendance — o default
  // visual "Faltou + Avulso" já era pendente, então clicar Pago/Pendente aqui
  // cria a row com esses defaults + o payment_status escolhido.
  if (paymentType === 'drop_in') {
    await supabase.from('member_attendances').upsert(
      {
        training_id: trainingId,
        member_id: memberId,
        status: 'absent',
        payment_type: 'drop_in',
        organization_id: orgId,
      },
      { onConflict: 'training_id,member_id', ignoreDuplicates: true }
    )
    const { error } = await supabase
      .from('member_attendances')
      .update({ payment_status: paymentStatus })
      .eq('training_id', trainingId)
      .eq('member_id', memberId)
    if (error) throw new Error(error.message)
    console.log(`[setBulkPaymentStatus] DONE (drop_in — single training)`)
    return
  }

  const date = new Date(trainingDate + 'T00:00:00')
  const year = date.getFullYear()
  const month = date.getMonth() + 1

  let startDate: string
  let endDate: string

  if (paymentType === 'weekly') {
    const dow = date.getDay()
    const monday = new Date(date)
    monday.setDate(date.getDate() - (dow === 0 ? 6 : dow - 1))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    startDate = monday.toISOString().split('T')[0]
    endDate   = sunday.toISOString().split('T')[0]
  } else if (paymentType === 'monthly') {
    const mm = String(month).padStart(2, '0')
    const lastDay = new Date(year, month, 0).getDate()
    startDate = `${year}-${mm}-01`
    endDate   = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`
  } else if (paymentType === 'semiannual') {
    startDate = month <= 6 ? `${year}-01-01` : `${year}-07-01`
    endDate   = month <= 6 ? `${year}-06-30` : `${year}-12-31`
  } else if (paymentType === 'annual') {
    startDate = `${year}-01-01`
    endDate   = `${year}-12-31`
  } else {
    console.log(`[setBulkPaymentStatus] Unknown paymentType "${paymentType}" — aborting`)
    return
  }

  console.log(`[setBulkPaymentStatus] Computed range: ${startDate} → ${endDate}`)

  const { data: rangeTrainings, error: fetchError } = await supabase
    .from('trainings')
    .select('id')
    .eq('category_id', categoryId)
    .eq('organization_id', orgId)
    .gte('date', startDate)
    .lte('date', endDate)
    .neq('status', 'cancelled')

  if (fetchError) {
    console.error(`[setBulkPaymentStatus] Fetch error: `, fetchError)
    return
  }

  console.log(`[setBulkPaymentStatus] Found ${rangeTrainings?.length ?? 0} training(s) in range`)

  if (!rangeTrainings?.length) return
  const trainingIds = rangeTrainings.map((t) => t.id)

  const { error } = await supabase
    .from('member_attendances')
    .update({ payment_status: paymentStatus })
    .in('training_id', trainingIds)
    .eq('member_id', memberId)
  if (error) throw new Error(error.message)

  console.log(`[setBulkPaymentStatus] DONE updated ${trainingIds.length} record(s)`)
}
