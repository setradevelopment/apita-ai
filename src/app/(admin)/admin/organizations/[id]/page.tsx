import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  Crown,
  Activity,
  FolderOpen,
  UsersRound,
  Users,
  CalendarClock,
  Receipt,
  AlertCircle,
  Calendar,
  Hash,
} from 'lucide-react'
import { getOrganizationDetail } from '@/app/actions/super-admin'
import { PLANS, formatPrice, type PlanId } from '@/lib/plans'
import { parseMonthParam } from '@/lib/month'
import { createAdminClient } from '@/lib/supabase/admin'
import { OperationalOverview } from '@/components/dashboard/operational-overview'

export const dynamic = 'force-dynamic'

const SUB_STATUS_LABELS = {
  pending_payment: 'Pagamento pendente',
  active: 'Ativa',
  suspended: 'Suspensa',
  cancelled: 'Cancelada',
} as const

const SUB_STATUS_STYLES = {
  pending_payment: 'bg-amber-100 text-amber-700 border-amber-200',
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  suspended: 'bg-slate-100 text-slate-700 border-slate-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
} as const

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export default async function OrgOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ m?: string; cat?: string }>
}) {
  const { id } = await params
  const { m, cat } = await searchParams

  let detail
  try {
    detail = await getOrganizationDetail(id)
  } catch {
    notFound()
  }

  const { org, counts } = detail
  const planDef = PLANS[(org.plan as PlanId) ?? 'basic'] ?? PLANS.basic
  const status = org.subscription_status ?? 'active'

  // Operational view mirrors the admin's /dashboard experience so the super_admin
  // can "feel" each organization without switching sessions. Uses the service-role
  // client — RLS bypass is safe here since getOrganizationDetail already asserted
  // super_admin, and the component still scopes every query to `organization_id`.
  const { month, year } = parseMonthParam(m)
  const selectedCategoryId = cat || null
  const adminSupabase = createAdminClient()
  // Category/trainings links inside the drilldown should stay within the drilldown
  const drilldownBase = `/admin/organizations/${id}`

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1.5">
          <h1 className="text-2xl font-bold text-foreground">Visão geral</h1>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
              org.active
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-red-50 text-red-700 border-red-200'
            }`}
          >
            {org.active ? 'Ativa' : 'Inativa'}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium border ${SUB_STATUS_STYLES[status]}`}
          >
            {SUB_STATUS_LABELS[status]}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Resumo da organização · {org.name}
        </p>
      </div>

      {/* Overdue banner */}
      {counts.openInvoicesCount > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-amber-100">
            <AlertCircle className="h-4 w-4 text-amber-700" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-amber-900">
              {counts.openInvoicesCount} parcela{counts.openInvoicesCount > 1 ? 's' : ''} em aberto
              {counts.openInvoicesSum > 0 && ` · ${formatPrice(counts.openInvoicesSum)}`}
            </div>
            <div className="text-xs text-amber-700/80">
              Confira o histórico financeiro da organização na aba Parcelas.
            </div>
          </div>
          <Link
            href={`/admin/organizations/${id}/billing`}
            className="text-xs font-medium text-amber-800 hover:text-amber-900 px-3 py-1.5 rounded-md border border-amber-300 bg-white/50 hover:bg-white transition-colors"
          >
            Ver parcelas
          </Link>
        </div>
      )}

      {/* Operational overview — same view the admin contratante sees at /dashboard */}
      <section className="pt-2">
        <OperationalOverview
          supabase={adminSupabase}
          orgId={id}
          forOrgId={id}
          month={month}
          year={year}
          selectedCategoryId={selectedCategoryId}
          categoriesHref={`${drilldownBase}/categories`}
          trainingsHref={`${drilldownBase}/trainings`}
          categoryLinkPrefix={`${drilldownBase}/categories`}
          showHeading={false}
        />
      </section>

      {/* Divider */}
      <div className="border-t border-border/40 pt-2">
        <h2 className="text-sm font-semibold text-foreground">Informações contratuais</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Dados do SaaS (visíveis apenas para super_admin).</p>
      </div>

      {/* Contract summary */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-card rounded-xl border border-border/50 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Crown className="h-4 w-4 text-amber-500" />
            Contrato
          </div>
          <dl className="space-y-2.5 text-sm">
            <InfoRow label="Plano" value={`${planDef.name} · ${formatPrice(planDef.price)}`} />
            <InfoRow label="Status" value={SUB_STATUS_LABELS[status]} />
            <InfoRow label="Cupom" value={org.coupon_code ?? '—'} mono />
            <InfoRow label="Criada em" value={formatDate(org.created_at)} />
          </dl>
        </div>

        <div className="bg-card rounded-xl border border-border/50 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-blue-500" />
            Contratante
          </div>
          <dl className="space-y-2.5 text-sm">
            <InfoRow label="Responsável" value={org.responsible_name ?? '—'} />
            <InfoRow
              label="WhatsApp"
              value={org.whatsapp ? formatWhatsapp(org.whatsapp) : '—'}
              mono
            />
            <InfoRow
              label="Documento"
              value={formatDocument(org.document, org.document_type)}
              mono
            />
            <InfoRow label="E-mail de cadastro" value={org.signup_email ?? '—'} />
          </dl>
        </div>
      </section>

      {/* Usage metrics */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Uso da plataforma</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            icon={<FolderOpen className="h-4 w-4 text-violet-500" />}
            iconBg="bg-violet-500/10"
            label="Categorias"
            value={counts.categories}
            limit={planDef.max_categories}
          />
          <MetricCard
            icon={<UsersRound className="h-4 w-4 text-blue-500" />}
            iconBg="bg-blue-500/10"
            label="Membros ativos"
            value={counts.members}
            limit={planDef.max_members}
          />
          <MetricCard
            icon={<Users className="h-4 w-4 text-emerald-500" />}
            iconBg="bg-emerald-500/10"
            label="Usuários"
            value={counts.users}
          />
          <MetricCard
            icon={<CalendarClock className="h-4 w-4 text-orange-500" />}
            iconBg="bg-orange-500/10"
            label="Treinos cadastrados"
            value={counts.trainings}
          />
        </div>
      </section>

      {/* Financial summary */}
      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Financeiro</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href={`/admin/organizations/${id}/billing`}
            className="group bg-card rounded-xl border border-border/50 p-5 hover:border-primary/40 hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-rose-500/10">
                <Receipt className="h-4 w-4 text-rose-500" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">
                Parcelas em aberto
              </span>
            </div>
            <div className="text-3xl font-bold">{counts.openInvoicesCount}</div>
            {counts.openInvoicesSum > 0 && (
              <div className="mt-1.5 text-xs text-muted-foreground">
                Total: {formatPrice(counts.openInvoicesSum)}
              </div>
            )}
            <div className="mt-4 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
              Abrir parcelas →
            </div>
          </Link>

          <div className="bg-card rounded-xl border border-border/50 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 flex items-center justify-center rounded-lg bg-muted">
                <Hash className="h-4 w-4 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium text-muted-foreground">Identificadores</span>
            </div>
            <dl className="space-y-2 text-xs">
              <InfoRow
                label="ID"
                value={<code className="font-mono text-[11px]">{org.id}</code>}
              />
              <InfoRow
                label="Slug"
                value={<code className="font-mono text-[11px]">{org.slug}</code>}
              />
              <InfoRow
                label="Atualizada em"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {formatDate(org.updated_at)}
                  </span>
                }
              />
            </dl>
          </div>
        </div>
      </section>
    </div>
  )
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string
  value: ReactNode
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
      <dd className={`text-sm text-foreground text-right truncate ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </div>
  )
}

function MetricCard({
  icon,
  iconBg,
  label,
  value,
  limit,
}: {
  icon: ReactNode
  iconBg: string
  label: string
  value: number
  limit?: number
}) {
  const pct = limit ? Math.min(100, Math.round((value / limit) * 100)) : null
  const nearLimit = pct !== null && pct >= 80
  return (
    <div className="bg-card rounded-xl border border-border/50 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-9 w-9 flex items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
      {limit !== undefined && pct !== null && (
        <>
          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                nearLimit ? 'bg-amber-500' : 'bg-primary'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground">
            {value} / {limit} <span className="opacity-70">({pct}%)</span>
          </div>
        </>
      )}
    </div>
  )
}

function formatDocument(raw: string | null, type: string | null): string {
  if (!raw) return '—'
  const d = raw.replace(/\D/g, '')
  if (type === 'cpf' && d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }
  if (type === 'cnpj' && d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }
  return d
}

function formatWhatsapp(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
