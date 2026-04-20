import { notFound } from 'next/navigation'
import { getOrganizationAdminUser } from '@/app/actions/super-admin'
import { AdminUserForm } from './admin-user-form'
import { AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function OrgAdminUserPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let adminUser
  try {
    adminUser = await getOrganizationAdminUser(id)
  } catch {
    notFound()
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Admin contratante</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edite os dados do administrador principal desta organização e, se necessário, gere
          uma nova senha temporária.
        </p>
      </div>

      {!adminUser.userId ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-amber-900">
              Nenhum admin vinculado a esta organização
            </h2>
            <p className="text-xs text-amber-800/90 mt-1.5">
              Esta organização ainda não possui um usuário com papel <strong>admin</strong>.
              Defina um em <code className="px-1 py-0.5 rounded bg-amber-100 font-mono text-[11px]">
              Usuários
              </code>{' '}
              ou crie um novo por lá para habilitar esta tela.
            </p>
          </div>
        </div>
      ) : (
        <AdminUserForm orgId={id} initial={adminUser} />
      )}
    </div>
  )
}
