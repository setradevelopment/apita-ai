'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { Plus, Pencil, Trash2, MapPin, Clock, Tag, Info, GripVertical } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ImageUploadCrop } from '@/components/ui/image-upload-crop'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
} from '@/app/actions/categories'
import { uploadCategoryLogo, removeCategoryLogo } from '@/app/actions/category-logo'
import {
  calcTierPrice,
  suggestQty,
  formatCurrency,
  countTrainingsInMonth,
  type PricingMethod,
  type DiscountType,
} from '@/lib/pricing'
import type { TargetOrgOpts } from '@/lib/auth/resolve-org'

const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

interface TierFormState {
  enabled: boolean
  method: PricingMethod
  fixedPrice: string
  qty: string
  hasDiscount: boolean
  discountType: DiscountType
  discountValue: string
}

interface FormState {
  name: string
  days_of_week: string[]
  start_time: string
  end_time: string
  location: string
  observations: string
  has_drop_in: boolean
  price_drop_in: string
  weekly: TierFormState
  monthly: TierFormState
  semiannual: TierFormState
  annual: TierFormState
}

const emptyTier = (qty = 1): TierFormState => ({
  enabled: false,
  method: 'fixed',
  fixedPrice: '',
  qty: String(qty),
  hasDiscount: false,
  discountType: 'fixed_amount',
  discountValue: '',
})

const emptyForm = (): FormState => ({
  name: '',
  days_of_week: [],
  start_time: '',
  end_time: '',
  location: '',
  observations: '',
  has_drop_in: false,
  price_drop_in: '',
  weekly: emptyTier(1),
  monthly: emptyTier(4),
  semiannual: emptyTier(24),
  annual: emptyTier(48),
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function categoryToForm(c: any): FormState {
  function tierFromDb(key: string, fixedPrice: number, defaultQty: number): TierFormState {
    const method: PricingMethod = c[`${key}_method`] ?? 'fixed'
    const discountType: DiscountType = c[`${key}_discount_type`] ?? 'none'
    const discountValue: number = c[`${key}_discount_value`] ?? 0
    return {
      enabled: c[`has_${key}`] ?? false,
      method,
      fixedPrice: method === 'fixed' ? (fixedPrice ? String(fixedPrice) : '') : '',
      qty: String(c[`${key}_qty`] ?? defaultQty),
      hasDiscount: discountType !== 'none',
      discountType: discountType === 'none' ? 'fixed_amount' : discountType,
      discountValue: discountValue ? String(discountValue) : '',
    }
  }

  return {
    name: c.name,
    days_of_week: c.days_of_week,
    start_time: c.start_time,
    end_time: c.end_time,
    location: c.location,
    observations: c.observations ?? '',
    has_drop_in: c.has_drop_in ?? false,
    price_drop_in: c.price_drop_in ? String(c.price_drop_in) : '',
    weekly: tierFromDb('weekly', c.price_weekly, 1),
    monthly: tierFromDb('monthly', c.price_monthly, 4),
    semiannual: tierFromDb('semiannual', c.price_semiannual, 24),
    annual: tierFromDb('annual', c.price_annual, 48),
  }
}

function tierFinalPrice(dropIn: number, tier: TierFormState): number | null {
  if (!tier.enabled) return null
  const fixedPrice = Number(tier.fixedPrice) || 0
  const qty = Number(tier.qty) || 1
  const discountValue = Number(tier.discountValue) || 0
  const discountType: DiscountType = tier.hasDiscount ? tier.discountType : 'none'
  return calcTierPrice(dropIn, tier.method, fixedPrice, qty, discountType, discountValue)
}

function TierConfig({
  label,
  tierKey,
  form,
  setForm,
  dropIn,
  suggestedQty,
}: {
  label: string
  tierKey: 'weekly' | 'monthly' | 'semiannual' | 'annual'
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  dropIn: number
  suggestedQty: number
}) {
  const tier = form[tierKey]

  function update(patch: Partial<TierFormState>) {
    setForm((f) => ({ ...f, [tierKey]: { ...f[tierKey], ...patch } }))
  }

  const finalPrice = tierFinalPrice(dropIn, tier)
  const qtyNum = Number(tier.qty) || 1
  const base = dropIn * qtyNum
  const discountAmt =
    tier.hasDiscount && tier.discountType === 'fixed_amount'
      ? Number(tier.discountValue) || 0
      : tier.hasDiscount && tier.discountType === 'percentage'
      ? (base * (Number(tier.discountValue) || 0)) / 100
      : tier.hasDiscount && tier.discountType === 'per_session'
      ? (Number(tier.discountValue) || 0) * qtyNum
      : 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Switch
          checked={tier.enabled}
          onCheckedChange={(v) =>
            update({ enabled: v, qty: v ? String(suggestedQty) : tier.qty })
          }
        />
        <span className="text-sm font-medium">{label}</span>
      </div>

      {tier.enabled && (
        <div className="ml-10 space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Método de cálculo</Label>
            <div className="flex gap-1.5">
              {(['fixed', 'avulso_x_qty'] as PricingMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => update({ method: m })}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    tier.method === m
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {m === 'fixed' ? 'Valor fixo' : 'Avulso × quantidade'}
                </button>
              ))}
            </div>
          </div>

          {tier.method === 'fixed' && (
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-muted-foreground">R$</span>
              <Input
                type="number" min="0" step="0.01" placeholder="0,00"
                value={tier.fixedPrice}
                onChange={(e) => update({ fixedPrice: e.target.value })}
                className="h-8 w-32"
                required
              />
            </div>
          )}

          {tier.method === 'avulso_x_qty' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  Quantidade de treinos no período
                  <span className="ml-1 text-primary/60">(sugestão: {suggestedQty})</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min="1"
                    value={tier.qty}
                    onChange={(e) => update({ qty: e.target.value })}
                    className="h-8 w-20"
                    required
                  />
                  <span className="text-xs text-muted-foreground">treinos</span>
                </div>
              </div>

              {dropIn > 0 && (
                <div className="text-xs bg-muted/40 rounded-lg px-3 py-2.5 space-y-1 border border-border/30">
                  <div className="text-muted-foreground">
                    R$ {formatCurrency(dropIn)} × {tier.qty || '?'} treinos = <strong className="text-foreground">R$ {formatCurrency(base)}</strong>
                  </div>
                  {tier.hasDiscount && (Number(tier.discountValue) > 0) && (
                    <div className="text-amber-600">
                      — desconto: R$ {formatCurrency(discountAmt)}
                    </div>
                  )}
                  {finalPrice !== null && (
                    <div className="text-primary font-semibold text-sm mt-1">
                      Preço final: R$ {formatCurrency(finalPrice)}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Switch
                  checked={tier.hasDiscount}
                  onCheckedChange={(v) => update({ hasDiscount: v })}
                />
                <span className="text-xs text-muted-foreground">Aplicar desconto</span>
              </div>

              {tier.hasDiscount && (
                <div className="space-y-2 ml-8">
                  <div className="flex flex-wrap gap-1.5">
                    {(['fixed_amount', 'percentage', 'per_session'] as DiscountType[]).map((dt) => (
                      <button
                        key={dt}
                        type="button"
                        onClick={() => update({ discountType: dt })}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                          tier.discountType === dt
                            ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                            : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
                        }`}
                      >
                        {dt === 'fixed_amount'
                          ? 'Valor fixo (R$)'
                          : dt === 'percentage'
                          ? 'Percentual (%)'
                          : 'Por treino (R$)'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">
                      {tier.discountType === 'percentage' ? '%' : 'R$'}
                    </span>
                    <Input
                      type="number" min="0"
                      step={tier.discountType === 'percentage' ? '1' : '0.01'}
                      max={tier.discountType === 'percentage' ? '100' : undefined}
                      placeholder={tier.discountType === 'percentage' ? '0' : '0,00'}
                      value={tier.discountValue}
                      onChange={(e) => update({ discountValue: e.target.value })}
                      className="h-8 w-24"
                    />
                    {tier.discountType === 'per_session' && (
                      <span className="text-xs text-muted-foreground">por treino</span>
                    )}
                  </div>
                  {tier.discountType === 'per_session' && (
                    <p className="text-[11px] text-muted-foreground italic leading-snug">
                      Aplicado por treino — o desconto total cresce em meses com mais treinos
                      (ex.: R$ 3/treino × 5 treinos = R$ 15 off).
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Card arrastável — apenas o ícone GripVertical é a handle; o resto do card
// segue interativo (editar, excluir) sem capturar o drag. Usa useSortable do
// @dnd-kit pra animação suave + acessibilidade por teclado via KeyboardSensor.
function SortableCategoryCard({
  cat,
  onEdit,
  onDelete,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cat: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEdit: (c: any) => void
  onDelete: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-card rounded-xl border p-4 space-y-3 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] transition-shadow ${
        isDragging
          ? 'border-primary/60 shadow-lg opacity-90'
          : 'border-border/50 hover:shadow-[0_2px_8px_0_rgb(0_0_0/0.06)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="h-7 w-5 -ml-1 flex items-center justify-center text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
            title="Arraste para reordenar"
            aria-label={`Reordenar ${cat.name}`}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          {cat.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cat.logo_url}
              alt=""
              className="h-9 w-9 shrink-0 rounded-lg border border-border/40 bg-muted/30 object-contain"
            />
          ) : (
            <div className="h-9 w-9 shrink-0 rounded-lg border border-border/40 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center text-sm font-semibold text-muted-foreground">
              {cat.name.charAt(0).toUpperCase()}
            </div>
          )}
          <h3 className="font-semibold text-sm truncate" style={{ fontFamily: "'Outfit', sans-serif" }}>
            {cat.name}
          </h3>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <button
            onClick={() => onEdit(cat)}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(cat.id)}
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {cat.days_of_week.map((d: string) => (
          <span key={d} className="text-[10px] font-medium bg-primary/8 text-primary px-1.5 py-0.5 rounded">
            {d}
          </span>
        ))}
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3 w-3 shrink-0" />
          {cat.start_time} – {cat.end_time}
        </div>
        <div className="flex items-center gap-1.5">
          <MapPin className="h-3 w-3 shrink-0" />
          {cat.location}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 pt-1 border-t border-border/30">
        {cat.has_drop_in && (
          <span className="text-[10px] font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
            Avulso R${formatCurrency(cat.price_drop_in)}
          </span>
        )}
        {cat.has_monthly && (() => {
          // Tier mensal em `avulso_x_qty` depende da quantidade real
          // de treinos do mês atual — recalcula na hora para mostrar
          // o valor efetivo em vez do snapshot salvo em `price_monthly`.
          const now = new Date()
          const realQty = countTrainingsInMonth(
            cat.days_of_week ?? [],
            now.getMonth() + 1,
            now.getFullYear(),
          )
          const effective = cat.monthly_method === 'avulso_x_qty'
            ? calcTierPrice(
                cat.price_drop_in ?? 0,
                'avulso_x_qty',
                0,
                realQty,
                (cat.monthly_discount_type ?? 'none') as DiscountType,
                cat.monthly_discount_value ?? 0,
              )
            : cat.price_monthly
          return (
            <span
              className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded"
              title={
                cat.monthly_method === 'avulso_x_qty'
                  ? `Calculado com ${realQty} treino(s) em ${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`
                  : 'Valor fixo configurado'
              }
            >
              Mensal R${formatCurrency(effective)}
            </span>
          )
        })()}
        {/* Tiers "semanal", "semestral" e "anual" foram removidos da UI
            por enquanto. Quando reintroduzidos, renderizar chips aqui. */}
      </div>
    </div>
  )
}

export function CategoriesSection({
  categories,
  onDirtyChange,
  planName,
  categoryCount,
  maxCategories,
  bypassLimits,
  orgId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  categories: any[]
  onDirtyChange?: (dirty: boolean) => void
  planName: string
  categoryCount: number
  maxCategories: number
  bypassLimits: boolean
  orgId?: string
}) {
  const limitReached = !bypassLimits && categoryCount >= maxCategories
  const [open, setOpen] = useState(false)
  const orgOpts = useMemo<TargetOrgOpts | undefined>(
    () => (orgId ? { forOrgId: orgId } : undefined),
    [orgId]
  )

  // Ordem local dos cards — começa igual às categorias vindas do server e é
  // atualizada otimisticamente no drag-end. Reflete no `router.refresh()` que
  // acontece depois do `reorderCategories` persistir.
  const [localOrder, setLocalOrder] = useState(categories)
  useEffect(() => {
    setLocalOrder(categories)
  }, [categories])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = localOrder.findIndex((c) => c.id === active.id)
    const newIndex = localOrder.findIndex((c) => c.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const nextOrder = arrayMove(localOrder, oldIndex, newIndex)
    setLocalOrder(nextOrder)
    startTransition(async () => {
      try {
        await reorderCategories(
          nextOrder.map((c) => c.id),
          orgOpts,
        )
      } catch (err) {
        console.error('[reorderCategories] failed:', err)
        // Rollback — volta pra ordem do server
        setLocalOrder(categories)
      }
    })
  }

  // Report dirty state to parent: dirty while the create/edit dialog is open
  useEffect(() => {
    onDirtyChange?.(open)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingLogoUrl, setEditingLogoUrl] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [isPending, startTransition] = useTransition()
  const { confirm } = useConfirm()

  const dropIn = Number(form.price_drop_in) || 0

  function openCreate() {
    setEditingId(null)
    setEditingLogoUrl(null)
    setForm(emptyForm())
    setOpen(true)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function openEdit(cat: any) {
    setEditingId(cat.id)
    setEditingLogoUrl(cat.logo_url ?? null)
    setForm(categoryToForm(cat))
    setOpen(true)
  }

  async function handleUploadLogo(blob: Blob, mime: string) {
    if (!editingId) {
      throw new Error('Salve a categoria primeiro para adicionar um logo.')
    }
    const fd = new FormData()
    fd.append('file', blob, `logo.${mime.split('/')[1]}`)
    fd.append('categoryId', editingId)
    if (orgId) fd.append('forOrgId', orgId)
    const url = await uploadCategoryLogo(fd)
    setEditingLogoUrl(url)
  }

  async function handleRemoveLogo() {
    if (!editingId) return
    await removeCategoryLogo({ categoryId: editingId, forOrgId: orgId ?? null })
    setEditingLogoUrl(null)
  }

  function toggleDay(day: string) {
    setForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(day)
        ? f.days_of_week.filter((d) => d !== day)
        : [...f.days_of_week, day],
    }))
  }

  function buildActionData() {
    function tierData(key: 'weekly' | 'monthly' | 'semiannual' | 'annual') {
      const t = form[key]
      return {
        enabled: t.enabled,
        method: t.method,
        fixedPrice: Number(t.fixedPrice) || 0,
        qty: Number(t.qty) || 1,
        discountType: (t.hasDiscount ? t.discountType : 'none') as DiscountType,
        discountValue: Number(t.discountValue) || 0,
      }
    }

    // Tiers "semanal", "semestral" e "anual" foram removidos da UI. Até
    // implementarmos de novo quando houver necessidade, forçamos enabled=false
    // no save pra desabilitar automaticamente em categorias antigas e evitar
    // persistir estado stale do form.
    function disabledTier() {
      return {
        enabled: false,
        method: 'fixed' as const,
        fixedPrice: 0,
        qty: 1,
        discountType: 'none' as DiscountType,
        discountValue: 0,
      }
    }

    return {
      name: form.name,
      days_of_week: form.days_of_week,
      start_time: form.start_time,
      end_time: form.end_time,
      location: form.location,
      observations: form.observations || undefined,
      has_drop_in: form.has_drop_in,
      price_drop_in: Number(form.price_drop_in) || 0,
      weekly: disabledTier(),
      monthly: tierData('monthly'),
      semiannual: disabledTier(),
      annual: disabledTier(),
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const data = buildActionData()
    startTransition(async () => {
      if (editingId) {
        await updateCategory(editingId, data, orgOpts)
      } else {
        await createCategory(data, orgOpts)
      }
      setOpen(false)
    })
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: 'Excluir esta categoria?',
      description: 'Os treinos vinculados, presenças e pagamentos dessa categoria também serão apagados.',
      variant: 'destructive',
      confirmLabel: 'Excluir',
    })
    if (!ok) return
    startTransition(() => deleteCategory(id, orgOpts))
  }

  const suggestedQtyMap = {
    weekly: suggestQty(form.days_of_week, 'weekly'),
    monthly: suggestQty(form.days_of_week, 'monthly'),
    semiannual: suggestQty(form.days_of_week, 'semiannual'),
    annual: suggestQty(form.days_of_week, 'annual'),
  }

  // Apenas "Mensal" na UI por enquanto. Semanal/Semestral/Anual foram
  // retirados a pedido do owner — quando houver necessidade, basta reincluir
  // no array. O schema do banco e as actions já suportam os 5 tiers.
  const tiers: Array<{ key: 'weekly' | 'monthly' | 'semiannual' | 'annual'; label: string }> = [
    { key: 'monthly', label: 'Mensal' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {categories.length === 0
            ? 'Nenhuma categoria cadastrada. Crie a primeira.'
            : `${categories.length} categoria(s) cadastrada(s)`}
          {!bypassLimits && (
            <span className="ml-2 text-xs">
              · Plano <strong>{planName}</strong>: {categoryCount}/{maxCategories}
            </span>
          )}
        </div>
        <Button
          onClick={openCreate}
          size="sm"
          className="gap-1.5 h-9 shadow-sm"
          disabled={limitReached}
          title={limitReached ? `Limite do plano ${planName} atingido` : undefined}
        >
          <Plus className="h-4 w-4" />
          Nova Categoria
        </Button>
      </div>
      {limitReached && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Limite de {maxCategories} categoria(s) do plano <strong>{planName}</strong> atingido.
          Entre em contato para fazer upgrade.
        </div>
      )}

      {categories.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 mb-3">
            <Tag className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">
            Nenhuma categoria ainda. Crie a primeira para começar.
          </p>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <GripVertical className="h-3 w-3" />
            Arraste os cards para reordenar. A ordem será respeitada no
            Gerenciador de Treinos e em todas as listas de categorias.
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={localOrder.map((c) => c.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {localOrder.map((cat) => (
                  <SortableCategoryCard
                    key={cat.id}
                    cat={cat}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Outfit', sans-serif" }}>
              {editingId ? 'Editar Categoria' : 'Nova Categoria'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            {editingId ? (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Logo da categoria</Label>
                <ImageUploadCrop
                  currentUrl={editingLogoUrl}
                  onUpload={handleUploadLogo}
                  onRemove={handleRemoveLogo}
                  label=""
                  helpText="PNG (mantém transparência), JPEG ou WebP. Máx 2MB. Recorte 1:1."
                />
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border/40 rounded-lg px-3 py-2">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  Salve a categoria primeiro. Depois, clique no lápis para adicionar um logo
                  específico desta categoria (útil quando o time tem mais de uma marca).
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-medium">Nome *</Label>
              <Input
                id="name"
                placeholder="ex: Misto, Feminino, Sub-20..."
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="h-9"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">Dias da semana *</Label>
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                      form.days_of_week.includes(day)
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="start_time" className="text-xs font-medium">Início *</Label>
                <Input id="start_time" type="time" value={form.start_time} className="h-9"
                  onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="end_time" className="text-xs font-medium">Fim *</Label>
                <Input id="end_time" type="time" value={form.end_time} className="h-9"
                  onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} required />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="location" className="text-xs font-medium">Local *</Label>
              <Input id="location" placeholder="ex: Ginásio Municipal" value={form.location} className="h-9"
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="observations" className="text-xs font-medium">Observações</Label>
              <Textarea id="observations" placeholder="Informações adicionais..."
                value={form.observations} rows={2}
                onChange={(e) => setForm((f) => ({ ...f, observations: e.target.value }))} />
            </div>

            <div className="border-t border-border/50 pt-4">
              <Label className="text-sm font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
                Modalidades de pagamento
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure como cada modalidade é cobrada
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Valor por treino (avulso)</Label>
                  <p className="text-xs text-muted-foreground">Base para cálculo das demais</p>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={form.has_drop_in}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, has_drop_in: v }))}
                  />
                  <span className="text-xs text-muted-foreground">Oferecer avulso</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">R$</span>
                <Input
                  type="number" min="0" step="0.01" placeholder="0,00"
                  value={form.price_drop_in}
                  onChange={(e) => setForm((f) => ({ ...f, price_drop_in: e.target.value }))}
                  className="h-8 w-32"
                />
                <span className="text-xs text-muted-foreground">por treino</span>
              </div>
            </div>

            {tiers.map(({ key, label }) => (
              <TierConfig
                key={key}
                label={label}
                tierKey={key}
                form={form}
                setForm={setForm}
                dropIn={dropIn}
                suggestedQty={suggestedQtyMap[key]}
              />
            ))}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-9">
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending || form.days_of_week.length === 0} className="h-9">
                {isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
