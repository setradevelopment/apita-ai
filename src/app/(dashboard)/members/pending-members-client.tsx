'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserPlus, Clock, Mail, FileText, Check, X, AlertCircle,
  Loader2, MapPin, Calendar,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  approveMember,
  rejectMember,
  type PendingMember,
} from '@/app/actions/pending-members'

interface Category { id: string; name: string }
interface Position { id: string; name: string }

/**
 * Painel de atletas pendentes. Card por pendente com dados resumidos +
 * botão "Revisar" que abre um Dialog de aprovação. O Dialog exige
 * categoria obrigatória e, se a org tem posições cadastradas, também
 * posição obrigatória em cada categoria escolhida.
 *
 * Suporta deep-link: ao chegar com `?id=X`, o Dialog abre automaticamente
 * naquele atleta (usado pelo popover do sino no header).
 */
export function PendingMembersClient({
  pending,
  categories,
  positions,
  initialSelectedId,
}: {
  pending: PendingMember[]
  categories: Category[]
  positions: Position[]
  initialSelectedId: string | null
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<PendingMember | null>(null)
  const [confirmReject, setConfirmReject] = useState<PendingMember | null>(null)
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [categoryPositions, setCategoryPositions] = useState<Record<string, string[]>>({})
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  // Deep-link: se veio com ?id=X, abre direto o dialog desse atleta.
  useEffect(() => {
    if (!initialSelectedId) return
    const match = pending.find((p) => p.id === initialSelectedId)
    if (match) {
      openReview(match)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedId])

  const orgHasPositions = positions.length > 0

  function openReview(member: PendingMember) {
    setSelected(member)
    setCategoryIds([])
    setCategoryPositions({})
    setError('')
  }

  function closeReview() {
    setSelected(null)
    setCategoryIds([])
    setCategoryPositions({})
    setError('')
  }

  function toggleCategory(catId: string) {
    setCategoryIds((prev) =>
      prev.includes(catId) ? prev.filter((id) => id !== catId) : [...prev, catId],
    )
    // Limpa posições selecionadas da categoria removida
    setCategoryPositions((prev) => {
      if (prev[catId]) {
        const { [catId]: _removed, ...rest } = prev
        void _removed
        return rest
      }
      return prev
    })
  }

  function togglePosition(catId: string, posId: string) {
    setCategoryPositions((prev) => {
      const current = prev[catId] ?? []
      const next = current.includes(posId)
        ? current.filter((id) => id !== posId)
        : [...current, posId]
      return { ...prev, [catId]: next }
    })
  }

  function handleApprove() {
    if (!selected) return
    setError('')

    // Validação client-side (a action revalida). Mensagens idênticas às da
    // action pra consistência — se o user burlar o front, vê o mesmo texto.
    if (categoryIds.length === 0) {
      setError('Selecione pelo menos uma categoria.')
      return
    }
    if (orgHasPositions) {
      for (const catId of categoryIds) {
        const positions = categoryPositions[catId] ?? []
        if (positions.length === 0) {
          const catName = categories.find((c) => c.id === catId)?.name ?? 'categoria'
          setError(`Selecione pelo menos uma posição para ${catName}.`)
          return
        }
      }
    }

    startTransition(async () => {
      try {
        await approveMember({
          memberId: selected.id,
          categoryIds,
          categoryPositions,
        })
        closeReview()
        // Navega fora da aba pendentes pra evitar "piscar" de lista vazia
        // caso esse fosse o único pendente. O page.tsx detecta pending=0 e
        // some com a aba.
        router.push('/members')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao aprovar.')
      }
    })
  }

  function handleReject() {
    if (!confirmReject) return
    setError('')
    startTransition(async () => {
      try {
        await rejectMember(confirmReject.id)
        setConfirmReject(null)
        closeReview()
        router.push('/members')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao rejeitar.')
      }
    })
  }

  // Data resumida: poucas infos por card — nome, email, há quanto tempo se
  // cadastrou, bairros de origem/destino. Detalhes completos no dialog.
  const sortedPending = useMemo(
    () => [...pending].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [pending],
  )

  return (
    <>
      {/* Banner explicativo — o coord pode não saber bem o que fazer. */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
        <div className="flex-1 leading-relaxed">
          <strong className="font-semibold">Cadastros aguardando sua aprovação.</strong>{' '}
          Esses atletas se cadastraram pelo link de convite. Ao aprovar, defina
          a(s) categoria(s) e posição(ões) — eles entrarão nos treinos como{' '}
          <strong>avulso</strong> e <strong>falta</strong> até você ajustar.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sortedPending.map((m) => (
          <div
            key={m.id}
            className="bg-card rounded-xl border border-border/50 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)] hover:shadow-[0_4px_12px_0_rgb(0_0_0/0.06)] transition-shadow p-4 flex flex-col gap-3"
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 ring-1 ring-amber-200 flex items-center justify-center text-amber-700 font-semibold">
                {m.name.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{m.name}</p>
                <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                  <Mail className="h-3 w-3 shrink-0" />
                  {m.email || 'sem e-mail'}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-1 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3 shrink-0" />
                Cadastrou-se {timeAgo(m.created_at)}
              </span>
              {m.origin_neighborhood && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {m.origin_neighborhood}
                </span>
              )}
            </div>

            <Button
              type="button"
              size="sm"
              onClick={() => openReview(m)}
              className="mt-auto h-9 gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Revisar cadastro
            </Button>
          </div>
        ))}
      </div>

      {/* Dialog de revisão + aprovação */}
      <Dialog open={selected !== null} onOpenChange={(o) => !o && closeReview()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Outfit', sans-serif" }}>
              Revisar cadastro: {selected?.name}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-5">
              {/* ── Dados do atleta ── */}
              <section className="space-y-2 rounded-lg border border-border/40 bg-muted/20 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Dados informados
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <InfoLine icon={Mail} label="E-mail" value={selected.email || '—'} />
                  <InfoLine icon={Calendar} label="Nascimento" value={formatDate(selected.dob)} />
                  <InfoLine icon={FileText} label="CPF" value={selected.cpf || '—'} mono />
                  <InfoLine icon={FileText} label="RG" value={selected.rg || '—'} mono />
                  <InfoLine icon={MapPin} label="Saída" value={selected.origin_neighborhood || '—'} />
                  <InfoLine icon={MapPin} label="Volta" value={selected.destination_neighborhood || '—'} />
                </div>
              </section>

              {/* ── Categorias ── */}
              {categories.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-center">
                  <p className="text-sm text-muted-foreground">
                    Nenhuma categoria cadastrada na organização.
                  </p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    Crie pelo menos uma categoria em Configurações antes de aprovar atletas.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">
                    Categorias <span className="text-rose-600">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-1.5">
                    {categories.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleCategory(cat.id)}
                        disabled={isPending}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${
                          categoryIds.includes(cat.id)
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

              {/* ── Posições por categoria (só se org tem posições) ── */}
              {orgHasPositions && categoryIds.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-medium">
                      Posições por categoria <span className="text-rose-600">*</span>
                    </Label>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      Selecione pelo menos uma posição para cada categoria.
                    </p>
                  </div>
                  {categoryIds.map((catId) => {
                    const cat = categories.find((c) => c.id === catId)
                    if (!cat) return null
                    const selectedForCat = categoryPositions[catId] ?? []
                    return (
                      <div key={catId} className="space-y-1.5 rounded-lg border border-border/40 bg-muted/20 p-3">
                        <p className="text-xs font-semibold text-foreground/80">{cat.name}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {positions.map((pos) => (
                            <button
                              key={pos.id}
                              type="button"
                              onClick={() => togglePosition(catId, pos.id)}
                              disabled={isPending}
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

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 px-3 py-2 rounded-lg border border-destructive/15">
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (selected) setConfirmReject(selected)
              }}
              disabled={isPending}
              className="gap-1.5 text-rose-700 border-rose-300 hover:bg-rose-50 hover:text-rose-800"
            >
              <X className="h-4 w-4" />
              Rejeitar
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeReview}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleApprove}
                disabled={isPending || categories.length === 0}
                className="gap-1.5"
              >
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Aprovando…
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Aprovar e vincular
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de rejeição */}
      <Dialog open={confirmReject !== null} onOpenChange={(o) => !o && setConfirmReject(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "'Outfit', sans-serif" }}>
              Rejeitar cadastro?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O cadastro de <strong>{confirmReject?.name}</strong> será excluído
            permanentemente. Essa ação não pode ser desfeita. O atleta perderá
            acesso imediatamente.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmReject(null)} disabled={isPending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={isPending}>
              {isPending ? 'Rejeitando…' : 'Rejeitar cadastro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────

function InfoLine({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start gap-1.5 min-w-0">
      <Icon className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/60" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium leading-none">
          {label}
        </p>
        <p className={`text-xs text-foreground/80 truncate mt-0.5 ${mono ? 'font-mono' : ''}`}>
          {value}
        </p>
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const str = iso.length === 10 ? iso + 'T00:00:00' : iso
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR')
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'agora mesmo'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `há ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
}
