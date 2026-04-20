'use client'

import { MembersClient } from '@/app/(dashboard)/members/members-client'

interface Member {
  id: string
  name: string
  dob?: string
  cpf?: string
  user_id?: string | null
  role?: string | null
  member_categories: { category_id: string }[]
  member_category_positions: { category_id: string; position_id: string }[]
}

interface Category { id: string; name: string }
interface Position { id: string; name: string }

export function OrgMembersClient({
  orgId,
  members,
  categories,
  positions,
}: {
  orgId: string
  members: Member[]
  categories: Category[]
  positions: Position[]
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Membros
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Atletas desta organização. Para criar novos, use a aba Usuários.
        </p>
      </div>

      <MembersClient
        members={members}
        categories={categories}
        positions={positions}
        orgId={orgId}
      />
    </div>
  )
}
