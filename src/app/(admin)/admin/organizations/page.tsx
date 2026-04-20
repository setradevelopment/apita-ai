import { Suspense } from 'react'
import { listOrganizations } from '@/app/actions/super-admin'
import { OrganizationsClient } from './organizations-client'

export default async function OrganizationsPage() {
  const organizations = await listOrganizations()

  return (
    <div className="p-8">
      <Suspense fallback={null}>
        <OrganizationsClient organizations={organizations} />
      </Suspense>
    </div>
  )
}
