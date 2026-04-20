import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, password_reset_at')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'member'

  // Second layer of protection (proxy is layer 1, RLS is layer 3)
  // Only super_admin can access /admin — regular admin (contratante) belongs in /dashboard
  if (role !== 'super_admin') {
    redirect('/dashboard')
  }

  // Forced password change after admin-initiated reset (<24h window).
  // Server component: reading current time per request is intended behavior.
  if (profile?.password_reset_at) {
    const resetAt = new Date(profile.password_reset_at).getTime()
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now()
    if (now - resetAt < 24 * 60 * 60 * 1000) {
      redirect('/change-password')
    }
  }

  const userName = profile?.name || user.email || 'Admin'

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <AdminSidebar userName={userName} userRole={role} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
