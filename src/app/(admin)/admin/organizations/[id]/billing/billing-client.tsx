'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Receipt, Check, X, Trash2, Pencil, Loader2,
  CircleDollarSign, CircleAlert, CircleCheck, CircleSlash,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  createInvoice,
  updateInvoice,
  markInvoicePaid,
  deleteInvoice,
  type SubscriptionInvoice,
  type SubscriptionInvoiceStatus,
} from '@/app/actions/super-admin-billing'

const STATUS_META: Record<
  SubscriptionInvoiceStatus,
  { label: string; chip: string; Icon: typeof CircleDollarSign }
> = {
  pending:   { label: 'Pendente',  chip: 'bg-amber-50  text-amber-700  border-amber-200',  Icon: CircleDollarSign },
  paid:      { label: 'Pago',      chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CircleCheck      },
  overdue:   { label: 'Vencida',   chip: 'bg-rose-50   text-rose-700   border-rose-200',   Icon: CircleAlert       },
  cancelled: { label: 'Cancelada', chip: 'bg-muted     text-muted-foreground border-border/60', Icon: CircleSlash  },
}

type FilterStatus = SubscriptionInvoiceStatus | 'all'

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'all',       label: 'Todas'     },
  { value: 'pending',   label: 'Pendentes' },
  { value: 'paid',      label: 'Pagas'     },
  { value: 'overdue',   label: 'Vencidas'  },
  { value: 'cancelled', label: 'Canceladas' },
]

interface FormState {
  issue_date: string
  due_date: string
  amount: string
  status: SubscriptionInvoiceStatus
  notes: string
}

function emptyForm(): FormState {
  return { issue_date: '', due_date: '', amount: '', status: 'pending', notes: '' }
}

function invoiceToForm(inv: SubscriptionInvoice): FormState {
  return {
    issue_date: inv.issue_date ?? '',
    due_date: inv.due_date,
    amount: String(inv.amount),
    status: inv.status,
    notes: inv.notes ?? '',
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR')
}

function formatCurrency(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function isOverdue(inv: SubscriptionInvoice): boolean {
  if (inv.status !== 'pending') return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(inv.due_date + 'T00:00:00')
  return due < today
}

export function BillingClient({
  orgId,
  invoices,
}: {
  orgId: string
  invoices: SubscriptionInvoice[]
}) {
  const router = useRouter()
  const { confirm } = useConfirm()
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const filtered = invoices.filter((i) =>
    filter === 'all' ? true : i.status === filter
  )

  const pendingSum = invoices
    .filter((i) => i.status === 'pending')
    .reduce((acc, i) => acc + i.amount, 0)
  const paidSum = invoices
    .filter((i) => i.status === 'paid')
    .reduce((acc, i) => acc + i.amount, 0)
  const overdueCount = invoices.filter(isOverdue).length

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm())
    setMsg(null)
    setDialogOpen(true)
  }

  function openEdit(inv: SubscriptionInvoice) {
    setEditingId(inv.id)
    setForm(invoiceToForm(inv))
    setMsg(null)
    setDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)

    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setMsg({ type: 'error', text: 'Informe um valor maior que zero.' })
      return
    }
    if (!form.due_date) {
      setMsg({ type: 'error', text: 'Informe a data de vencimento.' })
      return
    }

    startTransition(async () => {
      try {
        if (editingId) {
          await updateInvoice(editingId, {
            issue_date: form.issue_date || null,
            due_date: form.due_date,
            amount,
            status: form.status,
            notes: form.notes || null,
          })
        } else {
          await createInvoice(orgId, {
            issue_date: form.issue_date || null,
            due_date: form.due_date,
            amount,
            status: form.status,
            notes: form.notes || null,
          })
        }
        router.refresh()
        setDialogOpen(false)
      } catch (err) {
        setMsg({
          type: 'error',
          text: err instanceof Error ? err.message : 'Erro ao salvar parcela.',
        })
      }
    })
  }

  function handleMarkPaid(id: string) {
    startTransition(async () => {
      try {
        await markInvoicePaid(id)
        router.refresh()
      } catch (err) {
        console.error('[markInvoicePaid]', err)
      }
    })
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: 'Excluir esta parcela?',
      description: 'A ação não pode ser desfeita.',
      variant: 'destructive',
      confirmLabel: 'Excluir',
    })
    if (!ok) return
    startTransition(async () => {
      try {
        await deleteInvoice(id)
        router.refresh()
      } catch (err) {
        console.error('[deleteInvoice]', err)
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Parcelas do SaaS
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gestão manual de parcelas da assinatura desta organização.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card rounded-xl border border-border/50 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CircleDollarSign className="h-3.5 w-3.5" />
            Em aberto
          </div>
          <div className="mt-2 text-lg font-semibold text-amber-700">
            R$ {formatCurrency(pendingSum)}
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border/50 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CircleCheck className="h-3.5 w-3.5" />
            Pagas
          </div>
          <div className="mt-2 text-lg font-semibold text-emerald-700">
            R$ {formatCurrency(paidSum)}
          </div>
        </div>
        <div className="bg-card rounded-xl border border-border/50 p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CircleAlert className="h-3.5 w-3.5" />
            Vencidas
          </div>
          <div className="mt-2 text-lg font-semibold text-rose-700">
            {overdueCount}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === f.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button onClick={openCreate} size="sm" className="gap-1.5 h-9 shadow-sm">
          <Plus className="h-4 w-4" />
          Nova Parcela
        </Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 mb-3">
            <Receipt className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">
            {invoices.length === 0
              ? 'Nenhuma parcela cadastrada. Crie a primeira para iniciar.'
              : 'Nenhuma parcela encontrada com esse filtro.'}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
          <div className="grid grid-cols-[110px_110px_110px_1fr_110px_120px] gap-4 px-4 py-2.5 bg-muted/30 border-b border-border/40 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>Emissão</span>
            <span>Vencimento</span>
            <span>Valor</span>
            <span>Observações</span>
            <span>Status</span>
            <span className="text-right">Ações</span>
          </div>
          {filtered.map((inv) => {
            const overdueBadge = isOverdue(inv)
            const status = overdueBadge ? 'overdue' : inv.status
            const meta = STATUS_META[status]
            const Icon = meta.Icon
            return (
              <div
                key={inv.id}
                className="grid grid-cols-[110px_110px_110px_1fr_110px_120px] gap-4 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors items-center"
              >
                <span className="text-xs text-muted-foreground">{formatDate(inv.issue_date)}</span>
                <span className="text-xs font-medium">{formatDate(inv.due_date)}</span>
                <span className="text-sm font-semibold">R$ {formatCurrency(inv.amount)}</span>
                <span className="text-xs text-muted-foreground truncate">
                  {inv.notes || <span className="text-muted-foreground/40">—</span>}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border w-fit ${meta.chip}`}
                >
                  <Icon className="h-3 w-3" />
                  {meta.label}
                </span>
                <div className="flex gap-0.5 justify-end">
                  {inv.status !== 'paid' && inv.status !== 'cancelled' && (
                    <button
                      onClick={() => handleMarkPaid(inv.id)}
                      disabled={isPending}
                      className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-emerald-50 text-muted-foreground hover:text-emerald-700 transition-colors disabled:opacity-50"
                      title="Marcar como paga"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(inv)}
                    disabled={isPending}
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    title="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(inv.id)}
                    disabled={isPending}
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Outfit', sans-serif" }}>
              {editingId ? 'Editar Parcela' : 'Nova Parcela'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="issue_date" className="text-xs font-medium">Emissão</Label>
                <Input
                  id="issue_date"
                  type="date"
                  value={form.issue_date}
                  onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="due_date" className="text-xs font-medium">Vencimento *</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="h-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="amount" className="text-xs font-medium">Valor (R$) *</Label>
              <Input
                id="amount"
                type="number" min="0.01" step="0.01" placeholder="99.90"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="h-9"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Status</Label>
              <div className="flex gap-1.5 flex-wrap">
                {(['pending', 'paid', 'overdue', 'cancelled'] as const).map((s) => {
                  const meta = STATUS_META[s]
                  const Icon = meta.Icon
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, status: s }))}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                        form.status === s
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      {meta.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-xs font-medium">Observações</Label>
              <Textarea
                id="notes"
                placeholder="ex: Referente a Abril/2026"
                value={form.notes}
                rows={2}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>

            {msg && (
              <div
                className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border ${
                  msg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}
              >
                {msg.type === 'success' ? <Check className="h-3.5 w-3.5 mt-0.5" /> : <X className="h-3.5 w-3.5 mt-0.5" />}
                <span>{msg.text}</span>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="h-9"
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} className="h-9 gap-1.5">
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingId ? 'Salvar' : 'Criar parcela'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
