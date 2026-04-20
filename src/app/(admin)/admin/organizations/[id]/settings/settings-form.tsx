'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ImageUploadCrop } from '@/components/ui/image-upload-crop'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  updateOrganization,
  deleteOrganization,
  type Organization,
} from '@/app/actions/super-admin'
import { uploadOrgLogo, removeOrgLogo } from '@/app/actions/organization'
import { PLANS, PLAN_LIST, formatPrice, type PlanId } from '@/lib/plans'

type SubStatus = 'pending_payment' | 'active' | 'suspended' | 'cancelled'

interface OrgForm {
  name: string
  slug: string
  plan: PlanId
  active: boolean
  responsible_name: string
  whatsapp: string
  document: string
  document_type: 'cpf' | 'cnpj'
  subscription_status: SubStatus
  coupon_code: string
}

function slugify(str: string) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function formatWhatsapp(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function formatDocument(raw: string | null, type: string | null): string {
  if (!raw) return ''
  const d = raw.replace(/\D/g, '')
  if (type === 'cpf' && d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`
  }
  if (type === 'cnpj' && d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
  }
  return d
}

export function OrgSettingsForm({ org }: { org: Organization }) {
  const router = useRouter()
  const { confirm, alert } = useConfirm()
  const [isPending, startTransition] = useTransition()
  const [isDeleting, startDelete] = useTransition()
  const [currentLogo, setCurrentLogo] = useState<string | null>(org.logo_url)

  async function handleLogoUpload(blob: Blob, mime: string) {
    const fd = new FormData()
    fd.append('file', blob, `logo.${mime.split('/')[1]}`)
    fd.append('forOrgId', org.id)
    const url = await uploadOrgLogo(fd)
    setCurrentLogo(url)
    router.refresh()
  }

  async function handleLogoRemove() {
    await removeOrgLogo({ forOrgId: org.id })
    setCurrentLogo(null)
    router.refresh()
  }

  const [form, setForm] = useState<OrgForm>({
    name: org.name,
    slug: org.slug,
    plan: (PLANS[org.plan as PlanId] ? (org.plan as PlanId) : 'basic'),
    active: org.active,
    responsible_name: org.responsible_name ?? '',
    whatsapp: org.whatsapp ? formatWhatsapp(org.whatsapp) : '',
    document: org.document ? formatDocument(org.document, org.document_type) : '',
    document_type: (org.document_type ?? 'cnpj') as 'cpf' | 'cnpj',
    subscription_status: (org.subscription_status ?? 'active') as SubStatus,
    coupon_code: org.coupon_code ?? '',
  })
  const [formError, setFormError] = useState('')
  const [savedOnce, setSavedOnce] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.slug.trim()) {
      setFormError('Nome e slug são obrigatórios.')
      return
    }
    setFormError('')
    startTransition(async () => {
      try {
        await updateOrganization(org.id, {
          name: form.name.trim(),
          slug: form.slug.trim(),
          plan: form.plan,
          active: form.active,
          responsible_name: form.responsible_name.trim() || null,
          whatsapp: form.whatsapp.replace(/\D/g, '') || null,
          document: form.document.replace(/\D/g, '') || null,
          document_type: form.document.replace(/\D/g, '') ? form.document_type : null,
          subscription_status: form.subscription_status,
          coupon_code: form.coupon_code.trim() || null,
        })
        setSavedOnce(true)
        setTimeout(() => setSavedOnce(false), 2500)
        router.refresh()
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : 'Erro ao salvar organização.')
      }
    })
  }

  async function handleDelete() {
    const ok = await confirm({
      title: `Excluir a organização "${org.name}"?`,
      description: 'Todos os usuários, categorias, membros e treinos vinculados serão removidos. Essa ação não pode ser desfeita.',
      variant: 'destructive',
      confirmLabel: 'Excluir organização',
    })
    if (!ok) return
    startDelete(async () => {
      try {
        await deleteOrganization(org.id)
        router.push('/admin/organizations')
      } catch (err: unknown) {
        await alert({
          title: 'Erro ao excluir organização',
          description: err instanceof Error ? err.message : 'Erro desconhecido.',
          variant: 'destructive',
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Visual identity (logo) */}
      <div className="bg-card rounded-xl border border-border/50 p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold">Identidade visual</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Logo da organização. Aparece na barra lateral dos usuários e em outras telas.
          </p>
        </div>
        <ImageUploadCrop
          currentUrl={currentLogo}
          onUpload={handleLogoUpload}
          onRemove={handleLogoRemove}
          label=""
          helpText="PNG (alpha preservado), JPEG ou WebP. Máx 2MB. Recorte 1:1 antes do envio."
        />
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-xl border border-border/50 p-6 space-y-5"
      >
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Nome da organização</label>
          <Input
            placeholder="Ex: Meu Clube FC"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
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
          <label className="text-sm font-medium">Contratante (responsável)</label>
          <Input
            placeholder="Nome do responsável"
            value={form.responsible_name}
            onChange={(e) => setForm((f) => ({ ...f, responsible_name: e.target.value }))}
            className="h-9"
          />
          <p className="text-xs text-muted-foreground">
            Os dados do usuário admin (e-mail, senha, nome) são editados na aba Admin contratante.
          </p>
        </div>

        <div className="grid grid-cols-[110px_1fr] gap-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tipo</label>
            <select
              value={form.document_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, document_type: e.target.value as 'cpf' | 'cnpj' }))
              }
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="cnpj">CNPJ</option>
              <option value="cpf">CPF</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Documento</label>
            <Input
              placeholder={
                form.document_type === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'
              }
              value={form.document}
              onChange={(e) => setForm((f) => ({ ...f, document: e.target.value }))}
              className="h-9 font-mono"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">WhatsApp</label>
          <Input
            placeholder="(00) 00000-0000"
            value={form.whatsapp}
            onChange={(e) => setForm((f) => ({ ...f, whatsapp: formatWhatsapp(e.target.value) }))}
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Cupom aplicado</label>
          <Input
            placeholder="Ex: TESTE10 (opcional)"
            value={form.coupon_code}
            onChange={(e) => setForm((f) => ({ ...f, coupon_code: e.target.value.toUpperCase() }))}
            className="h-9 font-mono"
          />
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
            {PLANS[form.plan].max_categories} categoria(s) · {PLANS[form.plan].max_members}{' '}
            membro(s)
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Status da assinatura</label>
          <select
            value={form.subscription_status}
            onChange={(e) =>
              setForm((f) => ({ ...f, subscription_status: e.target.value as SubStatus }))
            }
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="pending_payment">Pagamento pendente</option>
            <option value="active">Ativa</option>
            <option value="suspended">Suspensa</option>
            <option value="cancelled">Cancelada</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Mude para &quot;Ativa&quot; após confirmar o pagamento manualmente.
          </p>
        </div>

        <div className="flex items-center justify-between py-3 px-4 rounded-lg bg-muted/30 border border-border/40">
          <div>
            <div className="text-sm font-medium">Organização ativa</div>
            <div className="text-xs text-muted-foreground">
              Inativar bloqueia todo acesso.
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

        <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
          {savedOnce && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium mr-auto">
              <Check className="h-3.5 w-3.5" /> Alterações salvas
            </span>
          )}
          <Button type="submit" size="sm" disabled={isPending} className="gap-1.5">
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Salvar alterações
          </Button>
        </div>
      </form>

      {/* Danger zone */}
      <div className="bg-card rounded-xl border border-destructive/30 p-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-destructive">Zona de perigo</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Excluir a organização remove permanentemente todos os seus dados (usuários,
            categorias, membros, treinos, parcelas).
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={isDeleting}
          className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive"
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Excluir organização
        </Button>
      </div>
    </div>
  )
}
