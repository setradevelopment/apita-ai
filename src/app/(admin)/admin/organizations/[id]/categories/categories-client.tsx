'use client'

import { CategoriesSection } from '@/app/(dashboard)/settings/categories-section'

export function OrgCategoriesClient({
  orgId,
  categories,
  planName,
  categoryCount,
  maxCategories,
}: {
  orgId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categories: any[]
  planName: string
  categoryCount: number
  maxCategories: number
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Categorias
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          CRUD de categorias, preços e dias de treino. Limites do plano não se aplicam ao super_admin.
        </p>
      </div>

      <CategoriesSection
        categories={categories}
        planName={planName}
        categoryCount={categoryCount}
        maxCategories={maxCategories}
        bypassLimits={true}
        orgId={orgId}
      />
    </div>
  )
}
