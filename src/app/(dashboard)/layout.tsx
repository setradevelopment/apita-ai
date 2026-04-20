import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AlertTriangle } from 'lucide-react'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/dashboard/app-sidebar'
import { Header } from '@/components/dashboard/header'
import { PendingApprovalShell } from '@/components/dashboard/pending-approval-shell'
import { TooltipProvider } from '@/components/ui/tooltip'
import { createClient } from '@/lib/supabase/server'
import { countPendingMembers } from '@/app/actions/pending-members'
import { countPendingConfirmations } from '@/app/actions/athlete-payments'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, organization_id, password_reset_at, profile_completed_at')
    .eq('id', user.id)
    .single()

  // Forced password change: if an admin reset this user's password in the last
  // 24h and they haven't changed it yet, block access until they do.
  // Server component: reading current time per request is intended behavior.
  if (profile?.password_reset_at) {
    const resetAt = new Date(profile.password_reset_at).getTime()
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now()
    if (now - resetAt < 24 * 60 * 60 * 1000) {
      redirect('/change-password')
    }
  }

  // Redirect super_admin to the admin panel
  const role = profile?.role ?? 'member'
  if (role === 'super_admin') {
    redirect('/admin')
  }

  // Onboarding obrigatório: coordenador/contratante pode criar um usuário
  // só com e-mail. No 1º acesso o próprio usuário completa nome, DOB, CPF,
  // RG e logística em `/onboarding`. Enquanto `profile_completed_at` é NULL,
  // o dashboard fica bloqueado. Super_admin já saiu acima; contratantes
  // existentes foram marcados no backfill (migration 027).
  if (!profile?.profile_completed_at) {
    redirect('/onboarding')
  }

  const orgId = profile?.organization_id

  // Fetch org for subscription status banner + logo + name (nome é usado
  // também pelo PendingApprovalShell logo abaixo).
  let subscriptionStatus: string = 'active'
  let orgLogoUrl: string | null = null
  let orgName: string = ''
  if (orgId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name, subscription_status, logo_url')
      .eq('id', orgId)
      .single()
    subscriptionStatus = org?.subscription_status ?? 'active'
    orgLogoUrl = (org?.logo_url as string | null) ?? null
    orgName = (org?.name as string | null) ?? ''
  }

  // Gate de aprovação de atleta. Se o user logado é `role='member'` e seu
  // row em `members` ainda não foi aprovado, renderiza uma tela especial
  // (sem sidebar/header) pedindo pra aguardar o coord. Esse fluxo só roda
  // pra atletas que entraram via link de convite — admin/coord criados por
  // outro admin já nascem aprovados (backfilled na migration 029).
  if (role === 'member' && orgId) {
    const { data: member } = await supabase
      .from('members')
      .select('approved_at')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .maybeSingle()
    if (member && !member.approved_at) {
      return (
        <PendingApprovalShell
          userName={profile?.name || user.email || 'atleta'}
          orgName={orgName || 'sua organização'}
        />
      )
    }
  }

  // Contadores pro sino unificado do header:
  //   • cadastros pendentes (/members?tab=pending)
  //   • pagamentos aguardando confirmação (/financials)
  // Ambas actions já retornam 0 pra roles sem permissão — buscamos em
  // paralelo pra evitar cascata sequencial.
  const [pendingCount, paymentConfirmCount] = await Promise.all([
    countPendingMembers(),
    countPendingConfirmations(),
  ])

  // Categories filtered by organization (RLS also enforces this, defense in depth).
  // Também seleciona `logo_url` pra o sidebar renderizar ícone mínimo ao lado
  // do nome da categoria (ou fallback pra inicial quando sem logo).
  const categoriesQuery = supabase
    .from('categories')
    .select('id, name, logo_url')
    .order('display_order')
    .order('name')
  if (orgId) categoriesQuery.eq('organization_id', orgId)
  const { data: categories } = await categoriesQuery

  const userName = profile?.name || user.email || 'Usuário'
  const userRole = role
  let categoryList = categories ?? []

  // Pro atleta, filtra o menu pra mostrar SÓ as categorias em que ele
  // efetivamente participa. Admin/coord seguem vendo tudo da org (precisam
  // gerenciar). Escopo via `member_categories` (linkagem N:N).
  if (role === 'member' && orgId && categoryList.length > 0) {
    const { data: myMembers } = await supabase
      .from('members')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
    const memberIds = (myMembers ?? []).map((m) => m.id)
    if (memberIds.length === 0) {
      categoryList = []
    } else {
      const { data: myLinks } = await supabase
        .from('member_categories')
        .select('category_id')
        .in('member_id', memberIds)
      const myCategoryIds = new Set((myLinks ?? []).map((l) => l.category_id as string))
      categoryList = categoryList.filter((c) => myCategoryIds.has(c.id))
    }
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          userName={userName}
          userRole={userRole}
          categories={categoryList}
          orgLogoUrl={orgLogoUrl}
          pendingCount={pendingCount}
        />
        {/*
          `min-w-0` é crítico: SidebarInset usa `flex w-full flex-1` mas sem
          `min-w-0` os filhos flex ignoram o `overflow-auto` do <main> abaixo
          quando algum conteúdo (ex.: tabela de /members com muitas colunas)
          é mais largo que a viewport. Sem isso o <main> infla e empurra o
          banner sticky para fora do sidebar, bagunçando a UI inteira.
        */}
        <SidebarInset className="min-w-0">
          <Suspense fallback={null}>
            <Header
              categories={categoryList}
              pendingCount={pendingCount}
              paymentConfirmCount={paymentConfirmCount}
            />
          </Suspense>
          {subscriptionStatus === 'pending_payment' && (
            <div className="sticky top-0 z-20 flex items-start gap-3 px-6 py-3 bg-amber-50 border-b border-amber-200 text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
              <div className="flex-1 text-sm">
                <strong className="font-semibold">Assinatura pendente de ativação.</strong>{' '}
                Sua organização ainda não teve o pagamento confirmado. Algumas funcionalidades podem
                ser bloqueadas.{' '}
                <a
                  href="https://wa.me/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-medium hover:text-amber-950"
                >
                  Falar com suporte
                </a>
              </div>
            </div>
          )}
          {subscriptionStatus === 'suspended' && (
            <div className="sticky top-0 z-20 flex items-start gap-3 px-6 py-3 bg-red-50 border-b border-red-200 text-red-900">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-red-600" />
              <div className="flex-1 text-sm">
                <strong className="font-semibold">Assinatura suspensa.</strong>{' '}
                Entre em contato com o suporte para reativar sua conta.
              </div>
            </div>
          )}
          {/*
            `min-w-0` + `overflow-auto` na mesma caixa — sem o min-w-0 o flex
            item cresce com o conteúdo e quebra o confinamento. Com min-w-0,
            o overflow-x se resolve em containers internos (ex.: o
            `overflow-x-auto` da tabela de /members), não no viewport.
          */}
          <main className="flex-1 min-w-0 overflow-auto p-6">{children}</main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
