'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, Loader2, UserPlus, ArrowRight, Wallet } from 'lucide-react'
import {
  listPendingMembers,
  type PendingMember,
} from '@/app/actions/pending-members'
import {
  listPendingConfirmations,
  type PendingConfirmation,
} from '@/app/actions/athlete-payments'

/**
 * Sino de notificações unificado. Renderiza quando há QUALQUER ação pendente
 * pro contratante/coord:
 *   • Cadastros de atletas pra aprovar (/members?tab=pending)
 *   • Pagamentos marcados pelo atleta, aguardando confirmação (/financials)
 *
 * O badge soma os dois. O popover mostra seções separadas ("Cadastros" e
 * "Pagamentos") pra facilitar reconhecer a natureza da ação. Se um dos
 * grupos for zero, a seção inteira desaparece.
 */
export function PendingBell({
  pendingCount,
  paymentConfirmCount = 0,
}: {
  pendingCount: number
  paymentConfirmCount?: number
}) {
  const [open, setOpen] = useState(false)
  const [members, setMembers] = useState<PendingMember[] | null>(null)
  const [payments, setPayments] = useState<PendingConfirmation[] | null>(null)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const totalCount = pendingCount + paymentConfirmCount

  // Carrega as listas quando o popover abre. Cache simples em memória:
  // reseta quando algum count muda (outra aba aprovou/confirmou).
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [m, p] = await Promise.all([
        pendingCount > 0 ? listPendingMembers() : Promise.resolve([]),
        paymentConfirmCount > 0 ? listPendingConfirmations() : Promise.resolve([]),
      ])
      setMembers(m)
      setPayments(p)
    } catch (err) {
      console.error('[PendingBell] load error:', err)
      setMembers([])
      setPayments([])
    } finally {
      setLoading(false)
    }
  }, [pendingCount, paymentConfirmCount])

  useEffect(() => {
    if (open && members === null && payments === null) void load()
  }, [open, members, payments, load])

  // Invalida cache quando qualquer count muda
  useEffect(() => {
    setMembers(null)
    setPayments(null)
  }, [pendingCount, paymentConfirmCount])

  // Click-fora fecha o popover
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  const memberPreview = useMemo(() => (members ?? []).slice(0, 3), [members])
  const paymentPreview = useMemo(() => (payments ?? []).slice(0, 3), [payments])

  if (totalCount <= 0) return null

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${totalCount} ação(ões) pendente(s)`}
        title={`${totalCount} ação(ões) pendente(s)`}
        className="relative h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
      >
        <Bell className="h-[18px] w-[18px]" />
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 h-[18px] min-w-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-card"
        >
          {totalCount > 99 ? '99+' : totalCount}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-40 w-[340px] bg-popover text-popover-foreground border border-border/60 rounded-xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-3.5 py-2.5 border-b border-border/40 bg-muted/30">
            <p className="text-xs font-semibold">Ações pendentes</p>
            <p className="text-[10px] text-muted-foreground/70">
              {totalCount} item{totalCount === 1 ? '' : 's'} aguardando você
            </p>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {loading && (
              <div className="py-6 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            )}

            {/* ── Seção: Cadastros pendentes ─────────────────────────── */}
            {!loading && pendingCount > 0 && (
              <>
                <SectionHeader
                  icon={<UserPlus className="h-3 w-3" />}
                  label="Cadastros"
                  count={pendingCount}
                  tone="rose"
                />
                {memberPreview.map((m) => (
                  <Link
                    key={m.id}
                    href={`/members?tab=pending&id=${m.id}`}
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-2.5 border-b border-border/20 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/15 flex items-center justify-center text-xs font-semibold text-primary">
                        {m.name.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{m.name}</p>
                        <p className="text-[10px] text-muted-foreground/70 truncate">
                          {m.email || 'sem e-mail'} · {timeAgo(m.created_at)}
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
                {pendingCount > 3 && (
                  <Link
                    href="/members?tab=pending"
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-2 text-[11px] font-medium text-primary hover:bg-muted/40 transition-colors border-b border-border/20"
                  >
                    Ver todos os {pendingCount} cadastros →
                  </Link>
                )}
              </>
            )}

            {/* ── Seção: Pagamentos a confirmar ──────────────────────── */}
            {!loading && paymentConfirmCount > 0 && (
              <>
                <SectionHeader
                  icon={<Wallet className="h-3 w-3" />}
                  label="Pagamentos"
                  count={paymentConfirmCount}
                  tone="amber"
                />
                {paymentPreview.map((p) => (
                  <Link
                    key={`${p.kind}-${p.id}`}
                    href="/financials"
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-2.5 border-b border-border/20 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-amber-100 to-amber-50 ring-1 ring-amber-200 flex items-center justify-center text-xs font-semibold text-amber-700">
                        {p.member_name.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{p.member_name}</p>
                        <p className="text-[10px] text-muted-foreground/70 truncate">
                          {p.category_name} · {p.reference_label}
                        </p>
                      </div>
                      <p className="text-[11px] font-bold font-mono tabular-nums shrink-0">
                        {formatBRL(p.amount)}
                      </p>
                    </div>
                    {/* Preview da observação do atleta — truncada em 2 linhas */}
                    {p.note && (
                      <p className="mt-1 ml-9 text-[10px] text-muted-foreground/80 italic line-clamp-2 leading-snug">
                        “{p.note}”
                      </p>
                    )}
                  </Link>
                ))}
                {paymentConfirmCount > 3 && (
                  <Link
                    href="/financials"
                    onClick={() => setOpen(false)}
                    className="block px-3.5 py-2 text-[11px] font-medium text-primary hover:bg-muted/40 transition-colors border-b border-border/20"
                  >
                    Ver todos os {paymentConfirmCount} pagamentos →
                  </Link>
                )}
              </>
            )}
          </div>

          {/* Footer com atalhos rápidos */}
          <div className="flex items-center gap-2 px-3.5 py-2 border-t border-border/40 bg-muted/20">
            {pendingCount > 0 && (
              <Link
                href="/members?tab=pending"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                Cadastros
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
            {paymentConfirmCount > 0 && (
              <Link
                href="/financials"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline ml-auto"
              >
                Financeiro
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Componentes auxiliares ─────────────────────────────────────────────

function SectionHeader({
  icon, label, count, tone,
}: {
  icon: React.ReactNode
  label: string
  count: number
  tone: 'rose' | 'amber'
}) {
  const iconColor = tone === 'rose'
    ? 'bg-rose-50 text-rose-600'
    : 'bg-amber-50 text-amber-600'
  return (
    <div className="px-3.5 py-1.5 bg-muted/20 border-b border-border/20 flex items-center gap-1.5">
      <div className={`h-4 w-4 flex items-center justify-center rounded-sm ${iconColor}`}>
        {icon}
      </div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </p>
      <span className="text-[10px] font-bold text-muted-foreground/60 ml-auto">
        {count}
      </span>
    </div>
  )
}

/**
 * Formata quanto tempo passou desde `iso` de forma humana.
 * Ex: "agora mesmo", "há 5 min", "há 2 horas", "há 3 dias".
 */
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

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
