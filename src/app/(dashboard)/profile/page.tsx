import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileClient } from './profile-client'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, organization_id')
    .eq('id', user.id)
    .single()

  let orgLogoUrl: string | null = null
  if (profile?.organization_id) {
    const { data: org } = await supabase
      .from('organizations')
      .select('logo_url')
      .eq('id', profile.organization_id)
      .single()
    orgLogoUrl = (org?.logo_url as string | null) ?? null
  }

  return (
    <ProfileClient
      name={profile?.name ?? ''}
      email={user.email ?? ''}
      role={profile?.role ?? ''}
      orgLogoUrl={orgLogoUrl}
    />
  )
}
