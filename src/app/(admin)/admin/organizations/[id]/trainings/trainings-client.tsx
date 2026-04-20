'use client'

import { TrainingsClient } from '@/app/(dashboard)/trainings/trainings-client'
import { MonthSelector } from '@/components/admin/month-selector'
import { LiveRefresh } from '@/components/admin/live-refresh'

interface Category {
  id: string
  name: string
  logo_url?: string | null
  location?: string | null
  start_time?: string | null
  end_time?: string | null
  has_drop_in: boolean
  has_weekly: boolean
  has_monthly: boolean
  has_semiannual: boolean
  has_annual: boolean
}

interface Training {
  id: string
  category_id: string
  date: string
  status: string
  cancellation_reason?: string | null
}

interface MemberCategory {
  member_id: string
  category_id: string
  members: { id: string; name: string } | { id: string; name: string }[] | null
}

interface Attendance {
  training_id: string
  member_id: string
  status: string
  payment_type: string | null
  payment_status: string | null
}

interface MonthlyPayment {
  id: string
  member_id: string
  category_id: string
  month: number
  year: number
  is_monthly_payer: boolean
  payment_status: string | null
  payment_note: string | null
}

export function OrgTrainingsClient({
  categories,
  trainings,
  memberCategories,
  attendances,
  monthlyPayments,
  month,
  year,
  selectedCategoryId,
}: {
  categories: Category[]
  trainings: Training[]
  memberCategories: MemberCategory[]
  attendances: Attendance[]
  monthlyPayments: MonthlyPayment[]
  month: number
  year: number
  selectedCategoryId: string | null
}) {
  return (
    <>
      {/* Live Realtime subscriber — reflete mudanças do ambiente do contratante */}
      <LiveRefresh tables="trainings,member_attendances,member_categories,members,categories,monthly_payments" />

      <div className="flex items-center gap-2">
        <MonthSelector month={month} year={year} />
        <span className="text-[11px] text-muted-foreground/70 ml-1">
          Sincronizado em tempo real
        </span>
      </div>

      <TrainingsClient
        categories={categories}
        trainings={trainings}
        memberCategories={memberCategories}
        attendances={attendances}
        monthlyPayments={monthlyPayments}
        month={month}
        year={year}
        selectedCategoryId={selectedCategoryId}
      />
    </>
  )
}
