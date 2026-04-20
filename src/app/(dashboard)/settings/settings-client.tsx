'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LayoutDashboard, Tag, Shield, Users, Settings2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CategoriesSection } from './categories-section'
import { PositionsSection } from './positions-section'
import { UsersSection } from './users-section'
import { GeneralSection } from './general-section'
import type { PlatformUser } from '@/app/actions/admin-users'

type Section = 'general' | 'categories' | 'positions' | 'users'
type Destination = Section | 'home'

interface NavItem {
  id: Destination
  label: string
  icon: React.ElementType
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home',       label: 'Página Inicial', icon: LayoutDashboard },
  { id: 'general',    label: 'Geral',          icon: Settings2, adminOnly: true },
  { id: 'categories', label: 'Categorias',     icon: Tag             },
  { id: 'positions',  label: 'Posições',        icon: Shield          },
  { id: 'users',      label: 'Usuários',        icon: Users, adminOnly: true },
]

const SECTION_META: Record<Section, { title: string; description: string }> = {
  general: {
    title: 'Geral',
    description: 'Identidade visual e informações gerais da organização',
  },
  categories: {
    title: 'Categorias',
    description: 'Gerencie as categorias de treino e modalidades de pagamento',
  },
  positions: {
    title: 'Posições',
    description: 'Gerencie as posições disponíveis para atribuir aos atletas',
  },
  users: {
    title: 'Usuários',
    description: 'Gerencie os usuários da plataforma, dados pessoais e acesso',
  },
}

export function SettingsClient({
  categories,
  positions,
  users,
  planName,
  categoryCount,
  maxCategories,
  memberCount,
  maxMembers,
  bypassLimits,
  orgLogoUrl,
  orgSlug,
  isAdmin,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categories: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  positions: any[]
  users: PlatformUser[]
  planName: string
  categoryCount: number
  maxCategories: number
  memberCount: number
  maxMembers: number
  bypassLimits: boolean
  orgLogoUrl: string | null
  orgSlug: string | null
  isAdmin: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Read initial section and user id from URL params (e.g. from members page redirect)
  const urlSection = (searchParams.get('section') as Section) ?? null
  const urlUserId  = searchParams.get('id') ?? undefined

  const [activeSection, setActiveSection] = useState<Section>(
    urlSection ?? 'categories'
  )
  const [isDirty, setIsDirty] = useState(false)
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [pendingDest, setPendingDest] = useState<Destination | null>(null)

  function handleNavClick(dest: Destination) {
    if (dest !== 'home' && dest === activeSection) return
    if (isDirty) {
      setPendingDest(dest)
      setShowLeaveDialog(true)
      return
    }
    go(dest)
  }

  function go(dest: Destination) {
    if (dest === 'home') {
      router.push('/dashboard')
    } else {
      setActiveSection(dest)
      setIsDirty(false)
    }
  }

  function confirmLeave() {
    setShowLeaveDialog(false)
    setIsDirty(false)
    if (pendingDest) go(pendingDest)
    setPendingDest(null)
  }

  function cancelLeave() {
    setShowLeaveDialog(false)
    setPendingDest(null)
  }

  const meta = SECTION_META[activeSection]
  const canManageUsers = users.length > 0 || urlSection === 'users'

  return (
    <>
      <div className="flex gap-0 fade-in min-h-full">
        {/* ─── Left navigation ─────────────────────────────── */}
        <aside className="w-48 shrink-0 border-r border-border/50 pr-3 pt-1 space-y-0.5">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/40 px-3 pb-2">
            Menu
          </p>
          {NAV_ITEMS.filter((item) => {
            // 'general' is admin/super_admin only — coordinators don't see it.
            if (item.id === 'general') return isAdmin
            // Other adminOnly items follow the broader "can manage users" rule
            // (admin + coordinator + super_admin).
            if (item.adminOnly) return canManageUsers
            return true
          }).map((item) => {
            const isActive = item.id !== 'home' && item.id === activeSection
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            )
          })}
        </aside>

        {/* ─── Right content ───────────────────────────────── */}
        <div className="flex-1 pl-7 min-w-0">
          <div className="mb-5">
            <h2
              className="text-xl font-semibold tracking-tight"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              {meta.title}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">{meta.description}</p>
          </div>

          {activeSection === 'general' && (
            <GeneralSection logoUrl={orgLogoUrl} canEdit={isAdmin} />
          )}
          {activeSection === 'categories' && (
            <CategoriesSection
              categories={categories}
              onDirtyChange={setIsDirty}
              planName={planName}
              categoryCount={categoryCount}
              maxCategories={maxCategories}
              bypassLimits={bypassLimits}
            />
          )}
          {activeSection === 'positions' && (
            <PositionsSection positions={positions} onDirtyChange={setIsDirty} />
          )}
          {activeSection === 'users' && (
            <UsersSection
              users={users}
              categories={categories}
              positions={positions}
              initialUserId={urlUserId}
              onDirtyChange={setIsDirty}
              planName={planName}
              memberCount={memberCount}
              maxMembers={maxMembers}
              bypassLimits={bypassLimits}
              orgSlug={orgSlug}
            />
          )}
        </div>
      </div>

      {/* ─── Unsaved-changes confirmation ────────────────── */}
      <Dialog open={showLeaveDialog} onOpenChange={cancelLeave}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Outfit', sans-serif" }}>
              Alterações não salvas
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Você tem alterações em andamento. Deseja sair sem salvar?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={cancelLeave} className="h-9">
              Continuar editando
            </Button>
            <Button variant="destructive" onClick={confirmLeave} className="h-9">
              Sair sem salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
