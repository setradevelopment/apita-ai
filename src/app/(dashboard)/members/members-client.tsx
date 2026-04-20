'use client'

import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Pencil, Trash2, Users, Search, ExternalLink, ShieldCheck,
  Columns3, RotateCcw, Check, ArrowUp, ArrowDown, ChevronsUpDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { deleteMember } from '@/app/actions/members'
import type { TargetOrgOpts } from '@/lib/auth/resolve-org'

interface Member {
  id: string
  name: string
  dob?: string | null
  cpf?: string | null
  rg?: string | null
  user_id?: string | null
  /**
   * Role do profile vinculado (quando `user_id` existe). Usado pra renderizar
   * o chip "Coord" em coordenadores-atletas. `null` quando o member não tem
   * user (atleta legado sem login).
   */
  role?: string | null
  /** E-mail de login (resolvido via admin client em `page.tsx`). */
  email?: string | null
  origin_type?: string | null
  origin_street?: string | null
  origin_neighborhood?: string | null
  origin_zip?: string | null
  destination_type?: string | null
  destination_street?: string | null
  destination_neighborhood?: string | null
  destination_zip?: string | null
  created_at?: string | null
  member_categories: { category_id: string }[]
  member_category_positions: { category_id: string; position_id: string }[]
}

interface Category { id: string; name: string }
interface Position { id: string; name: string }

// ── Column definitions ──────────────────────────────────────────────────

type ColumnId =
  | 'name' | 'role' | 'categories' | 'positions'
  | 'dob' | 'age' | 'cpf' | 'rg' | 'email'
  | 'origin_type' | 'origin_street' | 'origin_neighborhood' | 'origin_zip'
  | 'destination_type' | 'destination_street' | 'destination_neighborhood' | 'destination_zip'
  | 'created_at'

interface ColumnDef {
  id: ColumnId
  label: string
  group: 'Identificação' | 'Logística' | 'Sistema'
  /** `true` = sempre visível, usuário não pode esconder. Somente `name`. */
  required?: boolean
  /** `true` = visível por padrão no primeiro render (sem preferência salva). */
  defaultVisible: boolean
  /** CSS min-width da coluna (px). */
  minWidth: number
  /**
   * Tipo de ordenação — controla o comparador usado quando a coluna é o
   * critério de sort. `null` = coluna não é ordenável (ex.: listas como
   * categorias/posições, onde ordenar pela string agregada é confuso).
   */
  sortType: 'string' | 'number' | 'date' | null
}

const COLUMNS: ColumnDef[] = [
  { id: 'name',                    label: 'Nome',              group: 'Identificação', required: true, defaultVisible: true,  minWidth: 200, sortType: 'string' },
  { id: 'role',                    label: 'Função',            group: 'Identificação',                  defaultVisible: false, minWidth: 130, sortType: 'string' },
  { id: 'categories',              label: 'Categoria(s)',      group: 'Identificação',                  defaultVisible: true,  minWidth: 160, sortType: null     },
  { id: 'positions',               label: 'Posição(ões)',      group: 'Identificação',                  defaultVisible: true,  minWidth: 200, sortType: null     },
  { id: 'dob',                     label: 'Nascimento',        group: 'Identificação',                  defaultVisible: true,  minWidth: 110, sortType: 'date'   },
  { id: 'age',                     label: 'Idade',             group: 'Identificação',                  defaultVisible: false, minWidth: 80,  sortType: 'number' },
  { id: 'cpf',                     label: 'CPF',               group: 'Identificação',                  defaultVisible: true,  minWidth: 120, sortType: 'string' },
  { id: 'rg',                      label: 'RG',                group: 'Identificação',                  defaultVisible: false, minWidth: 110, sortType: 'string' },
  { id: 'email',                   label: 'E-mail',            group: 'Identificação',                  defaultVisible: false, minWidth: 200, sortType: 'string' },
  { id: 'origin_type',             label: 'Tipo (saída)',      group: 'Logística',                      defaultVisible: false, minWidth: 110, sortType: 'string' },
  { id: 'origin_street',           label: 'Rua (saída)',       group: 'Logística',                      defaultVisible: false, minWidth: 180, sortType: 'string' },
  { id: 'origin_neighborhood',     label: 'Bairro (saída)',    group: 'Logística',                      defaultVisible: false, minWidth: 150, sortType: 'string' },
  { id: 'origin_zip',              label: 'CEP (saída)',       group: 'Logística',                      defaultVisible: false, minWidth: 100, sortType: 'string' },
  { id: 'destination_type',        label: 'Tipo (destino)',    group: 'Logística',                      defaultVisible: false, minWidth: 110, sortType: 'string' },
  { id: 'destination_street',      label: 'Rua (destino)',     group: 'Logística',                      defaultVisible: false, minWidth: 180, sortType: 'string' },
  { id: 'destination_neighborhood',label: 'Bairro (destino)',  group: 'Logística',                      defaultVisible: false, minWidth: 150, sortType: 'string' },
  { id: 'destination_zip',         label: 'CEP (destino)',     group: 'Logística',                      defaultVisible: false, minWidth: 100, sortType: 'string' },
  { id: 'created_at',              label: 'Cadastrado em',     group: 'Sistema',                        defaultVisible: false, minWidth: 120, sortType: 'date'   },
]

const DEFAULT_VISIBLE_IDS: ColumnId[] = COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)

const STORAGE_KEY = 'apita-ai:members:columns:v1'

/**
 * Calcula idade em anos completos. Retorna `null` se `dob` vazio/inválido.
 * Idêntica à de users-section.tsx — duplicada aqui pra manter a tela
 * self-contained (são telas diferentes; extrair utility parece cedo).
 */
function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null
  const birth = new Date(dob + 'T00:00:00')
  if (Number.isNaN(birth.getTime())) return null
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age >= 0 ? age : null
}

function formatDate(s: string | null | undefined): string {
  if (!s) return '—'
  // ISO ou YYYY-MM-DD
  const str = s.length === 10 ? s + 'T00:00:00' : s
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

function formatCep(cep: string | null | undefined): string {
  if (!cep) return '—'
  const digits = cep.replace(/\D/g, '')
  if (digits.length !== 8) return cep
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}

// ── Sort helpers ────────────────────────────────────────────────────────
// Mantidos a nível de módulo (puros, sem deps do componente) pra não
// recriar função a cada render. Só colunas ordenáveis (`sortType !== null`)
// precisam aparecer aqui — `categories` e `positions` caem no default.

/**
 * Lê o valor "cru" de `m` pelo `colId`. `age` é derivada de `dob`. Campos
 * ausentes retornam `null`/`undefined` — o normalizador em `getSortValue`
 * converte isso em `undefined` de verdade (sentinela de "vai pro fim").
 */
function getRawValue(m: Member, colId: ColumnId): string | number | null | undefined {
  switch (colId) {
    case 'name': return m.name
    case 'role': return m.role
    case 'dob': return m.dob
    case 'age': return calcAge(m.dob)
    case 'cpf': return m.cpf
    case 'rg': return m.rg
    case 'email': return m.email
    case 'origin_type': return m.origin_type
    case 'origin_street': return m.origin_street
    case 'origin_neighborhood': return m.origin_neighborhood
    case 'origin_zip': return m.origin_zip
    case 'destination_type': return m.destination_type
    case 'destination_street': return m.destination_street
    case 'destination_neighborhood': return m.destination_neighborhood
    case 'destination_zip': return m.destination_zip
    case 'created_at': return m.created_at
    // `categories`/`positions` têm sortType=null e nunca deveriam chegar aqui
    case 'categories':
    case 'positions':
    default: return undefined
  }
}

/**
 * Normaliza o valor para o tipo pedido por `sortType`:
 * - `date`  → timestamp (ms); data inválida → undefined
 * - `number`→ Number(); NaN → undefined
 * - `string`→ lowercase+trim; vazio → undefined
 *
 * `undefined` = "ausente", sempre no fim do sort (ambas as direções).
 * Isso garante que células "—" não poluam o topo do asc.
 */
function getSortValue(
  m: Member,
  colId: ColumnId,
  sortType: 'string' | 'number' | 'date',
): string | number | undefined {
  const raw = getRawValue(m, colId)
  if (raw == null || raw === '') return undefined
  if (sortType === 'date') {
    const str = typeof raw === 'string' && raw.length === 10 ? raw + 'T00:00:00' : String(raw)
    const t = new Date(str).getTime()
    return Number.isNaN(t) ? undefined : t
  }
  if (sortType === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isNaN(n) ? undefined : n
  }
  // string: normaliza pra evitar diferenças por caso/espaços
  return String(raw).toLowerCase().trim() || undefined
}

// ── Main ────────────────────────────────────────────────────────────────

export function MembersClient({
  members,
  categories,
  positions,
  orgId,
}: {
  members: Member[]
  categories: Category[]
  positions: Position[]
  orgId?: string
}) {
  const router = useRouter()
  const { confirm } = useConfirm()
  const [search, setSearch] = useState('')
  const [, startTransition] = useTransition()
  const orgOpts = useMemo<TargetOrgOpts | undefined>(
    () => (orgId ? { forOrgId: orgId } : undefined),
    [orgId]
  )

  // ── Persisted column visibility ───────────────────────────────────────
  // Ssr-safe: inicia com default e lê localStorage no client após mount.
  // Evita hydration mismatch (server sempre vê os defaults).
  const [visibleIds, setVisibleIds] = useState<ColumnId[]>(DEFAULT_VISIBLE_IDS)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    // Lê localStorage uma única vez após o mount do client. SSR envia os
    // defaults; este effect sobrescreve com a preferência do usuário sem
    // causar hydration mismatch (o primeiro render cliente ainda bate com
    // o server, a atualização vem num commit subsequente).
    //
    // O lint `react-hooks/set-state-in-effect` desaconselha setState em
    // effect, mas aqui é exatamente o caso válido: sincronizar estado React
    // com um sistema externo (localStorage) que não estava disponível no SSR.
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as string[]
        const validIds = COLUMNS.map((c) => c.id) as string[]
        const filtered = parsed.filter((id): id is ColumnId => validIds.includes(id))
        // Garante que required (name) sempre esteja presente
        if (!filtered.includes('name')) filtered.unshift('name')
        if (filtered.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setVisibleIds(filtered)
        }
      }
    } catch {
      // localStorage bloqueado — segue com defaults
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleIds))
    } catch {
      // Sem persistência; feature degrada graciosamente
    }
  }, [visibleIds, hydrated])

  function toggleColumn(id: ColumnId) {
    const col = COLUMNS.find((c) => c.id === id)
    if (col?.required) return
    setVisibleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function resetColumns() {
    setVisibleIds(DEFAULT_VISIBLE_IDS)
  }

  // In super_admin drilldown, creating / editing members happens via the
  // drilldown's Users tab. In the tenant dashboard, it's /settings?section=users.
  const usersSettingsHref = orgId
    ? `/admin/organizations/${orgId}/users`
    : '/settings?section=users'

  const filtered = useMemo(
    () =>
      members.filter((m) =>
        m.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [members, search],
  )

  // ── Sort ───────────────────────────────────────────────────────────────
  // `sortBy = null` → respeita a ordem do server (ORDER BY name no page.tsx).
  // Clique em header segue o ciclo null → asc → desc → null (padrão
  // Google Sheets/Airtable). Colunas com `sortType: null` não abrem sort —
  // ordenar `categories`/`positions` pela string agregada é confuso.
  const [sortBy, setSortBy] = useState<{ colId: ColumnId; dir: 'asc' | 'desc' } | null>(null)

  function handleSort(colId: ColumnId) {
    const col = COLUMNS.find((c) => c.id === colId)
    if (!col || col.sortType === null) return
    setSortBy((prev) => {
      if (!prev || prev.colId !== colId) return { colId, dir: 'asc' }
      if (prev.dir === 'asc') return { colId, dir: 'desc' }
      return null
    })
  }

  const sorted = useMemo(() => {
    if (!sortBy) return filtered
    const col = COLUMNS.find((c) => c.id === sortBy.colId)
    if (!col || col.sortType === null) return filtered
    const sortType = col.sortType
    const dirMult = sortBy.dir === 'asc' ? 1 : -1
    // `[...filtered]` preserva imutabilidade de `filtered` (evita sort
    // mutando o array memoizado — seria bug sutil entre renders).
    return [...filtered].sort((a, b) => {
      const va = getSortValue(a, sortBy.colId, sortType)
      const vb = getSortValue(b, sortBy.colId, sortType)
      // Ausentes sempre no fim, em ambas as direções. Evita "—" no topo.
      if (va === undefined && vb === undefined) return 0
      if (va === undefined) return 1
      if (vb === undefined) return -1
      if (sortType === 'string') {
        return String(va).localeCompare(String(vb), 'pt-BR') * dirMult
      }
      return ((va as number) - (vb as number)) * dirMult
    })
  }, [filtered, sortBy])

  function handleCreate() {
    router.push(usersSettingsHref)
  }

  function handleEdit(m: Member) {
    if (m.user_id && !orgId) {
      router.push(`/settings?section=users&id=${m.user_id}`)
    } else if (m.user_id && orgId) {
      router.push(`/admin/organizations/${orgId}/users?id=${m.user_id}`)
    } else {
      router.push(usersSettingsHref)
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: 'Excluir este membro?',
      description: 'Essa ação não pode ser desfeita. O histórico de presenças e pagamentos do atleta será removido.',
      variant: 'destructive',
      confirmLabel: 'Excluir',
    })
    if (!ok) return
    startTransition(() => deleteMember(id, orgOpts))
  }

  function getCategoryNames(m: Member) {
    return m.member_categories
      .map((mc) => categories.find((c) => c.id === mc.category_id)?.name)
      .filter(Boolean) as string[]
  }

  /**
   * Agrupa positions por categoria — retorna `[{ category, positions[] }]` só
   * das categorias que o membro tem pelo menos uma position definida.
   */
  function getPositionsByCategory(m: Member): { category: string; positions: string[] }[] {
    const byCat = new Map<string, string[]>()
    for (const row of m.member_category_positions) {
      const posName = positions.find((p) => p.id === row.position_id)?.name
      if (!posName) continue
      const bucket = byCat.get(row.category_id) ?? []
      bucket.push(posName)
      byCat.set(row.category_id, bucket)
    }
    return Array.from(byCat.entries())
      .map(([catId, posNames]) => ({
        category: categories.find((c) => c.id === catId)?.name ?? '—',
        positions: posNames,
      }))
      .filter((x) => x.positions.length > 0)
  }

  /**
   * Renderiza a célula de uma coluna específica para um member. Retorna
   * ReactNode (string, JSX ou o placeholder "—"). Separado em função pura
   * para manter o loop do tbody enxuto.
   */
  function renderCell(m: Member, colId: ColumnId): React.ReactNode {
    switch (colId) {
      case 'name': {
        return (
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-medium truncate">{m.name}</span>
            {m.role === 'coordinator' && (
              <span
                title="Coordenador com perfil de atleta"
                className="flex items-center gap-0.5 text-[10px] font-medium bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded shrink-0"
              >
                <ShieldCheck className="h-2.5 w-2.5" />
                Coord
              </span>
            )}
          </div>
        )
      }
      case 'role': {
        if (!m.role) return <span className="text-xs text-muted-foreground/40">—</span>
        const label =
          m.role === 'coordinator' ? 'Coordenador' :
          m.role === 'admin'       ? 'Admin'       :
          m.role === 'member'      ? 'Membro'      :
          m.role
        return <span className="text-xs text-muted-foreground">{label}</span>
      }
      case 'categories': {
        const names = getCategoryNames(m)
        if (names.length === 0) return <span className="text-xs text-muted-foreground/40">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {names.map((n) => (
              <span key={n} className="text-[11px] font-medium bg-primary/8 text-primary px-1.5 py-0.5 rounded">
                {n}
              </span>
            ))}
          </div>
        )
      }
      case 'positions': {
        const byCat = getPositionsByCategory(m)
        if (byCat.length === 0) return <span className="text-xs text-muted-foreground/40">—</span>
        return (
          <div className="flex flex-col gap-0.5">
            {byCat.map((row) => (
              <div key={row.category} className="flex items-baseline gap-1.5 text-[11px]">
                <span className="font-semibold text-primary/80 shrink-0">{row.category}:</span>
                <span className="text-muted-foreground truncate">{row.positions.join(', ')}</span>
              </div>
            ))}
          </div>
        )
      }
      case 'dob':
        return <span className="text-xs text-muted-foreground">{formatDate(m.dob)}</span>
      case 'age': {
        const age = calcAge(m.dob)
        return (
          <span className="text-xs text-muted-foreground">
            {age !== null ? `${age} ${age === 1 ? 'ano' : 'anos'}` : '—'}
          </span>
        )
      }
      case 'cpf':
        return <span className="text-xs text-muted-foreground font-mono">{m.cpf || '—'}</span>
      case 'rg':
        return <span className="text-xs text-muted-foreground font-mono">{m.rg || '—'}</span>
      case 'email':
        return (
          <span className="text-xs text-muted-foreground truncate block max-w-[240px]" title={m.email ?? ''}>
            {m.email || '—'}
          </span>
        )
      case 'origin_type':
        return <span className="text-xs text-muted-foreground capitalize">{m.origin_type || '—'}</span>
      case 'origin_street':
        return <span className="text-xs text-muted-foreground truncate block max-w-[240px]" title={m.origin_street ?? ''}>{m.origin_street || '—'}</span>
      case 'origin_neighborhood':
        return <span className="text-xs text-muted-foreground truncate block max-w-[200px]" title={m.origin_neighborhood ?? ''}>{m.origin_neighborhood || '—'}</span>
      case 'origin_zip':
        return <span className="text-xs text-muted-foreground font-mono">{formatCep(m.origin_zip)}</span>
      case 'destination_type':
        return <span className="text-xs text-muted-foreground capitalize">{m.destination_type || '—'}</span>
      case 'destination_street':
        return <span className="text-xs text-muted-foreground truncate block max-w-[240px]" title={m.destination_street ?? ''}>{m.destination_street || '—'}</span>
      case 'destination_neighborhood':
        return <span className="text-xs text-muted-foreground truncate block max-w-[200px]" title={m.destination_neighborhood ?? ''}>{m.destination_neighborhood || '—'}</span>
      case 'destination_zip':
        return <span className="text-xs text-muted-foreground font-mono">{formatCep(m.destination_zip)}</span>
      case 'created_at':
        return <span className="text-xs text-muted-foreground">{formatDate(m.created_at)}</span>
      default:
        return null
    }
  }

  // Apenas as colunas visíveis, preservando a ordem de COLUMNS (ancorada
  // na definição — se o usuário ativar em ordem aleatória, aparecem na
  // ordem canônica). Futuramente: reordenação drag-and-drop.
  const activeColumns = COLUMNS.filter((c) => visibleIds.includes(c.id))

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            placeholder="Buscar membro..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 bg-card border-border/50"
          />
        </div>
        <div className="flex items-center gap-2">
          <ColumnPicker
            columns={COLUMNS}
            visibleIds={visibleIds}
            onToggle={toggleColumn}
            onReset={resetColumns}
          />
          <Button onClick={handleCreate} size="sm" className="gap-1.5 h-9 shadow-sm">
            <Plus className="h-4 w-4" />
            Novo Membro
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 border border-border/40 rounded-lg px-3 py-2">
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        Criar e editar membros é feito em{' '}
        <button
          onClick={() => router.push(usersSettingsHref)}
          className="text-primary underline underline-offset-2 hover:no-underline"
        >
          {orgId ? 'Usuários' : 'Configurações → Usuários'}
        </button>
      </div>

      {/* Lista */}
      {sorted.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 mb-3">
            <Users className="h-5 w-5 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">
            {members.length === 0 ? 'Nenhum membro cadastrado.' : 'Nenhum membro encontrado.'}
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-muted/30 border-b border-border/40">
                  {activeColumns.map((col, i) => {
                    const sortable = col.sortType !== null
                    const active = sortBy?.colId === col.id
                    const dir = active ? sortBy!.dir : null
                    return (
                      <th
                        key={col.id}
                        className={`text-left text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-2.5 ${
                          col.id === 'name' ? 'sticky left-0 z-10 bg-muted/30' : ''
                        } ${i === activeColumns.length - 1 ? '' : 'border-r border-border/20'}`}
                        style={{ minWidth: col.minWidth }}
                      >
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => handleSort(col.id)}
                            className={`inline-flex items-center gap-1 uppercase tracking-wide font-medium transition-colors select-none ${
                              active ? 'text-foreground' : 'hover:text-foreground'
                            }`}
                            title={`Ordenar por ${col.label}`}
                          >
                            <span>{col.label}</span>
                            {dir === 'asc' ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : dir === 'desc' ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ChevronsUpDown className="h-3 w-3 opacity-40" />
                            )}
                          </button>
                        ) : (
                          <span>{col.label}</span>
                        )}
                      </th>
                    )
                  })}
                  <th className="w-[70px] sticky right-0 z-10 bg-muted/30 border-l border-border/30" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors group"
                  >
                    {activeColumns.map((col, i) => (
                      <td
                        key={col.id}
                        className={`px-4 py-3 align-top ${
                          col.id === 'name'
                            ? 'sticky left-0 z-[5] bg-card group-hover:bg-muted/20'
                            : ''
                        } ${i === activeColumns.length - 1 ? '' : 'border-r border-border/15'}`}
                        style={{ minWidth: col.minWidth }}
                      >
                        {renderCell(m, col.id)}
                      </td>
                    ))}
                    <td className="px-2 py-3 sticky right-0 z-[5] bg-card group-hover:bg-muted/20 border-l border-border/30">
                      <div className="flex gap-0.5 justify-end">
                        <button
                          onClick={() => handleEdit(m)}
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Editar em Configurações"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ColumnPicker (popover custom) ──────────────────────────────────────

/**
 * Popover ancorado com checkboxes agrupados por categoria lógica. Fecha ao
 * clicar fora. Não usa shadcn/DropdownMenu porque o projeto não importou esse
 * componente — mantemos consistência com o padrão do MonthSelector (click-
 * outside manual).
 */
function ColumnPicker({
  columns,
  visibleIds,
  onToggle,
  onReset,
}: {
  columns: ColumnDef[]
  visibleIds: ColumnId[]
  onToggle: (id: ColumnId) => void
  onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  const visibleCount = visibleIds.length
  // Agrupa preservando a ordem de aparição dos grupos em COLUMNS
  const groups = columns.reduce<Map<string, ColumnDef[]>>((acc, col) => {
    const bucket = acc.get(col.group) ?? []
    bucket.push(col)
    acc.set(col.group, bucket)
    return acc
  }, new Map())

  return (
    <div className="relative" ref={wrapperRef}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        className="gap-1.5 h-9"
        title="Editar colunas visíveis"
      >
        <Columns3 className="h-4 w-4" />
        Colunas
        <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full ml-0.5">
          {visibleCount}
        </span>
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-30 w-72 bg-popover text-popover-foreground border border-border/60 rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40 bg-muted/30">
            <p className="text-xs font-semibold">Colunas visíveis</p>
            <button
              type="button"
              onClick={onReset}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              title="Voltar ao padrão"
            >
              <RotateCcw className="h-3 w-3" />
              Padrão
            </button>
          </div>

          <div className="max-h-[360px] overflow-y-auto py-1">
            {Array.from(groups.entries()).map(([group, cols]) => (
              <div key={group} className="py-1">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  {group}
                </div>
                {cols.map((col) => {
                  const checked = visibleIds.includes(col.id)
                  const disabled = Boolean(col.required)
                  return (
                    <button
                      key={col.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onToggle(col.id)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
                        disabled
                          ? 'cursor-not-allowed opacity-60'
                          : 'hover:bg-muted/60 cursor-pointer'
                      }`}
                    >
                      <span
                        className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                          checked
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-border bg-background'
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="flex-1 truncate">{col.label}</span>
                      {disabled && (
                        <span className="text-[10px] text-muted-foreground/60">fixa</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="px-3 py-2 border-t border-border/40 bg-muted/20">
            <p className="text-[10px] text-muted-foreground/70 leading-snug">
              A preferência fica salva neste navegador.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
