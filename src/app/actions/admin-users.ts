'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPlan, type PlanId } from '@/lib/plans'
import type { TargetOrgOpts } from '@/lib/auth/resolve-org'

/**
 * Asserts the caller has admin/coordinator privileges over the target organization.
 *
 * - Without `forOrgId`: caller must be admin/coordinator/super_admin in their own org
 *   (the classic `/dashboard/settings` path).
 * - With `forOrgId`: caller must be super_admin, and target = that org. Returns
 *   `role: 'super_admin'` so existing plan-limit bypass keeps working.
 */
async function assertAdminForOrg(forOrgId?: string | null): Promise<{
  userId: string
  orgId: string
  role: string
  plan: PlanId
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Não autenticado')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id')
    .eq('id', user.id)
    .single()
  if (!profile) throw new Error('Sem permissão')

  // Super_admin drilldown: acting *as* another organization
  if (forOrgId) {
    if (profile.role !== 'super_admin') {
      throw new Error('Acesso restrito a super_admin')
    }
    const { data: org, error } = await supabase
      .from('organizations')
      .select('id, plan')
      .eq('id', forOrgId)
      .single()
    if (error || !org) throw new Error('Organização não encontrada')
    return {
      userId: user.id,
      orgId: org.id as string,
      role: 'super_admin',
      plan: ((org.plan as string) ?? 'basic') as PlanId,
    }
  }

  // Classic path: caller operates within their own org
  if (!['admin', 'coordinator', 'super_admin'].includes(profile.role)) {
    throw new Error('Sem permissão')
  }
  if (!profile.organization_id) {
    throw new Error('Usuário não vinculado a uma organização')
  }
  const { data: org } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', profile.organization_id)
    .single()
  return {
    userId: user.id,
    orgId: profile.organization_id,
    role: profile.role,
    plan: (org?.plan ?? 'basic') as PlanId,
  }
}

function revalidateForOrg(opts?: TargetOrgOpts, orgId?: string) {
  revalidatePath('/settings')
  revalidatePath('/members')
  if (opts?.forOrgId && orgId) {
    revalidatePath(`/admin/organizations/${orgId}`, 'layout')
  }
}

/**
 * Erra se já existe um profile na mesma org com o mesmo CPF ou RG.
 * `excludeUserId` permite pular o próprio usuário (usado em update).
 *
 * Check por org (não global) porque o modelo atual ainda é single-org em
 * `profiles.organization_id`. Quando o PR4 introduzir UNIQUE global, este
 * check continua válido como defesa em profundidade com mensagem amigável.
 *
 * Admin client faz a query com service_role (bypass RLS) — necessário
 * porque super_admin em drilldown não enxerga profiles da org via RLS normal.
 */
async function assertCpfRgUniqueInOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  cpf: string | null | undefined,
  rg: string | null | undefined,
  excludeUserId?: string,
) {
  const normalizedCpf = cpf?.replace(/\D/g, '').trim() || null
  const normalizedRg = rg?.replace(/\D/g, '').trim() || null

  if (normalizedCpf) {
    let q = admin
      .from('profiles')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('cpf', normalizedCpf)
    if (excludeUserId) q = q.neq('id', excludeUserId)
    const { data } = await q.limit(1)
    if (data && data.length > 0) {
      throw new Error(
        `CPF ${normalizedCpf} já cadastrado nesta organização (usuário: ${data[0].name || data[0].id}).`,
      )
    }
  }

  if (normalizedRg) {
    let q = admin
      .from('profiles')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('rg', normalizedRg)
    if (excludeUserId) q = q.neq('id', excludeUserId)
    const { data } = await q.limit(1)
    if (data && data.length > 0) {
      throw new Error(
        `RG ${normalizedRg} já cadastrado nesta organização (usuário: ${data[0].name || data[0].id}).`,
      )
    }
  }
}

export interface PlatformUser {
  id: string
  email: string
  name: string
  role: string
  /**
   * Flag explícita "também é atleta". Independe do role:
   * - role='member' sempre vem com is_athlete=true (semanticamente são a mesma coisa)
   * - role='admin'/'coordinator' podem ter is_athlete=true (participam dos treinos
   *   sem perder as permissões de gestão) OU false (só gestão, não entra em members)
   */
  is_athlete: boolean
  dob: string | null
  cpf: string | null
  rg: string | null
  club: string | null
  contact_email: string | null
  permissions: Record<string, boolean>
  origin_type: string | null
  origin_street: string | null
  origin_neighborhood: string | null
  origin_zip: string | null
  destination_type: string | null
  destination_street: string | null
  destination_neighborhood: string | null
  destination_zip: string | null
  created_at: string
  member_id: string | null
  category_ids: string[]
  /**
   * Posições por categoria — mapa { category_id: position_ids[] }.
   * Uma categoria pode estar em `category_ids` sem entrada aqui (nenhuma
   * posição definida para aquela categoria ainda).
   */
  category_positions: Record<string, string[]>
}

export async function adminListUsers(opts?: TargetOrgOpts): Promise<PlatformUser[]> {
  const { orgId } = await assertAdminForOrg(opts?.forOrgId)

  const admin = createAdminClient()

  // Fetch profiles scoped to this organization
  const [{ data: { users }, error: authError }, { data: profiles }, { data: members }] =
    await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      admin.from('profiles').select('*').eq('organization_id', orgId),
      admin
        .from('members')
        .select('id, user_id, member_categories(category_id), member_category_positions(category_id, position_id)')
        .eq('organization_id', orgId)
        .not('user_id', 'is', null),
    ])

  if (authError) throw new Error(authError.message)

  // Only return users that belong to this organization
  const profileIds = new Set((profiles ?? []).map((p: { id: string }) => p.id))

  return users
    .filter((u) => profileIds.has(u.id))
    .map((u) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p: any = profiles?.find((p) => p.id === u.id) ?? {}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m: any = members?.find((m) => m.user_id === u.id)
      return {
        id: u.id,
        email: u.email ?? '',
        name: p.name ?? '',
        role: p.role ?? 'member',
        is_athlete: Boolean(p.is_athlete),
        dob: p.dob ?? null,
        cpf: p.cpf ?? null,
        rg: p.rg ?? null,
        club: p.club ?? null,
        contact_email: p.contact_email ?? null,
        permissions: (p.permissions ?? {}) as Record<string, boolean>,
        origin_type: p.origin_type ?? null,
        origin_street: p.origin_street ?? null,
        origin_neighborhood: p.origin_neighborhood ?? null,
        origin_zip: p.origin_zip ?? null,
        destination_type: p.destination_type ?? null,
        destination_street: p.destination_street ?? null,
        destination_neighborhood: p.destination_neighborhood ?? null,
        destination_zip: p.destination_zip ?? null,
        created_at: u.created_at ?? '',
        member_id: m?.id ?? null,
        category_ids: m?.member_categories?.map((mc: { category_id: string }) => mc.category_id) ?? [],
        category_positions:
          (m?.member_category_positions ?? []).reduce(
            (acc: Record<string, string[]>, row: { category_id: string; position_id: string }) => {
              if (!acc[row.category_id]) acc[row.category_id] = []
              acc[row.category_id].push(row.position_id)
              return acc
            },
            {} as Record<string, string[]>,
          ),
      }
    })
}

export async function adminUpdateUser(
  userId: string,
  data: {
    name?: string
    role?: string
    /**
     * Novo valor da flag "também é atleta". Quando a flag muda:
     * - `false → true`: cria um row em `members` (sem categorias; o vínculo
     *   com categorias/posições é feito em `adminUpdateUserClub`).
     * - `true → false`: apaga o row em `members` (cascateia
     *   member_categories, member_category_positions, payments, attendances).
     */
    is_athlete?: boolean
    dob?: string | null
    cpf?: string | null
    rg?: string | null
    club?: string | null
    /**
     * Novo e-mail de LOGIN. Só é persistido se diferente do atual — a troca
     * vai para `auth.users` via `updateUserById`. UI deve confirmar com o
     * caller antes de chamar (o usuário só consegue logar com o novo e-mail
     * após o salvar).
     */
    email?: string
    origin_type?: string | null
    origin_street?: string | null
    origin_neighborhood?: string | null
    origin_zip?: string | null
    destination_type?: string | null
    destination_street?: string | null
    destination_neighborhood?: string | null
    destination_zip?: string | null
  },
  opts?: TargetOrgOpts,
) {
  const { orgId } = await assertAdminForOrg(opts?.forOrgId)
  const admin = createAdminClient()

  // Verify target user belongs to the resolved org + pega o is_athlete atual
  // pra detectar transição (false↔true) e decidir criar/deletar member.
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('organization_id, is_athlete, name, dob, cpf, rg, origin_type, origin_street, origin_neighborhood, origin_zip, destination_type, destination_street, destination_neighborhood, destination_zip')
    .eq('id', userId)
    .single()
  if (targetProfile?.organization_id !== orgId) {
    throw new Error('Usuário não pertence à organização alvo')
  }

  // Separate the auth-level email from the profiles payload — `profiles` has
  // no `email` column and we don't want to pollute the update.
  const { email: newEmail, ...profilePatch } = data

  // Check de CPF/RG duplicados na org — só valida se vieram no patch. Exclui
  // o próprio usuário para permitir "re-salvar sem mudar CPF" sem erro.
  if ('cpf' in profilePatch || 'rg' in profilePatch) {
    await assertCpfRgUniqueInOrg(admin, orgId, profilePatch.cpf, profilePatch.rg, userId)
  }

  // Sync login e-mail to auth.users if provided and different from current
  if (typeof newEmail === 'string' && newEmail.trim().length > 0) {
    const trimmed = newEmail.trim()
    const { data: authUser, error: getErr } =
      await admin.auth.admin.getUserById(userId)
    if (getErr) throw new Error(getErr.message)
    const currentEmail = authUser?.user?.email ?? ''
    if (trimmed !== currentEmail) {
      const { error: emailErr } = await admin.auth.admin.updateUserById(userId, {
        email: trimmed,
        email_confirm: true,
      })
      if (emailErr) throw new Error(emailErr.message)
    }
  }

  if (Object.keys(profilePatch).length > 0) {
    const { error } = await admin.from('profiles').update(profilePatch).eq('id', userId)
    if (error) throw new Error(error.message)
  }

  // Sync name change to the linked members record (if any)
  if (profilePatch.name) {
    await admin
      .from('members')
      .update({ name: profilePatch.name })
      .eq('user_id', userId)
      .eq('organization_id', orgId)
  }

  // Transições de is_athlete (só quando a flag foi explicitamente passada)
  if (typeof profilePatch.is_athlete === 'boolean') {
    const wasAthlete = Boolean(targetProfile.is_athlete)
    const willBeAthlete = profilePatch.is_athlete

    if (!wasAthlete && willBeAthlete) {
      // false → true: cria member se ainda não existe (idempotente)
      const { data: existing } = await admin
        .from('members')
        .select('id')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
        .maybeSingle()
      if (!existing) {
        // Usa os dados mais frescos possíveis: o que veio no patch tem prioridade,
        // senão cai no snapshot do profile antes do UPDATE.
        const src = { ...targetProfile, ...profilePatch }
        await admin.from('members').insert({
          name: src.name ?? '',
          user_id: userId,
          organization_id: orgId,
          dob: src.dob ?? null,
          cpf: src.cpf ?? null,
          rg: src.rg ?? null,
          origin_type: src.origin_type ?? null,
          origin_street: src.origin_street ?? null,
          origin_neighborhood: src.origin_neighborhood ?? null,
          origin_zip: src.origin_zip ?? null,
          destination_type: src.destination_type ?? null,
          destination_street: src.destination_street ?? null,
          destination_neighborhood: src.destination_neighborhood ?? null,
          destination_zip: src.destination_zip ?? null,
        })
      }
    } else if (wasAthlete && !willBeAthlete) {
      // true → false: apaga member (FKs cascateiam categories/positions/payments/attendances)
      await admin
        .from('members')
        .delete()
        .eq('user_id', userId)
        .eq('organization_id', orgId)
    }
  }

  revalidateForOrg(opts, orgId)
}

export async function adminUpdateUserClub(
  userId: string,
  existingMemberId: string | null,
  categoryIds: string[],
  /**
   * Positions por categoria — `{ category_id: position_ids[] }`. Chaves que
   * não estão em `categoryIds` são ignoradas (a categoria foi desmarcada).
   */
  categoryPositions: Record<string, string[]>,
  opts?: TargetOrgOpts,
) {
  const { orgId } = await assertAdminForOrg(opts?.forOrgId)
  const admin = createAdminClient()

  let memberId = existingMemberId

  // Create a member record linked to this user if one doesn't exist
  if (!memberId) {
    const { data: profile } = await admin
      .from('profiles')
      .select('name, organization_id')
      .eq('id', userId)
      .single()
    if (profile?.organization_id !== orgId) {
      throw new Error('Usuário não pertence à organização alvo')
    }
    const { data: newMember, error: mErr } = await admin
      .from('members')
      .insert({ name: profile?.name ?? '', user_id: userId, organization_id: orgId })
      .select('id')
      .single()
    if (mErr) throw new Error(mErr.message)
    memberId = newMember.id
  } else {
    // Verify the existing member belongs to the resolved org
    const { data: existingMember } = await admin
      .from('members')
      .select('organization_id')
      .eq('id', memberId)
      .single()
    if (existingMember?.organization_id !== orgId) {
      throw new Error('Membro não pertence à organização alvo')
    }
  }

  await admin.from('member_categories').delete().eq('member_id', memberId)
  await admin.from('member_category_positions').delete().eq('member_id', memberId)

  if (categoryIds.length > 0) {
    await admin
      .from('member_categories')
      .insert(categoryIds.map((category_id) => ({
        member_id: memberId!,
        category_id,
        organization_id: orgId,
      })))
  }

  // Filtra positions só das categorias realmente selecionadas
  const selectedCategories = new Set(categoryIds)
  const positionRows: { member_id: string; category_id: string; position_id: string; organization_id: string }[] = []
  for (const [categoryId, positionIds] of Object.entries(categoryPositions)) {
    if (!selectedCategories.has(categoryId)) continue
    for (const positionId of positionIds) {
      positionRows.push({
        member_id: memberId!,
        category_id: categoryId,
        position_id: positionId,
        organization_id: orgId,
      })
    }
  }
  if (positionRows.length > 0) {
    await admin.from('member_category_positions').insert(positionRows)
  }

  revalidateForOrg(opts, orgId)
}

export async function adminResetPassword(userId: string, opts?: TargetOrgOpts) {
  const { orgId } = await assertAdminForOrg(opts?.forOrgId)
  const admin = createAdminClient()

  // Verify target user belongs to the resolved org
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('organization_id, cpf')
    .eq('id', userId)
    .single()
  if (targetProfile?.organization_id !== orgId) {
    throw new Error('Usuário não pertence à organização alvo')
  }

  if (!targetProfile?.cpf) {
    throw new Error('CPF não cadastrado. Cadastre o CPF antes de resetar a senha.')
  }

  const digits = targetProfile.cpf.replace(/\D/g, '')
  if (digits.length < 4) throw new Error('CPF inválido para reset de senha.')

  // Senha temporária = `{4 primeiros dígitos do CPF}@{slug da organização}`.
  // Slug é unique global (`organizations.slug NOT NULL UNIQUE`), então mesmo
  // que o usuário tenha membership em mais de uma org no futuro, a senha
  // desta org é inequívoca. O `password_reset_at` abaixo força troca no
  // próximo login — essa senha é curta-duração por design.
  const { data: org } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', orgId)
    .single()
  const slug = (org?.slug as string) ?? 'apita-ai'

  const newPassword = digits.substring(0, 4) + '@' + slug
  const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) throw new Error(error.message)

  // Flag the profile so the dashboard forces a password change on next login
  await admin
    .from('profiles')
    .update({ password_reset_at: new Date().toISOString() })
    .eq('id', userId)
}

export async function adminCreateUser(
  data: {
    email: string
    name: string
    role?: string
    /**
     * Se `true`, um row em `public.members` é criado e o usuário aparece em
     * /dashboard/members. Obrigatório `true` quando `role='member'` — a UI
     * deve forçar isso. Para admin/coord, controla "também é atleta".
     * Quando `false`, `category_ids` e `category_positions` são ignoradas.
     */
    is_athlete?: boolean
    /**
     * Permissões iniciais do usuário (jsonb em `profiles.permissions`).
     * Só faz sentido para `role='coordinator'` — a UI aplica defaults
     * adequados. Se omitido, fica `{}`.
     */
    permissions?: Record<string, boolean>
    dob?: string
    cpf?: string
    rg?: string
    club?: string
    origin_type?: string
    origin_street?: string
    origin_neighborhood?: string
    origin_zip?: string
    destination_type?: string
    destination_street?: string
    destination_neighborhood?: string
    destination_zip?: string
    category_ids?: string[]
    /**
     * Positions por categoria — `{ category_id: position_ids[] }`. Só são
     * persistidas entradas cuja `category_id` também esteja em `category_ids`.
     */
    category_positions?: Record<string, string[]>
  },
  opts?: TargetOrgOpts,
) {
  const { orgId, role: callerRole, plan } = await assertAdminForOrg(opts?.forOrgId)
  const admin = createAdminClient()

  const newUserRole = data.role ?? 'member'
  // role='member' implica atleta por definição; senão respeita a flag explícita.
  const isAthlete = newUserRole === 'member' ? true : data.is_athlete === true
  const willCreateMember = isAthlete

  // Se não vai criar member, ignora category_ids/category_positions (a UI deve
  // esconder esses campos, mas defendemos no backend também).
  const categoryIds = willCreateMember ? (data.category_ids ?? []) : []
  const categoryPositions = willCreateMember ? (data.category_positions ?? {}) : {}
  const selectedCategories = new Set(categoryIds)
  const positionRowsPreview = Object.entries(categoryPositions).filter(([catId]) =>
    selectedCategories.has(catId),
  )

  // Enforce plan limit for members (super_admin bypasses)
  if (callerRole !== 'super_admin' && willCreateMember) {
    const planDef = getPlan(plan)
    const { count } = await admin
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

  // Falha antecipadamente se CPF/RG já estão em uso nesta organização.
  // Fora do try: queremos o erro de duplicata subir limpo pra UI.
  await assertCpfRgUniqueInOrg(admin, orgId, data.cpf, data.rg)

  // Senha temporária usa o slug da org — `{cpf4}@{slug}` ou `{slug}@2026`
  // quando o CPF não está disponível. Cada org tem seu padrão próprio (slug
  // é UNIQUE), mantendo consistência dentro do clube sem vazar entre orgs.
  const { data: org } = await admin
    .from('organizations')
    .select('slug')
    .eq('id', orgId)
    .single()
  const slug = (org?.slug as string) ?? 'apita-ai'

  const digits = (data.cpf ?? '').replace(/\D/g, '')
  const initialPassword =
    digits.length >= 4 ? digits.substring(0, 4) + '@' + slug : slug + '@2026'

  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email: data.email,
    password: initialPassword,
    email_confirm: true,
    user_metadata: { name: data.name, role: data.role ?? 'member' },
  })
  if (createError) throw new Error(createError.message)

  const uid = newUser.user!.id

  // Update profile with full data + organization (trigger already created the row).
  // Stamp password_reset_at so the user is forced to pick a real (policy-compliant)
  // password on first login — the temp `{cpf4}@{slug}` password doesn't meet the
  // password policy (no uppercase), and even if it did, users shouldn't keep it.
  const { error: profileError } = await admin.from('profiles').update({
    name: data.name,
    role: data.role ?? 'member',
    is_athlete: isAthlete,
    // Permissões só persistidas para coordenador (para atletas/admins fica `{}`).
    permissions: newUserRole === 'coordinator' ? (data.permissions ?? {}) : {},
    organization_id: orgId,
    dob: data.dob || null,
    cpf: data.cpf || null,
    rg: data.rg || null,
    club: data.club || null,
    origin_type: data.origin_type || null,
    origin_street: data.origin_street || null,
    origin_neighborhood: data.origin_neighborhood || null,
    origin_zip: data.origin_zip || null,
    destination_type: data.destination_type || null,
    destination_street: data.destination_street || null,
    destination_neighborhood: data.destination_neighborhood || null,
    destination_zip: data.destination_zip || null,
    password_reset_at: new Date().toISOString(),
  }).eq('id', uid)
  if (profileError) throw new Error(profileError.message)

  if (willCreateMember) {
    const { data: member, error: mErr } = await admin
      .from('members')
      .insert({
        name: data.name,
        user_id: uid,
        organization_id: orgId,
        dob: data.dob || null,
        cpf: data.cpf || null,
        rg: data.rg || null,
        origin_type: data.origin_type || null,
        origin_street: data.origin_street || null,
        origin_neighborhood: data.origin_neighborhood || null,
        origin_zip: data.origin_zip || null,
        destination_type: data.destination_type || null,
        destination_street: data.destination_street || null,
        destination_neighborhood: data.destination_neighborhood || null,
        destination_zip: data.destination_zip || null,
      })
      .select('id')
      .single()

    if (!mErr && member) {
      if (categoryIds.length > 0) {
        await admin.from('member_categories').insert(
          categoryIds.map((category_id) => ({
            member_id: member.id,
            category_id,
            organization_id: orgId,
          }))
        )
      }
      const positionRows: {
        member_id: string
        category_id: string
        position_id: string
        organization_id: string
      }[] = []
      for (const [categoryId, positionIds] of positionRowsPreview) {
        for (const positionId of positionIds) {
          positionRows.push({
            member_id: member.id,
            category_id: categoryId,
            position_id: positionId,
            organization_id: orgId,
          })
        }
      }
      if (positionRows.length > 0) {
        await admin.from('member_category_positions').insert(positionRows)
      }
    }
  }

  revalidateForOrg(opts, orgId)
}

export async function adminDeleteUser(userId: string, opts?: TargetOrgOpts) {
  const { orgId } = await assertAdminForOrg(opts?.forOrgId)
  const admin = createAdminClient()

  // Verify target user belongs to the resolved org
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .single()
  if (targetProfile?.organization_id !== orgId) {
    throw new Error('Usuário não pertence à organização alvo')
  }

  // Importante: `members.user_id` tem FK `ON DELETE SET NULL`, então ao
  // deletar o auth.user o row em `members` PERSISTE com `user_id = NULL`
  // (ficava "órfão" aparecendo em /members). Antes de deletar o auth.user,
  // removemos o member explicitamente — cascata em `member_categories`,
  // `member_category_positions`, `member_attendances` e `monthly_payments`
  // (todas com `ON DELETE CASCADE` em `members.id`) limpa o resto.
  //
  // Consequência aceita: perde o histórico de presenças/pagamentos do
  // atleta deletado. Esse é o comportamento esperado quando o admin
  // escolhe "Excluir usuário" em /settings — operação destrutiva total.
  // Para preservar histórico, o fluxo alternativo é inativar (is_athlete
  // = false ou active = false em members), não deletar.
  await admin
    .from('members')
    .delete()
    .eq('user_id', userId)
    .eq('organization_id', orgId)

  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(error.message)
  revalidateForOrg(opts, orgId)
}

export async function adminUpdatePermissions(
  userId: string,
  permissions: Record<string, boolean>,
  opts?: TargetOrgOpts,
) {
  const { orgId } = await assertAdminForOrg(opts?.forOrgId)
  const admin = createAdminClient()

  // Verify target user belongs to the resolved org
  const { data: targetProfile } = await admin
    .from('profiles')
    .select('organization_id')
    .eq('id', userId)
    .single()
  if (targetProfile?.organization_id !== orgId) {
    throw new Error('Usuário não pertence à organização alvo')
  }

  const { error } = await admin
    .from('profiles')
    .update({ permissions })
    .eq('id', userId)
  if (error) throw new Error(error.message)

  revalidateForOrg(opts, orgId)
}
