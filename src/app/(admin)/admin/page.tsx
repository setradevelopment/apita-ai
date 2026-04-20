import type { ReactNode } from 'react'
import { Building2, Users, CheckCircle2, XCircle, ShieldCheck, UsersRound } from 'lucide-react'
import Link from 'next/link'
import { listOrganizations, listAllUsersForAdmin } from '@/app/actions/super-admin'
import { ResetPanel } from './reset-panel'
import { PLAN_LIST } from '@/lib/plans'

export default async function AdminOverviewPage() {
  const [organizations, users] = await Promise.all([
    listOrganizations(),
    listAllUsersForAdmin(),
  ])

  const activeOrgs = organizations.filter((o) => o.active).length
  const inactiveOrgs = organizations.filter((o) => !o.active).length

  const byRole = {
    admin: users.filter((u) => u.role === 'admin').length,
    coordinator: users.filter((u) => u.role === 'coordinator').length,
    member: users.filter((u) => u.role === 'member').length,
  }

  const planCounts = organizations.reduce<Record<string, number>>((acc, o) => {
    acc[o.plan] = (acc[o.plan] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="p-8 space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Visão Geral</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Resumo de toda a plataforma SaaS
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Building2 className="h-4 w-4 text-primary" />}
          iconBg="bg-primary/10"
          label="Organizações"
          value={organizations.length}
          detail={
            <span className="flex items-center gap-2.5">
              <span className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="h-3 w-3" /> {activeOrgs}
              </span>
              <span className="flex items-center gap-1 text-destructive">
                <XCircle className="h-3 w-3" /> {inactiveOrgs}
              </span>
            </span>
          }
        />
        <StatCard
          icon={<Users className="h-4 w-4 text-blue-500" />}
          iconBg="bg-blue-500/10"
          label="Total Usuários"
          value={users.length}
          detail={
            <span>
              {byRole.member} atletas · {byRole.coordinator} coord.
            </span>
          }
        />
        <StatCard
          icon={<ShieldCheck className="h-4 w-4 text-amber-500" />}
          iconBg="bg-amber-500/10"
          label="Administradores"
          value={byRole.admin}
          detail={<span>Contratantes de clube</span>}
        />
        <StatCard
          icon={<UsersRound className="h-4 w-4 text-purple-500" />}
          iconBg="bg-purple-500/10"
          label="Coordenadores"
          value={byRole.coordinator}
          detail={<span>Gestores internos</span>}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent organizations */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Organizações Recentes</h2>
            <Link
              href="/admin/organizations"
              className="text-xs text-primary hover:underline underline-offset-2"
            >
              Ver todas
            </Link>
          </div>
          {organizations.length === 0 ? (
            <EmptyCard message="Nenhuma organização cadastrada." />
          ) : (
            <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
              {organizations.slice(0, 5).map((org, i) => (
                <div
                  key={org.id}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i < Math.min(organizations.length, 5) - 1
                      ? 'border-b border-border/30'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                      {org.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{org.name}</div>
                      <div className="text-xs text-muted-foreground">{org.slug}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        org.active
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {org.active ? 'Ativa' : 'Inativa'}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium capitalize">
                      {org.plan}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Plan distribution */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Distribuição de Planos</h2>
          </div>
          <div className="bg-card rounded-xl border border-border/50 p-5 space-y-3">
            {PLAN_LIST.map((plan) => {
              const count = planCounts[plan.id] ?? 0
              const pct = organizations.length > 0
                ? Math.round((count / organizations.length) * 100)
                : 0
              return (
                <div key={plan.id}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{plan.name}</span>
                    <span className="text-muted-foreground">
                      {count} org{count !== 1 ? 's' : ''} · {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {organizations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Nenhuma organização cadastrada.
              </p>
            )}
          </div>
        </section>
      </div>

      <ResetPanel />
    </div>
  )
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  detail,
}: {
  icon: ReactNode
  iconBg: string
  label: string
  value: number
  detail: ReactNode
}) {
  return (
    <div className="bg-card rounded-xl border border-border/50 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-9 w-9 flex items-center justify-center rounded-lg ${iconBg}`}>
          {icon}
        </div>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="mt-1.5 text-xs text-muted-foreground">{detail}</div>
    </div>
  )
}

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="bg-card rounded-xl border border-dashed border-border/60 py-10 flex items-center justify-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
