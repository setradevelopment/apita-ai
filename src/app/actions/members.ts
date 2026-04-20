'use server'

import { revalidatePath } from 'next/cache'
import { resolveTargetOrg, type TargetOrgOpts } from '@/lib/auth/resolve-org'
import { getPlan } from '@/lib/plans'

function revalidateForOrg(opts?: TargetOrgOpts, orgId?: string) {
  revalidatePath('/members')
  revalidatePath('/', 'layout')
  if (opts?.forOrgId && orgId) {
    revalidatePath(`/admin/organizations/${orgId}`, 'layout')
  }
}

/**
 * Expande `category_positions` em linhas prontas para insert em
 * `member_category_positions`, filtrando entradas cuja categoria não está
 * selecionada (defesa — a UI não deve mandar, mas o payload é confiável
 * até prova contrária).
 */
function expandCategoryPositions(
  memberId: string,
  orgId: string,
  categoryIds: string[],
  categoryPositions: Record<string, string[]>,
) {
  const selected = new Set(categoryIds)
  const rows: { member_id: string; category_id: string; position_id: string; organization_id: string }[] = []
  for (const [categoryId, positionIds] of Object.entries(categoryPositions)) {
    if (!selected.has(categoryId)) continue
    for (const positionId of positionIds) {
      rows.push({ member_id: memberId, category_id: categoryId, position_id: positionId, organization_id: orgId })
    }
  }
  return rows
}

export async function createMember(
  data: {
    name: string
    dob?: string
    cpf?: string
    rg?: string
    origin_type?: string
    origin_street?: string
    origin_neighborhood?: string
    origin_zip?: string
    destination_type?: string
    destination_street?: string
    destination_neighborhood?: string
    destination_zip?: string
    category_ids: string[]
    /** Posições por categoria — `{ category_id: position_ids[] }`. */
    category_positions: Record<string, string[]>
  },
  opts?: TargetOrgOpts,
) {
  const { supabase, orgId, role, plan } = await resolveTargetOrg(opts?.forOrgId)
  const { category_ids, category_positions, ...memberData } = data

  // Enforce plan limits (super_admin bypasses)
  if (role !== 'super_admin') {
    const planDef = getPlan(plan)
    const { count } = await supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('active', true)
    if ((count ?? 0) >= planDef.max_members) {
      throw new Error(
        `Limite de ${planDef.max_members} membro(s) do plano ${planDef.name} atingido. Faça upgrade para adicionar mais.`,
      )
    }
  }

  const { data: member, error } = await supabase
    .from('members')
    .insert({ ...memberData, organization_id: orgId })
    .select('id')
    .single()

  if (error) throw new Error(error.message)

  if (category_ids.length > 0) {
    await supabase.from('member_categories').insert(
      category_ids.map((category_id) => ({
        member_id: member.id,
        category_id,
        organization_id: orgId,
      }))
    )
  }

  const positionRows = expandCategoryPositions(member.id, orgId, category_ids, category_positions)
  if (positionRows.length > 0) {
    await supabase.from('member_category_positions').insert(positionRows)
  }

  revalidateForOrg(opts, orgId)
}

export async function updateMember(
  id: string,
  data: {
    name: string
    dob?: string
    cpf?: string
    rg?: string
    origin_type?: string
    origin_street?: string
    origin_neighborhood?: string
    origin_zip?: string
    destination_type?: string
    destination_street?: string
    destination_neighborhood?: string
    destination_zip?: string
    category_ids: string[]
    /** Posições por categoria — `{ category_id: position_ids[] }`. */
    category_positions: Record<string, string[]>
  },
  opts?: TargetOrgOpts,
) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  const { category_ids, category_positions, ...memberData } = data

  const { error } = await supabase
    .from('members')
    .update(memberData)
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)

  await supabase.from('member_categories').delete().eq('member_id', id)
  await supabase.from('member_category_positions').delete().eq('member_id', id)

  if (category_ids.length > 0) {
    await supabase.from('member_categories').insert(
      category_ids.map((category_id) => ({
        member_id: id,
        category_id,
        organization_id: orgId,
      }))
    )
  }

  const positionRows = expandCategoryPositions(id, orgId, category_ids, category_positions)
  if (positionRows.length > 0) {
    await supabase.from('member_category_positions').insert(positionRows)
  }

  revalidateForOrg(opts, orgId)
}

export async function deleteMember(id: string, opts?: TargetOrgOpts) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  const { error } = await supabase
    .from('members')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidateForOrg(opts, orgId)
}
