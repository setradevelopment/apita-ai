'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Settings,
  UserCog,
  Receipt,
  Users,
  FolderOpen,
  UsersRound,
  CalendarClock,
} from 'lucide-react'

interface NavTab {
  href: string
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
}

export function OrgDrilldownNav({ orgId }: { orgId: string }) {
  const base = `/admin/organizations/${orgId}`
  const pathname = usePathname()

  const tabs: NavTab[] = [
    { href: base, label: 'Visão geral', icon: LayoutDashboard, exact: true },
    { href: `${base}/settings`, label: 'Metadados', icon: Settings },
    { href: `${base}/admin-user`, label: 'Admin contratante', icon: UserCog },
    { href: `${base}/billing`, label: 'Parcelas', icon: Receipt },
    { href: `${base}/users`, label: 'Usuários', icon: Users },
    { href: `${base}/categories`, label: 'Categorias', icon: FolderOpen },
    { href: `${base}/members`, label: 'Membros', icon: UsersRound },
    { href: `${base}/trainings`, label: 'Treinos', icon: CalendarClock },
  ]

  return (
    <nav className="px-6 flex items-center gap-0.5 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href)
        const Icon = tab.icon
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap transition-colors relative ${
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
