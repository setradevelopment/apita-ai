import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { getOrganizationDetail } from '@/app/actions/super-admin'
import { OrgDrilldownNav } from './nav'

export const dynamic = 'force-dynamic'

export default async function OrgDrilldownLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  let detail
  try {
    detail = await getOrganizationDetail(id)
  } catch {
    notFound()
  }

  const { org, counts } = detail

  return (
    <div className="flex flex-col min-h-screen">
      {/* Breadcrumb + header */}
      <div className="border-b border-border/50 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="px-6 py-3.5 flex items-center gap-2 text-sm">
          <Link
            href="/admin/organizations"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Organizações
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-6 w-6 shrink-0 flex items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
              {org.name.slice(0, 2).toUpperCase()}
            </div>
            <span className="font-semibold truncate">{org.name}</span>
            <span className="text-[11px] font-mono text-muted-foreground truncate">
              {org.slug}
            </span>
          </div>
          {counts.openInvoicesCount > 0 && (
            <span className="ml-auto text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium whitespace-nowrap">
              {counts.openInvoicesCount} parcela{counts.openInvoicesCount > 1 ? 's' : ''} em aberto
            </span>
          )}
        </div>

        <OrgDrilldownNav orgId={id} />
      </div>

      {/* Page content */}
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}
