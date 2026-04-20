'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Subscreve mudanças Realtime nas tabelas indicadas e chama `router.refresh()`
 * (com debounce) sempre que chega qualquer evento. É o mecanismo de "tempo real"
 * usado pelo painel do super_admin — qualquer alteração feita pelo contratante
 * (ou por outra aba) reflete na tela em ~300ms sem o usuário precisar dar F5.
 *
 * Pré-requisito: as tabelas precisam estar na publicação `supabase_realtime`
 * (ver migration 015). Sem isso, o servidor não emite eventos `postgres_changes`.
 *
 * O filtro é server-side amplo (sem `organization_id`): o `router.refresh()`
 * faz a página server component re-executar, que por sua vez já filtra por org.
 * Isso evita precisar de REPLICA IDENTITY FULL e mantém o código simples; o
 * tradeoff é refreshs ocasionais por mudanças em outras orgs (irrelevante no
 * volume atual).
 *
 * Passe `tables` como string com separador vírgula para manter a key estável
 * entre renders sem precisar de `useMemo` no caller.
 *
 * @example
 *   <LiveRefresh tables="trainings,member_attendances,member_categories" />
 */
export function LiveRefresh({ tables }: { tables: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const tableList = tables.split(',').map((t) => t.trim()).filter(Boolean)
    if (tableList.length === 0) return

    let pending: ReturnType<typeof setTimeout> | null = null
    const debouncedRefresh = () => {
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => router.refresh(), 300)
    }

    const channelName = `live-refresh-${tableList.join('-')}-${Math.random().toString(36).slice(2, 8)}`
    const channel = supabase.channel(channelName)

    for (const table of tableList) {
      channel.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        debouncedRefresh,
      )
    }

    channel.subscribe()

    return () => {
      if (pending) clearTimeout(pending)
      supabase.removeChannel(channel)
    }
  }, [router, tables])

  return null
}
