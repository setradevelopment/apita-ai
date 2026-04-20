'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Filter, X } from 'lucide-react'

interface Category {
  id: string
  name: string
}

export function CategoryFilter({
  categories,
  selectedId,
}: {
  categories: Category[]
  selectedId: string | null
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()

  function setCategory(id: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (id) params.set('cat', id)
    else params.delete('cat')
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  return (
    <div className="flex items-center gap-2 bg-muted/50 rounded-lg pl-2 pr-1 py-0.5 border border-border/40">
      <Filter className="h-3.5 w-3.5 text-muted-foreground/70" />
      <select
        value={selectedId ?? ''}
        onChange={(e) => setCategory(e.target.value || null)}
        className="h-8 bg-transparent text-sm font-medium text-foreground/80 focus:outline-none cursor-pointer pr-1"
        aria-label="Filtrar por categoria"
      >
        <option value="">Todas as categorias</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {selectedId && (
        <button
          type="button"
          onClick={() => setCategory(null)}
          className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-background hover:shadow-sm transition-all text-muted-foreground hover:text-foreground"
          title="Limpar filtro"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
