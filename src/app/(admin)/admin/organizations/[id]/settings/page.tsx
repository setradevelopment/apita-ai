import { notFound } from 'next/navigation'
import { getOrganizationDetail } from '@/app/actions/super-admin'
import { OrgSettingsForm } from './settings-form'

export const dynamic = 'force-dynamic'

export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let detail
  try {
    detail = await getOrganizationDetail(id)
  } catch {
    notFound()
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Metadados da organização</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edite nome, slug, plano, status de assinatura e dados do contratante.
        </p>
      </div>

      <OrgSettingsForm org={detail.org} />
    </div>
  )
}
