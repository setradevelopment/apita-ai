'use client'

import { useState, useRef, useEffect } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Calendar, ChevronDown } from 'lucide-react'
import { toMonthParam, prevMonth, nextMonth, MONTH_NAMES } from '@/lib/month'

const MONTH_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

/**
 * Seletor de mês genérico baseado em query string `?m=YYYY-MM`.
 * Navega via `router.push` mantendo os demais params (como `?id=`).
 *
 * Mostra setas de mês anterior/próximo + dropdown (grid de meses + setas de ano).
 * Usado pelo drilldown do super_admin — o Header do `(dashboard)` tem seu próprio
 * seletor, esse aqui replica o mesmo fluxo para as páginas admin que não vivem
 * dentro do DashboardLayout.
 */
export function MonthSelector({ month, year }: { month: number; year: number }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerYear, setPickerYear] = useState(year)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Sync pickerYear when year prop changes (via arrows)
  useEffect(() => {
    setPickerYear(year)
  }, [year])

  // Close on outside click
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    if (pickerOpen) document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [pickerOpen])

  function navigate(m: number, y: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('m', toMonthParam(m, y))
    router.push(`${pathname}?${params.toString()}`)
  }

  const prev = prevMonth(month, year)
  const next = nextMonth(month, year)

  return (
    <div className="inline-flex items-center gap-1 bg-muted/50 rounded-lg px-1 py-0.5 border border-border/40">
      <button
        onClick={() => navigate(prev.month, prev.year)}
        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-background hover:shadow-sm transition-all text-muted-foreground hover:text-foreground"
        title="Mês anterior"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>

      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => { setPickerYear(year); setPickerOpen((o) => !o) }}
          className="flex items-center gap-1.5 px-2 h-7 min-w-[148px] justify-center rounded-md hover:bg-background hover:shadow-sm transition-all"
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
                onClick={() => setPickerYear((y) => y + 1)}
                className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1">
              {MONTH_SHORT.map((abbr, i) => {
                const m = i + 1
                const isSelected = m === month && pickerYear === year
                return (
                  <button
                    key={m}
                    onClick={() => { navigate(m, pickerYear); setPickerOpen(false) }}
                    className={`text-xs py-2 rounded-lg font-medium transition-all ${
                      isSelected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-foreground/70 hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {abbr}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={() => navigate(next.month, next.year)}
        className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-background hover:shadow-sm transition-all text-muted-foreground hover:text-foreground"
        title="Próximo mês"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
