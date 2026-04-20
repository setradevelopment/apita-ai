'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Trash2,
  Building2,
  X,
  Loader2,
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  createOrganization,
  deleteOrganization,
  type Organization,
} from '@/app/actions/super-admin'
import { PLANS, PLAN_LIST, formatPrice, type PlanId } from '@/lib/plans'

// ── Constants ──────────────────────────────────────────────────────────────────

type SubStatus = 'pending_payment' | 'active' | 'suspended' | 'cancelled'

const STATUS_LABELS: Record<SubStatus, string> = {
  pending_payment: 'Pagto pendente',
  active: 'Ativa',
  suspended: 'Suspensa',
  cancelled: 'Cancelada',
}

const STATUS_STYLES: Record<SubStatus, string> = {
  pending_payment: 'bg-amber-100 text-amber-700 border-amber-200',
  active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  suspended: 'bg-slate-100 text-slate-700 border-slate-200',
  cancelled: 'bg-red-100 text-red-700 border-red-200',
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface CreateForm {
  name: string
  slug: string
  plan: PlanId
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const emptyCreateForm: CreateForm = {
  name: '',
  slug: '',
  plan: 'basic',
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
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

function formatWhatsapp(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function OrganizationsClient({
  organizations,
}: {
  organizations: Organization[]
}) {
  const router = useRouter()
  const { confirm, alert } = useConfirm()
  const [isPending, startTransition] = useTransition()

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<CreateForm>(emptyCreateForm)
  const [formError, setFormError] = useState('')

  function openCreate() {
    setForm(emptyCreateForm)
    setFormError('')
    setCreateOpen(true)
  }

  function closeCreate() {
    setCreateOpen(false)
    setFormError('')
  }

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: slugify(name) }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.slug.trim()) {
      setFormError('Nome e slug são obrigatórios.')
      return
    }
    setFormError('')
    startTransition(async () => {
      try {
        await createOrganization({
          name: form.name.trim(),
          slug: form.slug.trim(),
          plan: form.plan,
        })
        closeCreate()
        router.refresh()
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : 'Erro ao criar organização.')
      }
    })
  }

  async function handleDelete(e: React.MouseEvent, id: string, name: string) {
    e.preventDefault()
    e.stopPropagation()
    const ok = await confirm({
      title: `Excluir a organização "${name}"?`,
      description: 'Todos os dados vinculados (atletas, treinos, pagamentos) serão removidos. Essa ação não pode ser desfeita.',
      variant: 'destructive',
      confirmLabel: 'Excluir organização',
    })
    if (!ok) return
    startTransition(async () => {
      try {
        await deleteOrganization(id)
        router.refresh()
      } catch (err: unknown) {
        await alert({
          title: 'Erro ao excluir organização',
          description: err instanceof Error ? err.message : 'Erro desconhecido.',
          variant: 'destructive',
        })
      }
    })
  }

  function goToDrilldown(orgId: string) {
    router.push(`/admin/organizations/${orgId}`)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Organizações</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Clique em uma organização para acessar o painel de gestão completo.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5 h-9 shadow-sm">
          <Plus className="h-4 w-4" />
          Nova Organização
        </Button>
      </div>

      {organizations.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 mb-3">
            <Building2 className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">Nenhuma organização cadastrada.</p>
          <button
            onClick={openCreate}
            className="mt-3 text-sm text-primary underline underline-offset-2 hover:no-underline"
          >
            Criar a primeira organização
          </button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_130px_110px_130px_90px_100px_80px] gap-3 px-4 py-2.5 bg-muted/30 border-b border-border/40 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Organização</span>
              <span>Contratante</span>
              <span>Documento</span>
              <span>WhatsApp</span>
              <span>Plano</span>
              <span>Cupom</span>
              <span>Status</span>
              <span />
            </div>

            {organizations.map((org) => {
              const status = (org.subscription_status ?? 'active') as SubStatus

              return (
                <div key={org.id} className="border-b border-border/30 last:border-0">
                  <div
                    onClick={() => goToDrilldown(org.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        goToDrilldown(org.id)
                      }
                    }}
                    className="grid grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_130px_110px_130px_90px_100px_80px] gap-3 px-4 py-3 hover:bg-muted/30 transition-colors items-center cursor-pointer focus:outline-none focus:bg-muted/30 group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                        {org.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                          {org.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">
                          {org.slug}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-foreground truncate">
                      {org.responsible_name ?? '—'}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      {formatDocument(org.document, org.document_type)}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {org.whatsapp ? formatWhatsapp(org.whatsapp) : '—'}
                    </span>
                    <span>
                      <PlanBadge plan={org.plan} />
                    </span>
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      {org.coupon_code ?? '—'}
                    </span>
                    <span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${STATUS_STYLES[status]}`}
                      >
                        {STATUS_LABELS[status]}
                      </span>
                    </span>

                    <div className="flex gap-0.5 justify-end items-center">
                      <button
                        onClick={(e) => handleDelete(e, org.id, org.name)}
                        disabled={isPending}
                        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Excluir organização"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>

                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors ml-1" />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeCreate} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-background shadow-2xl border-l border-border flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
              <h2 className="text-base font-semibold">Nova Organização</h2>
              <button
                onClick={closeCreate}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form id="org-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Nome da organização</label>
                <Input
                  placeholder="Ex: Meu Clube FC"
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Slug</label>
                <Input
                  placeholder="meu-clube-fc"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
                  required
                  className="h-9 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Identificador único. Apenas letras minúsculas, números e hífens.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Plano</label>
                <div className="grid grid-cols-3 gap-2">
                  {PLAN_LIST.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, plan: p.id as PlanId }))}
                      className={`px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
                        form.plan === p.id
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-[10px] opacity-70">{formatPrice(p.price)}</div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {PLANS[form.plan].max_categories} categoria(s) ·{' '}
                  {PLANS[form.plan].max_members} membro(s)
                </p>
              </div>

              <p className="text-xs text-muted-foreground bg-muted/30 border border-border/40 rounded-lg px-3 py-2">
                Após criar, abra a organização para configurar contratante, status de
                assinatura, documento, WhatsApp, cupom e mais.
              </p>

              {formError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 px-3 py-2 rounded-lg border border-destructive/15">
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                  {formError}
                </div>
              )}
            </form>

            <div className="px-6 py-4 border-t border-border/60 flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={closeCreate}>
                Cancelar
              </Button>
              <Button type="submit" form="org-form" size="sm" disabled={isPending} className="gap-1.5">
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Criar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Plan Badge ─────────────────────────────────────────────────────────────────

function PlanBadge({ plan }: { plan: string }) {
  const styles: Record<string, string> = {
    basic: 'bg-slate-100 text-slate-700',
    plus: 'bg-blue-100 text-blue-700',
    premium: 'bg-amber-100 text-amber-700',
    // Legacy values (until migration runs)
    pro: 'bg-blue-100 text-blue-700',
    enterprise: 'bg-amber-100 text-amber-700',
  }
  const labels: Record<string, string> = {
    basic: 'Basic',
    plus: 'Plus',
    premium: 'Premium',
    pro: 'Plus',
    enterprise: 'Premium',
  }
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
        styles[plan] ?? styles.basic
      }`}
    >
      {labels[plan] ?? plan}
    </span>
  )
}
