import type { SupabaseClient } from '@supabase/supabase-js'
import { getSessionContext } from '@/lib/auth/session'
import type { PlanId } from '@/lib/plans'

/**
 * Resolves which organization a server action should operate on.
 *
 * - Without `forOrgId`: returns the caller's session context (default behavior, used by
 *   admin contratantes / coordinators / members operating inside /dashboard).
 * - With `forOrgId`: asserts the caller is a super_admin, loads that org's plan, and
 *   returns it as the target. Used by the super_admin drilldown at /admin/organizations/[id]
 *   to act *as* an organization without switching sessions.
 *
 * The returned `role` is always `'super_admin'` when `forOrgId` is active — this lets
 * downstream code use the same `role !== 'super_admin'` bypass it already has for plan
 * limits, RLS, etc.
 */
export async function resolveTargetOrg(forOrgId?: string | null): Promise<{
  supabase: SupabaseClient
  orgId: string
  role: string
  plan: PlanId
  isSuperAdminOverride: boolean
  userId: string
  userName: string
}> {
  const session = await getSessionContext()

  if (!forOrgId) {
    if (!session.orgId) {
      throw new Error('Usuário não vinculado a uma organização')
    }
    return {
      supabase: session.supabase,
      orgId: session.orgId,
      role: session.role,
      plan: session.plan,
      isSuperAdminOverride: false,
      userId: session.user.id,
      userName: session.userName,
    }
  }

  // Override path: only super_admin can target a different org
  if (session.role !== 'super_admin') {
    throw new Error('Acesso restrito a super_admin')
  }

  const { data: org, error } = await session.supabase
    .from('organizations')
    .select('id, plan')
    .eq('id', forOrgId)
    .single()
  if (error || !org) {
    throw new Error('Organização não encontrada')
  }

  return {
    supabase: session.supabase,
    orgId: org.id as string,
    role: 'super_admin',
    plan: ((org.plan as string) ?? 'basic') as PlanId,
    isSuperAdminOverride: true,
    userId: session.user.id,
    userName: session.userName,
  }
}

export type TargetOrgOpts = { forOrgId?: string | null }
