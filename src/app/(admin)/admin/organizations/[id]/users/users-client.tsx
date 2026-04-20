'use client'

import { UsersSection } from '@/app/(dashboard)/settings/users-section'
import type { PlatformUser } from '@/app/actions/admin-users'

interface Category { id: string; name: string }
interface Position { id: string; name: string }

export function OrgUsersClient({
  orgId,
  users,
  categories,
  positions,
  initialUserId,
  planName,
  memberCount,
  maxMembers,
  orgSlug,
}: {
  orgId: string
  users: PlatformUser[]
  categories: Category[]
  positions: Position[]
  initialUserId?: string
  planName: string
  memberCount: number
  maxMembers: number
  orgSlug: string | null
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Usuários da organização
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Coordenadores e atletas desta organização. As ações rodam com privilégios de super_admin.
        </p>
      </div>

      <UsersSection
        users={users}
        categories={categories}
        positions={positions}
        initialUserId={initialUserId}
        planName={planName}
        memberCount={memberCount}
        maxMembers={maxMembers}
        bypassLimits={true}
        orgId={orgId}
        orgSlug={orgSlug}
      />
    </div>
  )
}
