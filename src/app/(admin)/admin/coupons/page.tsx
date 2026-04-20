import { Suspense } from 'react'
import { listCoupons } from '@/app/actions/coupons'
import { CouponsClient } from './coupons-client'

export default async function CouponsPage() {
  const coupons = await listCoupons()

  return (
    <div className="p-8">
      <Suspense fallback={null}>
        <CouponsClient coupons={coupons} />
      </Suspense>
    </div>
  )
}
