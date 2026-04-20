'use client'

import { useState, useTransition, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Plus, Search, User, Trash2, RotateCcw,
  CheckCircle, AlertCircle, Mail, Lock, ShieldCheck, Loader2, ShieldAlert,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  adminUpdateUser,
  adminUpdateUserClub,
  adminResetPassword,
  adminCreateUser,
  adminDeleteUser,
  adminUpdatePermissions,
  type PlatformUser,
} from '@/app/actions/admin-users'
import type { TargetOrgOpts } from '@/lib/auth/resolve-org'
import { InviteLinkCard } from './invite-link-card'

interface Category { id: string; name: string }
interface Position { id: string; name: string }

/**
 * Calcula a idade em anos completos a partir de uma data de nascimento
 * no formato `YYYY-MM-DD`. Retorna `null` se `dob` vazio/inválido.
 *
 * Não usa nenhuma lib — diferença em milissegundos não funciona (ano
 * bissexto) e cálculos com `Intl` são overkill para anos cheios.
 */
function calculateAge(dob: string): number | null {
  if (!dob) return null
  // Parse como data local (sem timezone shift) — dob vem do <input type=date>
  // em UTC-naive (YYYY-MM-DD), então new Date('1990-05-01T00:00:00') funciona
  const birth = new Date(dob + 'T00:00:00')
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age >= 0 ? age : null
}

const ROLES = [
  { value: 'member',      label: 'Membro'       },
  { value: 'coordinator', label: 'Coordenador'   },
]

const ADDRESS_TYPES = ['casa', 'trabalho', 'faculdade', 'outros'] as const

type PermissionKey =
  | 'reset_member_password'
  | 'reset_coordinator_password'
  | 'create_members'
  | 'delete_members'
  | 'inactivate_members'

const PERMISSION_OPTIONS: { key: PermissionKey; label: string }[] = [
  { key: 'reset_member_password',      label: 'Permite resetar senha de membros/atletas' },
  { key: 'reset_coordinator_password', label: 'Permite resetar senha de coordenadores' },
  { key: 'create_members',             label: 'Permite criar membros/atletas' },
  { key: 'delete_members',             label: 'Permite excluir membros/atletas' },
  { key: 'inactivate_members',         label: 'Permite inativar membros/atletas' },
]

const DEFAULT_PERMS: Record<PermissionKey, boolean> = {
  reset_member_password: false,
  reset_coordinator_password: false,
  create_members: false,
  delete_members: false,
  inactivate_members: false,
}

/**
 * Permissões padrão ao CRIAR um coordenador. Coordenadores geralmente precisam
 * ser capazes de cadastrar atletas do time deles — então `create_members` vem
 * ligado por padrão; as demais ficam desligadas e o admin liga conforme julgar.
 */
const COORDINATOR_DEFAULT_PERMS: Record<PermissionKey, boolean> = {
  reset_member_password: false,
  reset_coordinator_password: false,
  create_members: true,
  delete_members: false,
  inactivate_members: false,
}

interface FormState {
  name: string
  role: string
  /**
   * "Também é atleta" — controla se o usuário aparece em /dashboard/members e
   * tem row em `public.members`. Respeitado SÓ quando `role='coordinator'`.
   * Quando `role='member'`, o efetivo é sempre true (membro é atleta por def.).
   */
  is_athlete: boolean
  dob: string
  cpf: string
  rg: string
  origin_type: string
  origin_street: string
  origin_neighborhood: string
  origin_zip: string
  destination_type: string
  destination_street: string
  destination_neighborhood: string
  destination_zip: string
  email: string
  category_ids: string[]
  /** `{ category_id: position_ids[] }` — positions por categoria (Ajuste 2). */
  category_positions: Record<string, string[]>
}

const emptyForm = (): FormState => ({
  name: '', role: 'member', is_athlete: true, dob: '', cpf: '', rg: '',
  origin_type: 'casa', origin_street: '', origin_neighborhood: '', origin_zip: '',
  destination_type: 'casa', destination_street: '', destination_neighborhood: '', destination_zip: '',
  email: '',
  category_ids: [], category_positions: {},
})

function userToForm(u: PlatformUser): FormState {
  return {
    name: u.name,
    role: u.role,
    is_athlete: u.is_athlete,
    dob: u.dob ?? '',
    cpf: u.cpf ?? '',
    rg: u.rg ?? '',
    origin_type: u.origin_type ?? 'casa',
    origin_street: u.origin_street ?? '',
    origin_neighborhood: u.origin_neighborhood ?? '',
    origin_zip: u.origin_zip ?? '',
    destination_type: u.destination_type ?? 'casa',
    destination_street: u.destination_street ?? '',
    destination_neighborhood: u.destination_neighborhood ?? '',
    destination_zip: u.destination_zip ?? '',
    email: u.email,
    category_ids: u.category_ids,
    category_positions: u.category_positions,
  }
}

/**
 * Valor efetivo da flag para persistir. `role='member'` força `true` porque
 * semanticamente membro é atleta; coordenador respeita a checkbox.
 */
function effectiveIsAthlete(form: FormState): boolean {
  return form.role === 'member' || form.is_athlete
}

function userToPerms(u: PlatformUser): Record<PermissionKey, boolean> {
  return {
    reset_member_password:      u.permissions.reset_member_password      ?? false,
    reset_coordinator_password: u.permissions.reset_coordinator_password ?? false,
    create_members:             u.permissions.create_members             ?? false,
    delete_members:             u.permissions.delete_members             ?? false,
    inactivate_members:         u.permissions.inactivate_members         ?? false,
  }
}

type View = 'list' | 'edit' | 'create'
type UserTab = 'coordinators' | 'athletes'

export function UsersSection({
  users,
  categories,
  positions,
  initialUserId,
  onDirtyChange,
  planName,
  memberCount,
  maxMembers,
  bypassLimits,
  orgId,
  orgSlug,
}: {
  users: PlatformUser[]
  categories: Category[]
  positions: Position[]
  initialUserId?: string
  onDirtyChange?: (dirty: boolean) => void
  planName: string
  memberCount: number
  maxMembers: number
  bypassLimits: boolean
  orgId?: string
  /**
   * Slug único da organização — usado para montar a senha temporária
   * (`{cpf4}@{slug}`) e os hints mostrados em "Conta". `null` acontece só
   * em contextos sem org resolvida (super_admin sem drilldown), nesses
   * casos cai no placeholder genérico.
   */
  orgSlug: string | null
}) {
  const passwordSlug = orgSlug ?? 'apita-ai'
  const router = useRouter()
  const orgOpts = useMemo<TargetOrgOpts | undefined>(
    () => (orgId ? { forOrgId: orgId } : undefined),
    [orgId]
  )
  const [view, setView] = useState<View>(initialUserId ? 'edit' : 'list')
  const [userTab, setUserTab] = useState<UserTab>('athletes')
  const [selectedId, setSelectedId] = useState<string | null>(initialUserId ?? null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [perms, setPerms] = useState<Record<PermissionKey, boolean>>(DEFAULT_PERMS)
  // Snapshots do estado no momento em que a view foi aberta. Usados pelo
  // dirty-tracking real: a tela só marca "alterações não salvas" quando o
  // usuário de fato mudou algo em relação ao snapshot original. null = em
  // list, sem form aberto (dirty=false por definição).
  const [originalForm, setOriginalForm] = useState<FormState | null>(null)
  const [originalPerms, setOriginalPerms] = useState<Record<PermissionKey, boolean> | null>(null)
  const [search, setSearch] = useState('')
  const [isPending, startTransition] = useTransition()
  const [cepLoading, setCepLoading] = useState({ origin: false, destination: false })
  const [cepError, setCepError]     = useState<{ origin: string | null; destination: string | null }>({ origin: null, destination: null })
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [resetMsg, setResetMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [permsMsg, setPermsMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  // Confirmação de troca de e-mail de login (Ajuste 4)
  const [showEmailChangeDialog, setShowEmailChangeDialog] = useState(false)

  // Initialize edit form when user is pre-selected from URL
  const initializedRef = useRef(false)
  useEffect(() => {
    if (!initializedRef.current && initialUserId) {
      const u = users.find((u) => u.id === initialUserId)
      if (u) {
        const initialForm = userToForm(u)
        const initialPerms = userToPerms(u)
        setForm(initialForm)
        setPerms(initialPerms)
        setOriginalForm(initialForm)
        setOriginalPerms(initialPerms)
        initializedRef.current = true
      }
    }
  }, [users, initialUserId])

  // Dirty-tracking real: só marca "alterações não salvas" se form/perms
  // divergem do snapshot capturado em openEdit/openCreate. Em `list` sem
  // snapshot, dirty = false. Comparamos via JSON.stringify (estados são
  // serializáveis e a ordem de chaves segue a ordem de inserção do JS).
  useEffect(() => {
    if (view === 'list' || !originalForm || !originalPerms) {
      onDirtyChange?.(false)
      return
    }
    const formChanged = JSON.stringify(form) !== JSON.stringify(originalForm)
    const permsChanged = JSON.stringify(perms) !== JSON.stringify(originalPerms)
    onDirtyChange?.(formChanged || permsChanged)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, form, perms, originalForm, originalPerms])

  const selectedUser = users.find((u) => u.id === selectedId)

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  )
  void filtered

  function openEdit(u: PlatformUser) {
    setSelectedId(u.id)
    const initialForm = userToForm(u)
    const initialPerms = userToPerms(u)
    setForm(initialForm)
    setPerms(initialPerms)
    setOriginalForm(initialForm)
    setOriginalPerms(initialPerms)
    setMsg(null)
    setResetMsg(null)
    setPermsMsg(null)
    setView('edit')
  }

  function openCreate() {
    setSelectedId(null)
    // Atletas tab → role=member + is_athlete=true; Coord tab → role=coordinator
    // + is_athlete=false por padrão (o admin decide explicitamente).
    const creatingCoord = userTab === 'coordinators'
    const initialForm: FormState = {
      ...emptyForm(),
      role: creatingCoord ? 'coordinator' : 'member',
      is_athlete: creatingCoord ? false : true,
    }
    // Defaults de permissões: coordenador cria com create_members ligado
    // (padrão típico); atleta começa com tudo desligado.
    const initialPerms = creatingCoord
      ? { ...COORDINATOR_DEFAULT_PERMS }
      : { ...DEFAULT_PERMS }
    setForm(initialForm)
    setPerms(initialPerms)
    setOriginalForm(initialForm)
    setOriginalPerms(initialPerms)
    setMsg(null)
    setView('create')
  }

  function backToList() {
    setView('list')
    // Dropa os snapshots — dirty passa a ser false (view==='list').
    setOriginalForm(null)
    setOriginalPerms(null)
    setMsg(null)
    setResetMsg(null)
    setPermsMsg(null)
  }

  async function handleFetchCEP(dir: 'origin' | 'destination', rawValue: string) {
    const digits = rawValue.replace(/\D/g, '')
    if (digits.length !== 8) return
    setCepLoading((p) => ({ ...p, [dir]: true }))
    setCepError((p) => ({ ...p, [dir]: null }))
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (data.erro) {
        setCepError((p) => ({ ...p, [dir]: 'CEP não encontrado.' }))
        return
      }
      setForm((f) => ({
        ...f,
        [`${dir}_street`]:       data.logradouro ?? f[`${dir}_street`       as keyof FormState],
        [`${dir}_neighborhood`]: data.bairro      ?? f[`${dir}_neighborhood` as keyof FormState],
      }))
    } catch {
      setCepError((p) => ({ ...p, [dir]: 'Erro ao consultar CEP.' }))
    } finally {
      setCepLoading((p) => ({ ...p, [dir]: false }))
    }
  }

  function toggleCategory(id: string) {
    setForm((f) => {
      const isSelected = f.category_ids.includes(id)
      if (isSelected) {
        // Desmarca categoria: remove também as positions associadas a ela
        const { [id]: _removed, ...rest } = f.category_positions
        void _removed
        return {
          ...f,
          category_ids: f.category_ids.filter((x) => x !== id),
          category_positions: rest,
        }
      }
      return {
        ...f,
        category_ids: [...f.category_ids, id],
      }
    })
  }

  /** Toggle de uma posição dentro de uma categoria específica. */
  function togglePosition(categoryId: string, positionId: string) {
    setForm((f) => {
      const current = f.category_positions[categoryId] ?? []
      const next = current.includes(positionId)
        ? current.filter((x) => x !== positionId)
        : [...current, positionId]
      if (next.length === 0) {
        const { [categoryId]: _removed, ...rest } = f.category_positions
        void _removed
        return { ...f, category_positions: rest }
      }
      return { ...f, category_positions: { ...f.category_positions, [categoryId]: next } }
    })
  }

  function togglePerm(key: PermissionKey) {
    setPerms((p) => ({ ...p, [key]: !p[key] }))
  }

  function handleSaveData(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    // Intercepta salvamento se o e-mail de login foi alterado — exige confirmação
    // explícita antes de persistir (usuário só consegue logar com o novo e-mail).
    const originalEmail = selectedUser?.email ?? ''
    const newEmail = form.email.trim()
    if (newEmail && newEmail !== originalEmail) {
      setShowEmailChangeDialog(true)
      return
    }
    persistSaveData()
  }

  function persistSaveData() {
    if (!selectedId) return
    setMsg(null)
    startTransition(async () => {
      try {
        await adminUpdateUser(selectedId, {
          name: form.name,
          role: form.role,
          is_athlete: effectiveIsAthlete(form),
          dob: form.dob || null,
          cpf: form.cpf || null,
          rg: form.rg || null,
          email: form.email.trim() || undefined,
          origin_type: form.origin_type || null,
          origin_street: form.origin_street || null,
          origin_neighborhood: form.origin_neighborhood || null,
          origin_zip: form.origin_zip || null,
          destination_type: form.destination_type || null,
          destination_street: form.destination_street || null,
          destination_neighborhood: form.destination_neighborhood || null,
          destination_zip: form.destination_zip || null,
        }, orgOpts)
        router.refresh()
        // Atualiza snapshot: o que acabou de persistir vira o novo "original"
        // — dirty volta pra false sem precisar fechar a view.
        setOriginalForm(form)
        setMsg({ type: 'success', text: 'Dados atualizados com sucesso.' })
      } catch (err) {
        setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao salvar.' })
      }
    })
  }

  function handleSaveClub() {
    if (!selectedId) return
    setMsg(null)
    startTransition(async () => {
      try {
        await adminUpdateUserClub(
          selectedId,
          selectedUser?.member_id ?? null,
          form.category_ids,
          form.category_positions,
          orgOpts
        )
        router.refresh()
        // Atualiza snapshot parcial: category_ids e category_positions acabaram
        // de ser salvos — reflete no originalForm para não marcar dirty.
        setOriginalForm((prev) =>
          prev ? { ...prev, category_ids: form.category_ids, category_positions: form.category_positions } : prev,
        )
        setMsg({ type: 'success', text: 'Dados de clube atualizados.' })
      } catch (err) {
        setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao salvar.' })
      }
    })
  }

  function handleResetPassword() {
    if (!selectedId) return
    setResetMsg(null)
    startTransition(async () => {
      try {
        await adminResetPassword(selectedId, orgOpts)
        setResetMsg({ type: 'success', text: `Senha resetada para: {4 dígitos do CPF}@${passwordSlug}` })
      } catch (err) {
        setResetMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao resetar.' })
      }
    })
  }

  function handleSavePermissions() {
    if (!selectedId) return
    setPermsMsg(null)
    startTransition(async () => {
      try {
        await adminUpdatePermissions(selectedId, perms, orgOpts)
        setOriginalPerms(perms)
        setPermsMsg({ type: 'success', text: 'Permissões atualizadas com sucesso.' })
      } catch (err) {
        setPermsMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao salvar.' })
      }
    })
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setMsg(null)
    startTransition(async () => {
      try {
        await adminCreateUser({
          email: form.email,
          name: form.name,
          role: form.role,
          is_athlete: effectiveIsAthlete(form),
          // Passa permissões só para coord — adminCreateUser ignora pra outros roles.
          permissions: form.role === 'coordinator' ? perms : undefined,
          dob: form.dob || undefined,
          cpf: form.cpf || undefined,
          rg: form.rg || undefined,
          origin_type: form.origin_type || undefined,
          origin_street: form.origin_street || undefined,
          origin_neighborhood: form.origin_neighborhood || undefined,
          origin_zip: form.origin_zip || undefined,
          destination_type: form.destination_type || undefined,
          destination_street: form.destination_street || undefined,
          destination_neighborhood: form.destination_neighborhood || undefined,
          destination_zip: form.destination_zip || undefined,
          category_ids: form.category_ids,
          category_positions: form.category_positions,
        }, orgOpts)
        router.refresh()
        backToList()
      } catch (err) {
        setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao criar usuário.' })
      }
    })
  }

  function confirmDelete(userId: string) {
    setDeletingId(userId)
    setShowDeleteDialog(true)
  }

  function handleDelete() {
    if (!deletingId) return
    startTransition(async () => {
      await adminDeleteUser(deletingId, orgOpts)
      router.refresh()
      setShowDeleteDialog(false)
      setDeletingId(null)
      if (view === 'edit' && selectedId === deletingId) backToList()
    })
  }

  // ── Shared form tabs ──────────────────────────────────────────────────
  function renderFormTabs(isCreate: boolean) {
    // Permissões só fazem sentido pra coordenador (atleta não gerencia nada).
    // Vale para create e edit uniformemente.
    const showPermissions = form.role === 'coordinator'
    const tabCount = showPermissions ? 5 : 4
    const gridClass = tabCount === 5 ? 'grid-cols-5' : 'grid-cols-4'

    return (
      <Tabs defaultValue="dados" className="space-y-4">
        <TabsList className={`grid ${gridClass} h-9`}>
          <TabsTrigger value="dados"     className="text-xs">Dados</TabsTrigger>
          <TabsTrigger value="logistica" className="text-xs">Logística</TabsTrigger>
          <TabsTrigger value="clube"     className="text-xs">Clube</TabsTrigger>
          <TabsTrigger value="conta"     className="text-xs">Conta</TabsTrigger>
          {showPermissions && (
            <TabsTrigger value="permissoes" className="text-xs">Permissões</TabsTrigger>
          )}
        </TabsList>

        {/* ── Dados pessoais ── */}
        <TabsContent value="dados" className="space-y-4">
          {isCreate && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">E-mail (login) *</Label>
                <Input
                  type="email" placeholder="email@exemplo.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="h-9" required
                />
                <p className="text-[11px] text-muted-foreground/70 leading-snug">
                  Único campo realmente obrigatório. O usuário completa os demais dados no primeiro acesso.
                </p>
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Nome</Label>
            <Input
              placeholder="Nome completo ou primeiro nome (opcional)"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Função</Label>
            <div className="flex gap-1.5">
              {ROLES.map((r) => (
                <button
                  key={r.value} type="button"
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      role: r.value,
                      // Ao virar membro, forçamos is_athlete=true (member é atleta
                      // por definição). Ao virar coordenador, preserva a flag.
                      is_athlete: r.value === 'member' ? true : f.is_athlete,
                    }))
                    // No fluxo de CREATE, trocar de atleta pra coord (ou vice-versa)
                    // reseta os defaults de permissões. Em edit não mexe — o admin
                    // pode estar ajustando manualmente.
                    if (isCreate) {
                      setPerms(
                        r.value === 'coordinator'
                          ? { ...COORDINATOR_DEFAULT_PERMS }
                          : { ...DEFAULT_PERMS },
                      )
                    }
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    form.role === r.value
                      ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                      : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* Checkbox "também é atleta" — aparece só para coordenadores. */}
          {form.role === 'coordinator' && (
            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_athlete}
                  onChange={(e) => setForm((f) => ({ ...f, is_athlete: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 rounded border-border/60 accent-primary cursor-pointer"
                />
                <div className="flex-1">
                  <span className="text-xs font-medium">Também é atleta</span>
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">
                    Aparece na lista de Atletas e participa dos treinos. As permissões de login continuam de coordenador.
                  </p>
                </div>
              </label>
            </div>
          )}
          {form.role === 'member' && (
            <p className="text-[11px] text-muted-foreground/70">
              Atletas sempre aparecem nos treinos e na lista de membros.
            </p>
          )}
          <div className="grid grid-cols-[2fr_1fr_2fr] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Data de nascimento</Label>
              <Input type="date" value={form.dob} className="h-9"
                onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))} />
              <p className="text-[11px] text-muted-foreground/70 leading-snug">
                *usado para cadastro em torneios e campeonatos
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Idade</Label>
              {/*
                Campo calculado automaticamente a partir da DOB. Disabled pra
                deixar claro que não é editável; a fonte da verdade continua
                sendo `form.dob` e a idade é derivada em runtime (não persiste
                no banco — calcula on-demand onde precisar).
              */}
              <Input
                value={(() => {
                  const age = calculateAge(form.dob)
                  return age !== null ? `${age} ${age === 1 ? 'ano' : 'anos'}` : '—'
                })()}
                disabled
                readOnly
                className="h-9 bg-muted/40 text-muted-foreground cursor-not-allowed text-center"
                tabIndex={-1}
              />
              <p className="text-[11px] text-muted-foreground/50 leading-snug">
                Calculada automaticamente
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">CPF</Label>
              <Input
                placeholder="00000000000"
                value={form.cpf}
                inputMode="numeric"
                className="h-9 font-mono tracking-wider"
                maxLength={11}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 11)
                  setForm((f) => ({ ...f, cpf: v }))
                }}
              />
              <p className="text-[11px] text-muted-foreground/70 leading-snug">
                *usado para cadastro em torneios e campeonatos
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">RG</Label>
            <Input
              placeholder="0000000000"
              value={form.rg}
              inputMode="numeric"
              className="h-9 font-mono tracking-wider"
              maxLength={10}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 10)
                setForm((f) => ({ ...f, rg: v }))
              }}
            />
            <p className="text-[11px] text-muted-foreground/70 leading-snug">
              *usado para cadastro em torneios e campeonatos
            </p>
          </div>
        </TabsContent>

        {/* ── Logística ── */}
        <TabsContent value="logistica" className="space-y-6">
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-snug">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              *usado para ver quem mora perto e tentar melhorar a logística dos nossos atletas. Não é necessário informar número/apartamento — <strong>apenas</strong> a rua.
            </span>
          </div>
          {(['origin', 'destination'] as const).map((dir) => {
            const label = dir === 'origin' ? 'Saída para o treino' : 'Destino após o treino'
            const typeKey  = `${dir}_type`  as keyof FormState
            const streetKey = `${dir}_street` as keyof FormState
            const nbhKey   = `${dir}_neighborhood` as keyof FormState
            const zipKey   = `${dir}_zip`   as keyof FormState
            return (
              <div key={dir} className="space-y-3">
                <Label className="text-sm font-semibold">{label}</Label>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">CEP</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="00000000"
                      value={form[zipKey] as string}
                      inputMode="numeric"
                      className="h-9 w-32 font-mono"
                      maxLength={8}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, '').slice(0, 8)
                        setForm((f) => ({ ...f, [zipKey]: v }))
                        if (v.length === 8) handleFetchCEP(dir, v)
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleFetchCEP(dir, form[zipKey] as string)}
                      disabled={cepLoading[dir]}
                      title="Buscar endereço pelo CEP (ViaCEP)"
                      className="h-9 w-9 flex items-center justify-center rounded-md border border-border/60 bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                      {cepLoading[dir]
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Search className="h-3.5 w-3.5" />}
                    </button>
                    <span className="text-[11px] text-muted-foreground">
                      Preenche rua e bairro automaticamente.
                    </span>
                  </div>
                  {cepError[dir] && (
                    <p className="text-[11px] text-rose-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {cepError[dir]}
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {ADDRESS_TYPES.map((t) => (
                    <button key={t} type="button"
                      onClick={() => setForm((f) => ({ ...f, [typeKey]: t }))}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all capitalize ${
                        form[typeKey] === t
                          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                          : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Rua</Label>
                    <Input value={form[streetKey] as string} className="h-9"
                      onChange={(e) => setForm((f) => ({ ...f, [streetKey]: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Bairro</Label>
                    <Input value={form[nbhKey] as string} className="h-9"
                      onChange={(e) => setForm((f) => ({ ...f, [nbhKey]: e.target.value }))} />
                  </div>
                </div>
              </div>
            )
          })}
        </TabsContent>

        {/* ── Clube (categorias + posições por categoria) ── */}
        <TabsContent value="clube" className="space-y-5">
          {!effectiveIsAthlete(form) ? (
            <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Este coordenador não é atleta.
              </p>
              <p className="text-[11px] text-muted-foreground/70 mt-1">
                Ative “Também é atleta” na aba <strong>Dados</strong> para associar categorias e posições.
              </p>
            </div>
          ) : (
          <>
          {categories.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Categorias</Label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((cat) => (
                  <button key={cat.id} type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                      form.category_ids.includes(cat.id)
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {positions.length > 0 && form.category_ids.length > 0 && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-medium">Posições por categoria</Label>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Selecione as posições que o atleta joga em cada categoria. O mesmo atleta pode ocupar posições diferentes em categorias diferentes.
                </p>
              </div>
              {form.category_ids.map((catId) => {
                const cat = categories.find((c) => c.id === catId)
                if (!cat) return null
                const selectedForCat = form.category_positions[catId] ?? []
                return (
                  <div key={catId} className="space-y-1.5 rounded-lg border border-border/40 bg-muted/20 p-3">
                    <p className="text-xs font-semibold text-foreground/80">{cat.name}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {positions.map((pos) => (
                        <button key={pos.id} type="button"
                          onClick={() => togglePosition(catId, pos.id)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                            selectedForCat.includes(pos.id)
                              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                              : 'bg-card border-border/60 text-muted-foreground hover:border-primary/40'
                          }`}
                        >
                          {pos.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {positions.length > 0 && form.category_ids.length === 0 && (
            <p className="text-[11px] text-muted-foreground/70">
              Selecione ao menos uma categoria para atribuir posições.
            </p>
          )}
          {!isCreate && (
            <div className="flex justify-end pt-2">
              <Button type="button" size="sm" disabled={isPending} onClick={handleSaveClub} className="h-8 shadow-sm">
                {isPending ? 'Salvando…' : 'Salvar clube'}
              </Button>
            </div>
          )}
          </>
          )}
        </TabsContent>

        {/* ── Conta ── */}
        <TabsContent value="conta" className="space-y-5">
          {/* E-mail de login — editável; mudança exige confirmação antes de persistir */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">E-mail (login)</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="h-9 pl-8"
              />
            </div>
            {!isCreate && selectedUser && form.email.trim() !== selectedUser.email && (
              <p className="text-[11px] text-amber-700 flex items-center gap-1">
                <AlertCircle className="h-3 w-3 shrink-0" />
                Ao salvar, este usuário só conseguirá logar com o novo e-mail.
              </p>
            )}
            {!isCreate && (
              <p className="text-[11px] text-muted-foreground/60">
                Este é o e-mail de acesso ao sistema. Altere com cuidado.
              </p>
            )}
          </div>

          {/* Senha — nunca exibida */}
          {!isCreate && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Senha</Label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/30" />
                  <Input
                    value="••••••••••••"
                    disabled
                    className="h-9 pl-8 bg-muted/30 text-muted-foreground cursor-not-allowed tracking-widest"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={handleResetPassword}
                  className="h-9 gap-1.5 shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Resetar
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                Reset define a senha como: <span className="font-mono">{'<'}4 dígitos do CPF{'>'}@{passwordSlug}</span>
              </p>
              {resetMsg && (
                <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                  resetMsg.type === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    : 'bg-rose-50 text-rose-700 border border-rose-100'
                }`}>
                  {resetMsg.type === 'success'
                    ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                    : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                  {resetMsg.text}
                </div>
              )}
            </div>
          )}

          {isCreate && (
            <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-3 text-xs text-amber-700 space-y-1">
              <p className="font-medium">Senha inicial gerada automaticamente:</p>
              <p>
                Se CPF informado:{' '}
                <span className="font-mono">{'<'}4 primeiros dígitos{'>'}@{passwordSlug}</span>
              </p>
              <p>
                Sem CPF:{' '}
                <span className="font-mono">{passwordSlug}@2026</span>
              </p>
              <p className="text-amber-600/80 mt-1">O usuário poderá alterar em Perfil após o 1º acesso.</p>
            </div>
          )}
        </TabsContent>

        {/* ── Permissões (apenas quando role === 'coordinator') ── */}
        {showPermissions && (
          <TabsContent value="permissoes" className="space-y-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-violet-600" />
                <p className="text-sm font-semibold">Cadastro</p>
              </div>
              <p className="text-xs text-muted-foreground">
                Controle o que este coordenador pode fazer na plataforma.
              </p>
            </div>

            <div className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground/80 leading-snug">
              Estas permissões são gerenciadas exclusivamente pelo admin (contratante). Um coordenador logado não vê esta aba.
            </div>

            <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
              {PERMISSION_OPTIONS.map((opt, i) => (
                <div
                  key={opt.key}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i < PERMISSION_OPTIONS.length - 1 ? 'border-b border-border/30' : ''
                  }`}
                >
                  <span className="text-sm">{opt.label}</span>
                  <button
                    type="button"
                    onClick={() => togglePerm(opt.key)}
                    aria-pressed={perms[opt.key]}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      perms[opt.key] ? 'bg-primary' : 'bg-muted'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                        perms[opt.key] ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>

            {/* Em CREATE, as permissões são persistidas junto com o submit do formulário.
                Em EDIT, há botão dedicado + mensagem de feedback. */}
            {isCreate ? (
              <p className="text-[11px] text-muted-foreground/70">
                As permissões serão salvas ao clicar em <strong>Criar usuário</strong>.
              </p>
            ) : (
              <>
                {permsMsg && (
                  <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
                    permsMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                      : 'bg-rose-50 text-rose-700 border border-rose-100'
                  }`}>
                    {permsMsg.type === 'success'
                      ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                      : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                    {permsMsg.text}
                  </div>
                )}
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    disabled={isPending}
                    onClick={handleSavePermissions}
                    className="h-8 shadow-sm"
                  >
                    {isPending ? 'Salvando…' : 'Salvar permissões'}
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        )}
      </Tabs>
    )
  }

  // ── LIST VIEW ─────────────────────────────────────────────────────────
  if (view === 'list') {
    const coordinators = users.filter((u) => u.role === 'coordinator')
    // Atletas: todo mundo com is_athlete=true (inclui coord-atletas) mais os
    // role='member' (que sempre são atletas). Exclui admins que não marcaram.
    const athletes = users.filter((u) => u.is_athlete || u.role === 'member')
    const tabUsers = userTab === 'coordinators' ? coordinators : athletes

    const filteredTab = tabUsers.filter(
      (u) =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
    )

    const newLabel = userTab === 'coordinators' ? 'Novo Coordenador' : 'Novo Atleta'
    const athleteLimitReached = !bypassLimits && memberCount >= maxMembers
    const createDisabled = userTab === 'athletes' && athleteLimitReached

    function renderTable(list: PlatformUser[], emptyMsg: string) {
      if (list.length === 0) {
        return (
          <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 mb-3">
              <User className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">{emptyMsg}</p>
          </div>
        )
      }
      return (
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
          <div className="grid grid-cols-[2fr_2fr_60px] gap-4 px-4 py-2.5 bg-muted/30 border-b border-border/40 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>Nome</span>
            <span>E-mail</span>
            <span />
          </div>
          {list.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-[2fr_2fr_60px] gap-4 px-4 py-3 border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors items-center cursor-pointer"
              onClick={() => openEdit(u)}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                  {u.name ? u.name.charAt(0).toUpperCase() : '?'}
                </div>
                <span className="text-sm font-medium truncate">{u.name || '—'}</span>
                {userTab === 'athletes' && u.role === 'coordinator' && (
                  <span className="flex items-center gap-0.5 text-[10px] font-medium bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded shrink-0">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    Coord
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate">{u.email}</span>
              <div className="flex gap-0.5 justify-end" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => confirmDelete(u.id)}
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              placeholder="Buscar por nome ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-card border-border/50"
            />
          </div>
          <Button
            onClick={openCreate}
            size="sm"
            className="gap-1.5 h-9 shadow-sm"
            disabled={createDisabled}
            title={createDisabled ? `Limite do plano ${planName} atingido` : undefined}
          >
            <Plus className="h-4 w-4" />
            {newLabel}
          </Button>
        </div>

        {!bypassLimits && (
          <div className="text-xs text-muted-foreground">
            Plano <strong>{planName}</strong>: {memberCount}/{maxMembers} atletas ativos
          </div>
        )}
        {athleteLimitReached && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Limite de {maxMembers} atleta(s) do plano <strong>{planName}</strong> atingido.
            Entre em contato para fazer upgrade.
          </div>
        )}

        {/* Coordinator / Athlete tabs */}
        <div className="flex gap-0 border-b border-border/40">
          {([
            { id: 'coordinators' as UserTab, label: 'Coordenação', count: coordinators.length, icon: ShieldCheck },
            { id: 'athletes'     as UserTab, label: 'Atletas',     count: athletes.length,     icon: User        },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setUserTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                userTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              <span className={`ml-0.5 text-xs rounded-full px-1.5 py-0.5 font-medium ${
                userTab === tab.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Note for coordinators with athlete data */}
        {userTab === 'coordinators' && coordinators.length > 0 && (
          <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            Coordenadores com dados de clube (categorias/posições) aparecem também na área de Membros.
          </p>
        )}

        {/* Link de convite — só aparece na aba Atletas. O admin/coord gera o
            link aqui e envia pros atletas por WhatsApp/e-mail; cada atleta
            abre /join/[token] e se auto-cadastra. Unmount quando troca pra
            aba Coordenação pra não desperdiçar fetch quando o card não
            está visível. */}
        {userTab === 'athletes' && <InviteLinkCard />}

        {renderTable(
          filteredTab,
          userTab === 'coordinators'
            ? (coordinators.length === 0 ? 'Nenhum coordenador cadastrado.' : 'Nenhum resultado encontrado.')
            : (athletes.length === 0 ? 'Nenhum atleta cadastrado.' : 'Nenhum resultado encontrado.')
        )}

        {/* Delete confirmation */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "'Outfit', sans-serif" }}>Excluir usuário?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              O usuário perderá acesso à plataforma. Esta ação não pode ser desfeita.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="h-9">Cancelar</Button>
              <Button variant="destructive" disabled={isPending} onClick={handleDelete} className="h-9">
                {isPending ? 'Excluindo…' : 'Excluir'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ── EDIT VIEW ─────────────────────────────────────────────────────────
  if (view === 'edit' && selectedUser) {
    const isCoordinator = selectedUser.role === 'coordinator'
    return (
      <div className="space-y-5 max-w-2xl">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={backToList}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <div className="h-4 w-px bg-border/50" />
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
              {selectedUser.name ? selectedUser.name.charAt(0).toUpperCase() : '?'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold leading-none">{selectedUser.name || '—'}</p>
                {isCoordinator && (
                  <span className="flex items-center gap-0.5 text-[10px] font-medium bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    Coordenador
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{selectedUser.email}</p>
            </div>
          </div>
          {isCoordinator && selectedUser.member_id && (
            <span className="ml-auto text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-lg">
              Também aparece em Membros
            </span>
          )}
        </div>

        <form onSubmit={handleSaveData}>
          {renderFormTabs(false)}

          {msg && (
            <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 mt-4 ${
              msg.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-rose-50 text-rose-700 border border-rose-100'
            }`}>
              {msg.type === 'success'
                ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              {msg.text}
            </div>
          )}

          <div className="flex items-center justify-between mt-5 pt-4 border-t border-border/40">
            <button
              type="button"
              onClick={() => confirmDelete(selectedUser.id)}
              className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir usuário
            </button>
            <Button type="submit" disabled={isPending} size="sm" className="h-8 shadow-sm">
              {isPending ? 'Salvando…' : 'Salvar alterações'}
            </Button>
          </div>
        </form>

        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "'Outfit', sans-serif" }}>Excluir usuário?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              O usuário perderá acesso à plataforma. Esta ação não pode ser desfeita.
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)} className="h-9">Cancelar</Button>
              <Button variant="destructive" disabled={isPending} onClick={handleDelete} className="h-9">
                {isPending ? 'Excluindo…' : 'Excluir'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmação de troca de e-mail de login (Ajuste 4) */}
        <Dialog open={showEmailChangeDialog} onOpenChange={setShowEmailChangeDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle style={{ fontFamily: "'Outfit', sans-serif" }}>Trocar e-mail de login?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Vai trocar o login deste usuário de:
              </p>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 font-mono text-xs break-all">
                {selectedUser?.email ?? '—'}
              </div>
              <p className="text-muted-foreground">para:</p>
              <div className="rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 font-mono text-xs break-all">
                {form.email.trim()}
              </div>
              <p className="text-amber-700 text-xs flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Depois de salvar, ele só consegue entrar com o novo e-mail. Confirmar?
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowEmailChangeDialog(false)} className="h-9">
                Cancelar
              </Button>
              <Button
                disabled={isPending}
                onClick={() => {
                  setShowEmailChangeDialog(false)
                  persistSaveData()
                }}
                className="h-9"
              >
                {isPending ? 'Salvando…' : 'Confirmar troca'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ── CREATE VIEW ───────────────────────────────────────────────────────
  if (view === 'create') {
    return (
      <div className="space-y-5 max-w-2xl">
        <div className="flex items-center gap-3">
          <button
            onClick={backToList}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </button>
          <div className="h-4 w-px bg-border/50" />
          <p className="text-sm font-medium">Novo usuário</p>
        </div>

        <form onSubmit={handleCreate}>
          {renderFormTabs(true)}

          {msg && (
            <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 mt-4 ${
              msg.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : 'bg-rose-50 text-rose-700 border border-rose-100'
            }`}>
              {msg.type === 'success'
                ? <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              {msg.text}
            </div>
          )}

          <div className="flex justify-end mt-5 pt-4 border-t border-border/40">
            <Button
              type="submit"
              disabled={isPending || !form.email.trim()}
              size="sm"
              className="h-8 shadow-sm"
            >
              {isPending ? 'Criando…' : 'Criar usuário'}
            </Button>
          </div>
        </form>
      </div>
    )
  }

  return null
}
