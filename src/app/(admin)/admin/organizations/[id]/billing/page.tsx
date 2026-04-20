import { listOrgInvoices } from '@/app/actions/super-admin-billing'
import { BillingClient } from './billing-client'

export const dynamic = 'force-dynamic'

export default async function OrgBillingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const invoices = await listOrgInvoices(id)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <BillingClient orgId={id} invoices={invoices} />
    </div>
  )
}
