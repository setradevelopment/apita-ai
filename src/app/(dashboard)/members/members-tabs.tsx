'use client'

import Link from 'next/link'
import { Users, UserPlus } from 'lucide-react'

/**
 * Barra de abas "Ativos" / "Pendentes" no topo de /members.
 *
 * Navega via `<Link>` (mudança de URL) em vez de estado client — isso
 * preserva deep-linking (`?tab=pending&id=X`) e o SSR carrega a lista
 * correta sem re-render. Mais rápido que state client quando o tab muda
 * a base de dados exibida.
 */
export function MembersTabs({
  activeTab,
  pendingCount,
}: {
  activeTab: 'active' | 'pending'
  pendingCount: number
}) {
  return (
    <div className="flex gap-0 border-b border-border/40">
      <Link
        href="/members"
        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
          activeTab === 'active'
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
        }`}
      >
        <Users className="h-3.5 w-3.5" />
        Ativos
      </Link>

      <Link
        href="/members?tab=pending"
        className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
          activeTab === 'pending'
            ? 'border-amber-500 text-amber-700'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
        }`}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Pendentes
        <span
          className={`ml-0.5 text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center ${
            activeTab === 'pending'
              ? 'bg-amber-500 text-white'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          {pendingCount}
        </span>
      </Link>
    </div>
  )
}
