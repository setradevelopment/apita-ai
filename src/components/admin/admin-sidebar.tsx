'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  LogOut,
  Shield,
  ExternalLink,
  Ticket,
} from 'lucide-react'
import { signOut } from '@/app/actions/auth'

const navItems = [
  { title: 'Visão Geral', href: '/admin', icon: LayoutDashboard, exact: true, superAdminOnly: false },
  { title: 'Organizações', href: '/admin/organizations', icon: Building2, exact: false, superAdminOnly: false },
  { title: 'Cupons', href: '/admin/coupons', icon: Ticket, exact: false, superAdminOnly: false },
]

interface AdminSidebarProps {
  userName: string
  userRole: string
}

export function AdminSidebar({ userName, userRole }: AdminSidebarProps) {
  const pathname = usePathname()
  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'

  return (
    <aside className="w-64 flex flex-col shrink-0 bg-zinc-950 text-zinc-100 border-r border-zinc-800">
      {/* Header */}
      <div className="px-5 py-5 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20">
            <Shield className="h-[18px] w-[18px] text-amber-400" />
          </div>
          <div>
            <div
              className="text-[13px] font-bold text-zinc-100 leading-none tracking-tight"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              Apita aí
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Painel do CEO</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-semibold px-3 mb-2">
          Gestão
        </div>

        {navItems.map((item) => {
          if (item.superAdminOnly && userRole !== 'super_admin') return null
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.title}
            </Link>
          )
        })}

        {/* Separator */}
        <div className="my-3 border-t border-zinc-800" />

        {/* Back to dashboard — only for admin (not super_admin) */}
        {userRole === 'admin' && (
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            Ver Dashboard
          </Link>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-zinc-800 p-3 space-y-0.5">
        {/* User info */}
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
            <span className="text-xs font-bold">{initials}</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-semibold text-zinc-200 truncate">{userName}</span>
            <span className="text-[11px] text-zinc-500">
              {userRole === 'super_admin' ? 'Super Admin' : 'Admin'}
            </span>
          </div>
        </div>

        {/* Sign out */}
        <form action={signOut}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition-colors"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sair
          </button>
        </form>
      </div>
    </aside>
  )
}
