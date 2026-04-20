'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Ticket,
  Power,
  PowerOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponActive,
  type Coupon,
  type CouponInput,
} from '@/app/actions/coupons'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CouponForm {
  code: string
  description: string
  observation: string
  discount_type: 'fixed' | 'percent'
  discount_value: string
  max_uses: string
  valid_from: string
  expires_at: string
  active: boolean
}

const emptyForm: CouponForm = {
  code: '',
  description: '',
  observation: '',
  discount_type: 'percent',
  discount_value: '',
  max_uses: '',
  valid_from: '',
  expires_at: '',
  active: true,
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Convert an ISO timestamptz from Supabase into a value usable by <input type="datetime-local">. */
function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Convert a `datetime-local` string back into an ISO string, or null if empty. */
function fromDatetimeLocal(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function formatDiscount(c: Coupon): string {
  if (c.discount_type === 'percent') return `${Number(c.discount_value)}%`
  return `R$ ${Number(c.discount_value).toFixed(2).replace('.', ',')}`
}

function getStatus(c: Coupon): { label: string; style: string } {
  if (!c.active) return { label: 'Inativo', style: 'bg-slate-100 text-slate-600 border-slate-200' }
  const now = new Date()
  if (c.valid_from && new Date(c.valid_from) > now) {
    return { label: 'Agendado', style: 'bg-sky-100 text-sky-700 border-sky-200' }
  }
  if (c.expires_at && new Date(c.expires_at) < now) {
    return { label: 'Expirado', style: 'bg-red-100 text-red-700 border-red-200' }
  }
  if (c.max_uses && c.uses_count >= c.max_uses) {
    return { label: 'Esgotado', style: 'bg-amber-100 text-amber-700 border-amber-200' }
  }
  return { label: 'Ativo', style: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function CouponsClient({ coupons }: { coupons: Coupon[] }) {
  const router = useRouter()
  const { confirm, alert } = useConfirm()
  const [isPending, startTransition] = useTransition()

  const [sheet, setSheet] = useState<'create' | 'edit' | null>(null)
  const [editing, setEditing] = useState<Coupon | null>(null)
  const [form, setForm] = useState<CouponForm>(emptyForm)
  const [formError, setFormError] = useState('')
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setSheet('create')
  }

  function openEdit(c: Coupon) {
    setEditing(c)
    setForm({
      code: c.code,
      description: c.description ?? '',
      observation: c.observation ?? '',
      discount_type: c.discount_type,
      discount_value: String(c.discount_value),
      max_uses: c.max_uses ? String(c.max_uses) : '',
      valid_from: toDatetimeLocal(c.valid_from),
      expires_at: toDatetimeLocal(c.expires_at),
      active: c.active,
    })
    setFormError('')
    setSheet('edit')
  }

  function closeSheet() {
    setSheet(null)
    setEditing(null)
    setFormError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = form.code.trim().toUpperCase()
    if (!code) {
      setFormError('Código obrigatório.')
      return
    }
    const discountValue = Number(form.discount_value)
    if (!discountValue || discountValue <= 0) {
      setFormError('Desconto deve ser maior que zero.')
      return
    }
    if (form.discount_type === 'percent' && discountValue > 100) {
      setFormError('Desconto percentual não pode exceder 100%.')
      return
    }
    const maxUses = form.max_uses.trim() ? Number(form.max_uses) : null
    if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) {
      setFormError('Limite de usos deve ser um número positivo.')
      return
    }

    const validFrom = fromDatetimeLocal(form.valid_from)
    const expiresAt = fromDatetimeLocal(form.expires_at)
    if (validFrom && expiresAt && new Date(expiresAt) <= new Date(validFrom)) {
      setFormError('Data final deve ser posterior à data inicial.')
      return
    }

    const payload: CouponInput = {
      code,
      description: form.description.trim() || null,
      observation: form.observation.trim() || null,
      discount_type: form.discount_type,
      discount_value: discountValue,
      max_uses: maxUses,
      valid_from: validFrom,
      expires_at: expiresAt,
      active: form.active,
    }

    setFormError('')
    startTransition(async () => {
      try {
        const result = sheet === 'create'
          ? await createCoupon(payload)
          : await updateCoupon(editing!.id, payload)
        if (!result.success) {
          setFormError(result.error ?? 'Erro ao salvar cupom.')
          return
        }
        closeSheet()
        router.refresh()
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : 'Erro ao salvar cupom.')
      }
    })
  }

  async function handleDelete(id: string, code: string) {
    const ok = await confirm({
      title: `Excluir o cupom "${code}"?`,
      description: 'Essa ação não pode ser desfeita.',
      variant: 'destructive',
      confirmLabel: 'Excluir',
    })
    if (!ok) return
    startTransition(async () => {
      try {
        const result = await deleteCoupon(id)
        if (!result.success) {
          await alert({
            title: 'Erro ao excluir cupom',
            description: result.error ?? 'Tente novamente em instantes.',
            variant: 'destructive',
          })
          return
        }
        router.refresh()
      } catch (err: unknown) {
        await alert({
          title: 'Erro ao excluir cupom',
          description: err instanceof Error ? err.message : 'Erro desconhecido.',
          variant: 'destructive',
        })
      }
    })
  }

  async function handleToggleActive(c: Coupon) {
    setTogglingId(c.id)
    try {
      const result = await toggleCouponActive(c.id, !c.active)
      if (!result.success) {
        await alert({
          title: 'Erro ao alterar status do cupom',
          description: result.error ?? 'Tente novamente em instantes.',
          variant: 'destructive',
        })
        return
      }
      router.refresh()
    } catch (err: unknown) {
      await alert({
        title: 'Erro ao alterar status do cupom',
        description: err instanceof Error ? err.message : 'Erro desconhecido.',
        variant: 'destructive',
      })
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cupons</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cupons de desconto aplicáveis no cadastro de novas organizações
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5 h-9 shadow-sm">
          <Plus className="h-4 w-4" />
          Novo Cupom
        </Button>
      </div>

      {coupons.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 mb-3">
            <Ticket className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">Nenhum cupom cadastrado.</p>
          <button
            onClick={openCreate}
            className="mt-3 text-sm text-primary underline underline-offset-2 hover:no-underline"
          >
            Criar o primeiro cupom
          </button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[minmax(140px,1fr)_minmax(160px,1.4fr)_90px_100px_110px_110px_90px_110px] gap-3 px-4 py-2.5 bg-muted/30 border-b border-border/40 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <span>Código</span>
              <span>Descrição</span>
              <span>Desconto</span>
              <span>Usos</span>
              <span>Início</span>
              <span>Fim</span>
              <span>Status</span>
              <span />
            </div>

            {coupons.map((c) => {
              const status = getStatus(c)
              const isToggling = togglingId === c.id
              return (
                <div
                  key={c.id}
                  className="grid grid-cols-[minmax(140px,1fr)_minmax(160px,1.4fr)_90px_100px_110px_110px_90px_110px] gap-3 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors items-center"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg bg-muted">
                      <Ticket className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-mono font-semibold truncate">{c.code}</div>
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs text-foreground truncate">
                      {c.description ?? <span className="text-muted-foreground/60">—</span>}
                    </div>
                    {c.observation && (
                      <div className="text-[11px] text-muted-foreground truncate">{c.observation}</div>
                    )}
                  </div>

                  <span className="text-xs font-medium text-foreground">{formatDiscount(c)}</span>

                  <span className="text-xs text-muted-foreground tabular-nums">
                    {c.uses_count}
                    {c.max_uses ? ` / ${c.max_uses}` : ''}
                  </span>

                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(c.valid_from)}
                  </span>

                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDate(c.expires_at)}
                  </span>

                  <span>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${status.style}`}
                    >
                      {status.label}
                    </span>
                  </span>

                  <div className="flex gap-0.5 justify-end">
                    <button
                      onClick={() => handleToggleActive(c)}
                      disabled={isToggling}
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                      title={c.active ? 'Inativar cupom' : 'Ativar cupom'}
                    >
                      {isToggling ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : c.active ? (
                        <PowerOff className="h-3.5 w-3.5" />
                      ) : (
                        <Power className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      onClick={() => openEdit(c)}
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                      title="Editar cupom"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id, c.code)}
                      disabled={isPending}
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Excluir cupom"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {sheet && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closeSheet} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-background shadow-2xl border-l border-border flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
              <h2 className="text-base font-semibold">
                {sheet === 'create' ? 'Novo Cupom' : 'Editar Cupom'}
              </h2>
              <button
                onClick={closeSheet}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              id="coupon-form"
              onSubmit={handleSubmit}
              className="flex-1 overflow-y-auto p-6 space-y-5"
            >
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Código do cupom</label>
                <Input
                  placeholder="Ex: TESTE10"
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))
                  }
                  required
                  className="h-9 font-mono uppercase"
                />
                <p className="text-xs text-muted-foreground">
                  Único, sem espaços. Convertido automaticamente para maiúsculas.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Descrição</label>
                <Input
                  placeholder="Ex: Cupom promocional de lançamento"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Observação</label>
                <textarea
                  placeholder="Notas internas sobre o cupom (opcional)"
                  value={form.observation}
                  onChange={(e) => setForm((f) => ({ ...f, observation: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
                />
              </div>

              <div className="grid grid-cols-[130px_1fr] gap-2">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Tipo</label>
                  <select
                    value={form.discount_type}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        discount_type: e.target.value as 'fixed' | 'percent',
                      }))
                    }
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="percent">Percentual (%)</option>
                    <option value="fixed">Fixo (R$)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Valor do desconto</label>
                  <Input
                    type="number"
                    step={form.discount_type === 'percent' ? '1' : '0.01'}
                    min="0"
                    max={form.discount_type === 'percent' ? '100' : undefined}
                    placeholder={form.discount_type === 'percent' ? '10' : '50.00'}
                    value={form.discount_value}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, discount_value: e.target.value }))
                    }
                    required
                    className="h-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Limite de usos</label>
                <Input
                  type="number"
                  min="1"
                  placeholder="Deixe em branco para ilimitado"
                  value={form.max_uses}
                  onChange={(e) => setForm((f) => ({ ...f, max_uses: e.target.value }))}
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">
                  Quantidade máxima de utilizações. Vazio = sem limite.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Data inicial de validade</label>
                <Input
                  type="datetime-local"
                  value={form.valid_from}
                  onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">
                  Se vazia, vale a partir da criação do cupom.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Data final de validade</label>
                <Input
                  type="datetime-local"
                  value={form.expires_at}
                  onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
                  className="h-9"
                />
                <p className="text-xs text-muted-foreground">
                  Se vazia, o cupom só encerra quando editado ou excluído.
                </p>
              </div>

              <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/30 border border-border/40">
                <div>
                  <div className="text-sm font-medium">Cupom ativo</div>
                  <div className="text-xs text-muted-foreground">
                    Inativar impede novos usos imediatamente
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.active}
                  onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    form.active ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                      form.active ? 'translate-x-4' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {formError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 px-3 py-2 rounded-lg border border-destructive/15">
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                  {formError}
                </div>
              )}
            </form>

            <div className="px-6 py-4 border-t border-border/60 flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={closeSheet}>
                Cancelar
              </Button>
              <Button
                type="submit"
                form="coupon-form"
                size="sm"
                disabled={isPending}
                className="gap-1.5"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {sheet === 'create' ? 'Criar' : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
