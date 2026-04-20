'use client'

import { usePathname } from 'next/navigation'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { MonthPicker } from '@/components/dashboard/month-picker'
import { PendingBell } from '@/components/dashboard/pending-bell'

interface Category {
  id: string
  name: string
}

function getPageTitle(pathname: string, categories: Category[]): string {
  if (pathname === '/dashboard') return 'Dashboard'
  if (pathname === '/members') return 'Membros'
  if (pathname === '/financials') return 'Financeiro'
  if (pathname === '/trainings') return 'Treinos'
  if (pathname === '/settings') return 'Configurações'
  if (pathname === '/profile') return 'Perfil'
  if (pathname.startsWith('/categories/')) {
    const id = pathname.split('/').pop()
    const cat = categories.find((c) => c.id === id)
    return cat ? cat.name : 'Categoria'
  }
  return 'Apita aí'
}

// Pages that need a month navigator in the header.
// /dashboard is intentionally excluded — it renders the picker inline, centered
// above "Visão Geral", so the date doesn't float above the subscription banner.
// /trainings also excluded — a page has its own inline MonthSelector ao lado do
// título "Gerenciador de Treinos" (owner pediu: 1 data só, evita duplicidade).
const HEADER_MONTH_PAGES = ['/categories/']

export function Header({
  categories,
  pendingCount = 0,
  paymentConfirmCount = 0,
}: {
  categories: Category[]
  /** Atletas pendentes de aprovação (`/members?tab=pending`). */
  pendingCount?: number
  /** Pagamentos marcados pelo atleta aguardando confirmação do coord. */
  paymentConfirmCount?: number
}) {
  const pathname = usePathname()
  const title = getPageTitle(pathname, categories)
  const showMonthNav = HEADER_MONTH_PAGES.some((p) => pathname.startsWith(p))

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-card px-4 shadow-[0_1px_3px_0_rgb(0_0_0/0.03)]">
      <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />

      <div className="h-5 w-px bg-border/60" />

      <div className="flex flex-1 items-center">
        <h1 className="text-sm font-semibold text-foreground/80">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        {showMonthNav && <MonthPicker />}
        {/* Sino unificado: cadastros + pagamentos pendentes. Retorna null
            se soma for 0 — comportamento esperado (nada a notificar). */}
        <PendingBell
          pendingCount={pendingCount}
          paymentConfirmCount={paymentConfirmCount}
        />
      </div>
    </header>
  )
}
