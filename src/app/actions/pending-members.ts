'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionContext } from '@/lib/auth/session'

// ── Tipos ──────────────────────────────────────────────────────────────

export interface PendingMember {
  id: string
  name: string
  email: string | null
  dob: string | null
  cpf: string | null
  rg: string | null
  created_at: string
  origin_neighborhood: string | null
  destination_neighborhood: string | null
}

export interface ApproveMemberInput {
  memberId: string
  /** Pelo menos 1. Cada id deve pertencer à mesma org do member. */
  categoryIds: string[]
  /**
   * Posições por categoria. Chave = categoryId, valor = array de positionIds.
   * Regra: se a categoria TEM posições cadastradas na org, ao menos 1 é
   * obrigatória. Se a categoria NÃO tem posições, pode mandar array vazio.
   */
  categoryPositions: Record<string, string[]>
}

// ── Helpers internos ───────────────────────────────────────────────────

/**
 * Garante que o user atual é admin ou coordinator da org. Super_admin não
 * pode aprovar (ele nem tem org — opera via drilldown, fora deste fluxo).
 */
async function requireApprover() {
  const ctx = await getSessionContext()
  if (!ctx.orgId) throw new Error('Organização não definida.')
  if (ctx.role !== 'admin' && ctx.role !== 'coordinator') {
    throw new Error('Apenas contratante ou coordenador pode aprovar cadastros.')
  }
  return ctx
}

// ── Queries (read) ─────────────────────────────────────────────────────

/**
 * Conta atletas pendentes da org. Usado no sino do header (badge) e no
 * item condicional do sidebar. Retorna 0 se user não é admin/coord.
 */
export async function countPendingMembers(): Promise<number> {
  const ctx = await getSessionContext().catch(() => null)
  if (!ctx?.orgId) return 0
  if (ctx.role !== 'admin' && ctx.role !== 'coordinator') return 0

  const admin = createAdminClient()
  const { count } = await admin
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.orgId)
    .is('approved_at', null)
  return count ?? 0
}

/**
 * Lista atletas pendentes da org com info básica + e-mail do auth.user.
 * Ordem: mais antigos primeiro (created_at asc) — prioriza quem espera há
 * mais tempo. Resultados incluem e-mail (lookup via admin.auth.listUsers).
 */
export async function listPendingMembers(): Promise<PendingMember[]> {
  const ctx = await requireApprover()

  const admin = createAdminClient()
  const { data: members } = await admin
    .from('members')
    .select('id, user_id, name, dob, cpf, rg, created_at, origin_neighborhood, destination_neighborhood')
    .eq('organization_id', ctx.orgId!)
    .is('approved_at', null)
    .order('created_at', { ascending: true })

  if (!members || members.length === 0) return []

  // Resolve e-mails pros user_ids. `auth.admin.listUsers` pagina — 1000 é
  // o cap. Na prática uma org não vai ter > 1000 PENDENTES simultaneamente.
  const userIds = members.map((m) => m.user_id).filter(Boolean) as string[]
  const emailByUser = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const userSet = new Set(userIds)
    for (const u of authList?.users ?? []) {
      if (userSet.has(u.id) && u.email) emailByUser.set(u.id, u.email)
    }
  }

  return members.map((m) => ({
    id: m.id,
    name: m.name,
    email: m.user_id ? emailByUser.get(m.user_id) ?? null : null,
    dob: m.dob,
    cpf: m.cpf,
    rg: m.rg,
    created_at: m.created_at,
    origin_neighborhood: m.origin_neighborhood,
    destination_neighborhood: m.destination_neighborhood,
  }))
}

// ── Mutations ──────────────────────────────────────────────────────────

/**
 * Aprova um atleta pendente e vincula categorias/posições.
 *
 * Validações:
 *   1. Member pertence à org do user atual.
 *   2. Pelo menos 1 categoria selecionada.
 *   3. Cada categoria selecionada: se TEM posições cadastradas na org, pelo
 *      menos 1 posição é obrigatória. Se não tem, array vazio é OK.
 *
 * Efeitos:
 *   1. `UPDATE members SET approved_at = now()`
 *   2. `INSERT INTO member_categories` para cada categoria
 *   3. `INSERT INTO member_category_positions` para cada (categoria, posição)
 *
 * Todos os efeitos rodam em sequência via admin client. Se algum falhar,
 * retornamos erro mas os já aplicados ficam — o coord pode re-executar com
 * estado parcial sem quebrar (UPDATE idempotente, INSERTs com unique index
 * no schema já protegem duplicata).
 */
export async function approveMember(input: ApproveMemberInput): Promise<void> {
  const ctx = await requireApprover()
  const admin = createAdminClient()

  // 1. Member existe e é da minha org + está realmente pendente
  const { data: member } = await admin
    .from('members')
    .select('id, organization_id, approved_at')
    .eq('id', input.memberId)
    .single()

  if (!member) throw new Error('Atleta não encontrado.')
  if (member.organization_id !== ctx.orgId) {
    throw new Error('Atleta não pertence à sua organização.')
  }
  if (member.approved_at) {
    throw new Error('Este atleta já foi aprovado.')
  }

  // 2. Categorias obrigatórias
  const categoryIds = input.categoryIds.filter(Boolean)
  if (categoryIds.length === 0) {
    throw new Error('Selecione pelo menos uma categoria.')
  }

  // 3. Categorias existem na org
  const { data: cats } = await admin
    .from('categories')
    .select('id, name')
    .eq('organization_id', ctx.orgId!)
    .in('id', categoryIds)

  if (!cats || cats.length !== categoryIds.length) {
    throw new Error('Alguma categoria selecionada não existe na sua organização.')
  }

  // 4. Posições obrigatórias quando a categoria TEM posições cadastradas.
  //    Busca posições da org pra saber quais categorias têm posições configuradas.
  //    Hoje posições são globais da org (não atreladas a categoria em schema);
  //    então "tem posições" = org tem >=1 position cadastrada.
  const { count: positionCount } = await admin
    .from('positions')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.orgId!)

  const orgHasPositions = (positionCount ?? 0) > 0

  if (orgHasPositions) {
    for (const catId of categoryIds) {
      const positions = input.categoryPositions[catId] ?? []
      if (positions.length === 0) {
        const catName = cats.find((c) => c.id === catId)?.name ?? 'categoria'
        throw new Error(`Selecione pelo menos uma posição para ${catName}.`)
      }
    }
  }

  // 5. Stampa approved_at — atleta deixa de ser pendente
  const { error: updateError } = await admin
    .from('members')
    .update({ approved_at: new Date().toISOString() })
    .eq('id', input.memberId)
  if (updateError) throw new Error(updateError.message)

  // 6. Insere member_categories (N rows, uma por categoria)
  const categoryRows = categoryIds.map((categoryId) => ({
    member_id: input.memberId,
    category_id: categoryId,
    organization_id: ctx.orgId!,
  }))
  const { error: mcError } = await admin
    .from('member_categories')
    .insert(categoryRows)
  if (mcError) throw new Error(mcError.message)

  // 7. Insere member_category_positions (N*M rows, flatten)
  const positionRows: Array<{
    member_id: string
    category_id: string
    position_id: string
    organization_id: string
  }> = []
  for (const catId of categoryIds) {
    const positions = input.categoryPositions[catId] ?? []
    for (const posId of positions) {
      positionRows.push({
        member_id: input.memberId,
        category_id: catId,
        position_id: posId,
        organization_id: ctx.orgId!,
      })
    }
  }
  if (positionRows.length > 0) {
    const { error: mcpError } = await admin
      .from('member_category_positions')
      .insert(positionRows)
    if (mcpError) throw new Error(mcpError.message)
  }

  // Revalida rotas que mostram contadores / listas
  revalidatePath('/members')
  revalidatePath('/dashboard')
  revalidatePath('/')
}

/**
 * Rejeita um atleta pendente. Apaga o member + auth.user + profile (via
 * cascade do FK). Operação destrutiva — coord usa quando o cadastro é de
 * fato inválido (spam, nome falso, etc).
 *
 * Não mexemos em member_categories nem member_category_positions porque
 * atleta pendente nunca teve esses vínculos (o fluxo normal só cria ao
 * aprovar). Seguro apagar member direto.
 */
export async function rejectMember(memberId: string): Promise<void> {
  const ctx = await requireApprover()
  const admin = createAdminClient()

  const { data: member } = await admin
    .from('members')
    .select('id, user_id, organization_id, approved_at')
    .eq('id', memberId)
    .single()

  if (!member) throw new Error('Atleta não encontrado.')
  if (member.organization_id !== ctx.orgId) {
    throw new Error('Atleta não pertence à sua organização.')
  }
  if (member.approved_at) {
    throw new Error('Este atleta já foi aprovado — use a exclusão normal em /members.')
  }

  // Deleta member primeiro (FK pra auth.user seria outra direção, então OK)
  await admin.from('members').delete().eq('id', memberId)

  // Deleta auth.user — cascade ON DELETE CASCADE em profiles garante limpeza
  if (member.user_id) {
    await admin.auth.admin.deleteUser(member.user_id).catch((err) => {
      console.error('[rejectMember] falha ao deletar auth user:', err)
    })
  }

  revalidatePath('/members')
  revalidatePath('/dashboard')
  revalidatePath('/')
}
