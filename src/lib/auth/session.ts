import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { PlanId, SubscriptionStatus } from '@/lib/plans'

/**
 * Returns the authenticated user's session context including their organization.
 * Redirects to /login if not authenticated or profile is missing.
 *
 * Use this in server actions and server components to get user + orgId in one call.
 */
export async function getSessionContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, organization_id, name')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  let plan: PlanId = 'basic'
  let subscriptionStatus: SubscriptionStatus = 'active'

  if (profile.organization_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('plan, subscription_status')
      .eq('id', profile.organization_id)
      .single()
    if (org) {
      plan = (org.plan as PlanId) ?? 'basic'
      subscriptionStatus = (org.subscription_status as SubscriptionStatus) ?? 'active'
    }
  }

  return {
    supabase,
    user,
    role: profile.role as string,
    orgId: profile.organization_id as string | null,
    userName: profile.name as string,
    plan,
    subscriptionStatus,
  }
}
