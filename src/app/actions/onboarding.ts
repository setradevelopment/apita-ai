'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface OnboardingData {
  name: string
  dob: string // YYYY-MM-DD
  cpf: string // apenas dígitos
  rg: string // apenas dígitos
  origin_type: string
  origin_street: string
  origin_neighborhood: string
  origin_zip: string
  destination_type: string
  destination_street: string
  destination_neighborhood: string
  destination_zip: string
}

/**
 * Completa o perfil do usuário no primeiro acesso. Espelhada em
 * `(dashboard)/layout.tsx` pelo gate `!profile_completed_at → /onboarding`.
 *
 * Validação aqui é estrita: todos os campos da interface são obrigatórios e
 * texto precisa ser não-vazio após trim. O schema permite `NULL` nessas
 * colunas, mas a regra de negócio para o onboarding é mais rígida.
 *
 * Caso o usuário seja coord/member com flag `is_athlete=true` e exista row
 * correspondente em `public.members`, os dados pessoais/logística também são
 * refletidos lá — assim a visão da aba Atletas fica sincronizada sem
 * exigir um re-save do admin.
 */
export async function saveOnboarding(data: OnboardingData): Promise<void> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) throw new Error('Não autenticado')

  const name = data.name.trim()
  const cpf = data.cpf.replace(/\D/g, '')
  const rg = data.rg.replace(/\D/g, '')

  // Validação estrita — mensagens em PT para exibir direto na UI
  if (!name) throw new Error('Informe o nome completo.')
  if (!data.dob) throw new Error('Informe a data de nascimento.')
  if (cpf.length !== 11) throw new Error('CPF deve ter 11 dígitos.')
  if (rg.length < 5) throw new Error('RG inválido.')

  const requiredLogistics: Array<[keyof OnboardingData, string]> = [
    ['origin_street', 'Rua de saída é obrigatória.'],
    ['origin_neighborhood', 'Bairro de saída é obrigatório.'],
    ['origin_zip', 'CEP de saída é obrigatório.'],
    ['destination_street', 'Rua de destino é obrigatória.'],
    ['destination_neighborhood', 'Bairro de destino é obrigatório.'],
    ['destination_zip', 'CEP de destino é obrigatório.'],
  ]
  for (const [key, message] of requiredLogistics) {
    const val = String(data[key] ?? '').trim()
    if (!val) throw new Error(message)
  }

  // Check de duplicata (CPF) dentro da org — bloqueia antes de gravar
  // para dar mensagem amigável. Usa admin client para bypass de RLS
  // (o próprio user não enxerga todos os profiles da org).
  const admin = createAdminClient()

  const { data: currentProfile } = await admin
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single()
  const orgId = currentProfile?.organization_id as string | null | undefined

  if (orgId) {
    const { data: dup } = await admin
      .from('profiles')
      .select('id, name')
      .eq('organization_id', orgId)
      .eq('cpf', cpf)
      .neq('id', user.id)
      .limit(1)
    if (dup && dup.length > 0) {
      throw new Error(
        `CPF ${cpf} já cadastrado nesta organização (usuário: ${dup[0].name || dup[0].id}).`,
      )
    }
  }

  const patch = {
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
    profile_completed_at: new Date().toISOString(),
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
  if (profileError) throw new Error(profileError.message)

  // Se o usuário é atleta (tem row em members), reflete os mesmos dados lá
  // para manter a visão da aba Atletas consistente. Admin client porque RLS
  // só deixaria o próprio user atualizar member se ele fosse coordenador.
  if (orgId) {
    await admin
      .from('members')
      .update({
        name,
        dob: patch.dob,
        cpf: patch.cpf,
        rg: patch.rg,
        origin_type: patch.origin_type,
        origin_street: patch.origin_street,
        origin_neighborhood: patch.origin_neighborhood,
        origin_zip: patch.origin_zip,
        destination_type: patch.destination_type,
        destination_street: patch.destination_street,
        destination_neighborhood: patch.destination_neighborhood,
        destination_zip: patch.destination_zip,
      })
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
  }

  revalidatePath('/dashboard')
  revalidatePath('/members')
  revalidatePath('/settings')
}
