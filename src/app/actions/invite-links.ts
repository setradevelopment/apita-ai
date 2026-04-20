'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSessionContext } from '@/lib/auth/session'
import { getPasswordError } from '@/lib/validators/password'

// ── Tipos ──────────────────────────────────────────────────────────────

export interface InviteLink {
  id: string
  token: string
  /** URL pública pronta pra copiar (já inclui o token). */
  url: string
  created_at: string
  expires_at: string
  revoked_at: string | null
}

export interface InviteOrgInfo {
  organization_id: string
  organization_name: string
  organization_logo_url: string | null
  expires_at: string
}

export interface InviteSignupData {
  name: string
  email: string
  password: string
  password_confirm: string
  dob: string
  cpf: string
  rg: string
  origin_type: string
  origin_street: string
  origin_neighborhood: string
  origin_zip: string
  destination_type: string
  destination_street: string
  destination_neighborhood: string
  destination_zip: string
}

// ── Constantes ─────────────────────────────────────────────────────────

/** Validade do link (alinhado com o usuário: 7 dias a contar da geração). */
const EXPIRY_DAYS = 7

/**
 * Gera um token opaco (base64url de 24 bytes = 32 chars). Não é UUID pra
 * não vazar estrutura de PK — é um segredo puro usado só no URL.
 */
function generateToken(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Monta a URL pública do convite a partir do token. Lê `NEXT_PUBLIC_SITE_URL`
 * (fallback pro host atual se ausente). Usa `/join/[token]` — a rota pública
 * em `src/app/(auth)/join/[token]/page.tsx`.
 */
function inviteUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  return `${base.replace(/\/+$/, '')}/join/${token}`
}

// ── Queries (admin/coord) ──────────────────────────────────────────────

/**
 * Retorna o link ATIVO da org (não revogado e não expirado). `null` se não
 * houver. Server component pode chamar pra renderizar o estado inicial.
 */
export async function getActiveInviteLink(): Promise<InviteLink | null> {
  const { orgId, role } = await getSessionContext()
  if (!orgId) return null
  if (role !== 'admin' && role !== 'coordinator') return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('invite_links')
    .select('id, token, created_at, expires_at, revoked_at')
    .eq('organization_id', orgId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return {
    id: data.id,
    token: data.token,
    url: inviteUrl(data.token),
    created_at: data.created_at,
    expires_at: data.expires_at,
    revoked_at: data.revoked_at,
  }
}

/**
 * Gera um novo link. Se já existir um ATIVO na org, revoga-o primeiro
 * (mesma transação lógica — unique partial impediria senão). Retorna o novo.
 */
export async function createInviteLink(): Promise<InviteLink> {
  const { user, orgId, role } = await getSessionContext()
  if (!orgId) throw new Error('Organização não definida.')
  if (role !== 'admin' && role !== 'coordinator') {
    throw new Error('Apenas admin ou coordenador pode gerar link de convite.')
  }

  const admin = createAdminClient()

  // Revoga ativo existente — unique partial (revoked_at IS NULL) permitiria
  // no máximo 1, então essa query é inofensiva se não houver nada.
  await admin
    .from('invite_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .is('revoked_at', null)

  const token = generateToken()
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  const { data, error } = await admin
    .from('invite_links')
    .insert({
      organization_id: orgId,
      token,
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, token, created_at, expires_at, revoked_at')
    .single()

  if (error || !data) throw new Error(error?.message || 'Erro ao gerar link.')

  revalidatePath('/settings')

  return {
    id: data.id,
    token: data.token,
    url: inviteUrl(data.token),
    created_at: data.created_at,
    expires_at: data.expires_at,
    revoked_at: data.revoked_at,
  }
}

/**
 * Revoga o link ativo da org. Idempotente — se não houver ativo, silencia.
 */
export async function revokeInviteLink(): Promise<void> {
  const { orgId, role } = await getSessionContext()
  if (!orgId) throw new Error('Organização não definida.')
  if (role !== 'admin' && role !== 'coordinator') {
    throw new Error('Apenas admin ou coordenador pode revogar link.')
  }

  const admin = createAdminClient()
  await admin
    .from('invite_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('organization_id', orgId)
    .is('revoked_at', null)

  revalidatePath('/settings')
}

// ── Rota pública (/join/[token]) ───────────────────────────────────────

/**
 * Valida um token e retorna info da org pra exibir na tela pública. `null`
 * significa token inválido/expirado/revogado — a rota renderiza uma tela
 * de erro genérica (sem vazar se o token nunca existiu vs foi revogado).
 */
export async function validateInviteToken(token: string): Promise<InviteOrgInfo | null> {
  if (!token || typeof token !== 'string') return null
  // Sanity check no formato — base64url de 24 bytes = 32 chars
  if (token.length < 20 || token.length > 64) return null

  const admin = createAdminClient()
  const { data: link } = await admin
    .from('invite_links')
    .select('organization_id, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (!link) return null
  if (link.revoked_at) return null
  if (new Date(link.expires_at) < new Date()) return null

  const { data: org } = await admin
    .from('organizations')
    .select('id, name, logo_url')
    .eq('id', link.organization_id)
    .single()

  if (!org) return null

  return {
    organization_id: org.id,
    organization_name: org.name,
    organization_logo_url: (org.logo_url as string | null) ?? null,
    expires_at: link.expires_at,
  }
}

/**
 * Signup via convite. Cria auth.user + profile + member. NÃO requer sessão
 * — é a ação pública que roda quando o atleta clica "Concluir cadastro" na
 * rota /join/[token]. Retorna `{ email }` pra o cliente fazer auto-login
 * com a senha que o próprio user digitou (já está em memória dele).
 *
 * Validação:
 * - Todos os campos de `InviteSignupData` são obrigatórios.
 * - Senha segue `isStrongPassword` (6+, 1 min/1 mai/1 num/1 especial).
 * - `password === password_confirm`.
 * - CPF único na org (evita duplicata quando atleta já cadastrado tenta de novo).
 * - Email único globalmente (Supabase auth já garante, erro é mapeado).
 */
export async function signupViaInvite(
  token: string,
  data: InviteSignupData,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  try {
    const info = await validateInviteToken(token)
    if (!info) return { ok: false, error: 'Link inválido ou expirado.' }

    // ── Normalização + validação ──────────────────────────────────────
    const name = data.name.trim()
    const email = data.email.trim().toLowerCase()
    const cpf = data.cpf.replace(/\D/g, '')
    const rg = data.rg.replace(/\D/g, '')

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'E-mail inválido.' }
    }
    if (data.password !== data.password_confirm) {
      return { ok: false, error: 'As senhas não conferem.' }
    }
    const passwordError = getPasswordError(data.password)
    if (passwordError) return { ok: false, error: passwordError }

    if (!name) return { ok: false, error: 'Informe o nome completo.' }
    if (!data.dob) return { ok: false, error: 'Informe a data de nascimento.' }
    if (cpf.length !== 11) return { ok: false, error: 'CPF deve ter 11 dígitos.' }
    if (rg.length < 5) return { ok: false, error: 'RG inválido.' }

    const required: Array<[keyof InviteSignupData, string]> = [
      ['origin_street', 'Rua de saída é obrigatória.'],
      ['origin_neighborhood', 'Bairro de saída é obrigatório.'],
      ['origin_zip', 'CEP de saída é obrigatório.'],
      ['destination_street', 'Rua de destino é obrigatória.'],
      ['destination_neighborhood', 'Bairro de destino é obrigatório.'],
      ['destination_zip', 'CEP de destino é obrigatório.'],
    ]
    for (const [key, message] of required) {
      const val = String(data[key] ?? '').trim()
      if (!val) return { ok: false, error: message }
    }

    const admin = createAdminClient()

    // CPF duplicado dentro da mesma org — mensagem clara antes de criar
    // auth.user (pra não deixar o usuário órfão).
    const { data: dup } = await admin
      .from('profiles')
      .select('id, name')
      .eq('organization_id', info.organization_id)
      .eq('cpf', cpf)
      .limit(1)
    if (dup && dup.length > 0) {
      return {
        ok: false,
        error: `CPF ${cpf} já cadastrado nesta organização.`,
      }
    }

    // ── Cria auth.user (email já confirmado — login imediato) ─────────
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name, is_athlete: true },
    })
    if (authError || !authData?.user) {
      // Erros comuns: "A user with this email address has already been registered"
      const msg = authError?.message?.toLowerCase() ?? ''
      if (msg.includes('already') && msg.includes('registered')) {
        return { ok: false, error: 'Este e-mail já está cadastrado.' }
      }
      return { ok: false, error: authError?.message || 'Erro ao criar usuário.' }
    }
    const newUserId = authData.user.id

    // ── Atualiza profile (o trigger handle_new_user já criou o row) ───
    const nowIso = new Date().toISOString()
    const profilePatch = {
      name,
      dob: data.dob,
      cpf,
      rg,
      origin_type: data.origin_type || null,
      origin_street: data.origin_street.trim(),
      origin_neighborhood: data.origin_neighborhood.trim(),
      origin_zip: data.origin_zip.replace(/\D/g, ''),
      destination_type: data.destination_type || null,
      destination_street: data.destination_street.trim(),
      destination_neighborhood: data.destination_neighborhood.trim(),
      destination_zip: data.destination_zip.replace(/\D/g, ''),
      organization_id: info.organization_id,
      role: 'member',
      is_athlete: true,
      // Preenche ambos os timestamps: profile está completo (não precisa
      // passar por /onboarding) e não força reset de senha (usuário
      // escolheu a própria senha).
      profile_completed_at: nowIso,
      password_reset_at: null,
    }

    const { error: profileError } = await admin
      .from('profiles')
      .update(profilePatch)
      .eq('id', newUserId)
    if (profileError) {
      // Tenta rollback do auth user pra não deixar órfão
      await admin.auth.admin.deleteUser(newUserId).catch(() => {})
      return { ok: false, error: profileError.message }
    }

    // ── Cria row em members — atleta PENDENTE de aprovação ────────────
    // `approved_at` fica NULL (default) — o gate em `(dashboard)/layout.tsx`
    // vai redirecionar esse usuário pra tela "aguardando aprovação" até que
    // contratante/coordenador aprove via /members (aba Pendentes).
    const { error: memberError } = await admin
      .from('members')
      .insert({
        user_id: newUserId,
        organization_id: info.organization_id,
        name,
        dob: data.dob,
        cpf,
        rg,
        origin_type: profilePatch.origin_type,
        origin_street: profilePatch.origin_street,
        origin_neighborhood: profilePatch.origin_neighborhood,
        origin_zip: profilePatch.origin_zip,
        destination_type: profilePatch.destination_type,
        destination_street: profilePatch.destination_street,
        destination_neighborhood: profilePatch.destination_neighborhood,
        destination_zip: profilePatch.destination_zip,
        active: true,
        approved_at: null,
      })
    if (memberError) {
      // Não reverte o auth user aqui — o atleta ainda consegue logar; o
      // admin pode consertar o vínculo de member manualmente. Log pra
      // observabilidade (visível no runtime logs do Vercel/Supabase).
      console.error('[signupViaInvite] erro criando member:', memberError)
    }

    revalidatePath('/members')
    revalidatePath('/settings')

    return { ok: true, email }
  } catch (err) {
    console.error('[signupViaInvite] erro inesperado:', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro ao processar cadastro.',
    }
  }
}
