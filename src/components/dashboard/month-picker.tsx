'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Calendar, ChevronDown } from 'lucide-react'
import {
  parseMonthParam,
  toMonthParam,
  prevMonth,
  nextMonth,
  MONTH_NAMES,
  MAX_MONTHS_AHEAD,
  isMonthAllowed,
  maxAllowedMonth,
} from '@/lib/month'

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface MonthPickerProps {
  /** When true, renders with slightly larger, centered pill styling. Default: false (header style). */
  emphasized?: boolean
}

export function MonthPicker({ emphasized = false }: MonthPickerProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const { month, year } = parseMonthParam(searchParams.get('m') ?? undefined)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(year)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPickerYear(year)
  }, [year])

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    if (pickerOpen) document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [pickerOpen])

  // Cap is computed once per render — `new Date()` resolution by month is fine
  // (no need to invalidate at midnight; UI re-renders on every navigation).
  const cap = useMemo(() => maxAllowedMonth(), [])
  const capLabel = `${MONTH_NAMES[cap.month]}/${cap.year}`

  function navigate(m: number, y: number) {
    if (!isMonthAllowed(m, y)) return // defensive: shouldn't be reachable via UI
    const params = new URLSearchParams(searchParams.toString())
    params.set('m', toMonthParam(m, y))
    router.push(`${pathname}?${params.toString()}`)
  }

  const prev = prevMonth(month, year)
  const next = nextMonth(month, year)
  const nextDisabled = !isMonthAllowed(next.month, next.year)
  const canGoNextYearInPicker = pickerYear < cap.year

  const labelBtnClass = emphasized
    ? 'flex items-center gap-2 px-3 h-8 min-w-[168px] justify-center rounded-md hover:bg-background hover:shadow-sm transition-all group'
    : 'flex items-center gap-1.5 px-2 h-7 min-w-[148px] justify-center rounded-md hover:bg-background hover:shadow-sm transition-all group'

  const arrowClass = emphasized
    ? 'h-8 w-8 flex items-center justify-center rounded-md hover:bg-background hover:shadow-sm transition-all text-muted-foreground hover:text-foreground'
    : 'h-7 w-7 flex items-center justify-center rounded-md hover:bg-background hover:shadow-sm transition-all text-muted-foreground hover:text-foreground'

  return (
    <div className="flex items-center gap-1 bg-muted/50 rounded-lg px-1 py-0.5 border border-border/40">
      <button
        onClick={() => navigate(prev.month, prev.year)}
        className={arrowClass}
        title="Mês anterior"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => { setPickerYear(year); setPickerOpen((o) => !o) }}
          className={labelBtnClass}
          title="Selecionar mês"
        >
          <Calendar className="h-3.5 w-3.5 text-primary/60" />
          <span className="text-sm font-medium text-foreground/80">
            {MONTH_NAMES[month]} {year}
          </span>
          <ChevronDown className={`h-3 w-3 text-muted-foreground/50 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
        </button>

        {pickerOpen && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 bg-card rounded-xl shadow-lg border border-border/50 p-3 z-50">
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setPickerYear((y) => y - 1)}
                className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm font-semibold text-foreground">{pickerYear}</span>
              <button
                onClick={() => canGoNextYearInPicker && setPickerYear((y) => y + 1)}
                disabled={!canGoNextYearInPicker}
                className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                title={!canGoNextYearInPicker ? `Limite: ${cap.year}` : undefined}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {MONTH_SHORT.map((abbr, i) => {
                const m = i + 1
                const isSelected = m === month && pickerYear === year
                const allowed = isMonthAllowed(m, pickerYear)
                return (
                  <button
                    key={m}
                    onClick={() => { if (allowed) { navigate(m, pickerYear); setPickerOpen(false) } }}
                    disabled={!allowed}
                    title={!allowed ? `Limite de previsão: ${capLabel}` : undefined}
                    className={`text-xs py-2 rounded-lg font-medium transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : allowed
                          ? 'text-foreground/70 hover:bg-muted hover:text-foreground'
                          : 'text-muted-foreground/30 cursor-not-allowed'
                    }`}
                  >
                    {abbr}
                  </button>
                )
              })}
            </div>

            {pickerYear === cap.year && (
              <p className="mt-2 text-[10px] text-muted-foreground/70 text-center px-1 leading-snug">
                Previsão limitada a {capLabel}.
              </p>
            )}
          </div>
        )}
      </div>

      <button
        onClick={() => navigate(next.month, next.year)}
        className={`${arrowClass} ${nextDisabled ? 'opacity-30 cursor-not-allowed pointer-events-none' : ''}`}
        title={nextDisabled ? `Limite de previsão: ${capLabel} (${MAX_MONTHS_AHEAD} meses adiante)` : 'Próximo mês'}
        aria-disabled={nextDisabled}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
