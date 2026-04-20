'use server'

import { revalidatePath } from 'next/cache'
import { resolveTargetOrg, type TargetOrgOpts } from '@/lib/auth/resolve-org'

function revalidateForOrg(opts?: TargetOrgOpts, orgId?: string) {
  revalidatePath('/settings')
  if (opts?.forOrgId && orgId) {
    revalidatePath(`/admin/organizations/${orgId}`, 'layout')
  }
}

export async function createPosition(name: string, opts?: TargetOrgOpts) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  const { error } = await supabase.from('positions').insert({
    name,
    organization_id: orgId,
  })
  if (error) throw new Error(error.message)
  revalidateForOrg(opts, orgId)
}

export async function deletePosition(id: string, opts?: TargetOrgOpts) {
  const { supabase, orgId } = await resolveTargetOrg(opts?.forOrgId)
  const { error } = await supabase
    .from('positions')
    .delete()
    .eq('id', id)
    .eq('organization_id', orgId)
  if (error) throw new Error(error.message)
  revalidateForOrg(opts, orgId)
}
