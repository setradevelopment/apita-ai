'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { Plus, Trash2, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { createPosition, deletePosition } from '@/app/actions/positions'
import type { TargetOrgOpts } from '@/lib/auth/resolve-org'

interface Position {
  id: string
  name: string
}

export function PositionsSection({
  positions,
  onDirtyChange,
  orgId,
}: {
  positions: Position[]
  onDirtyChange?: (dirty: boolean) => void
  orgId?: string
}) {
  const [newName, setNewName] = useState('')
  const [isPending, startTransition] = useTransition()
  const { confirm } = useConfirm()
  const orgOpts = useMemo<TargetOrgOpts | undefined>(
    () => (orgId ? { forOrgId: orgId } : undefined),
    [orgId]
  )

  // Report dirty state: dirty while the input field has content
  useEffect(() => {
    onDirtyChange?.(newName.trim().length > 0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newName])

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    startTransition(async () => {
      await createPosition(newName.trim(), orgOpts)
      setNewName('') // also clears dirty via the useEffect above
    })
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: 'Excluir esta posição?',
      description: 'Atletas que usavam esta posição ficarão sem ela vinculada.',
      variant: 'destructive',
      confirmLabel: 'Excluir',
    })
    if (!ok) return
    startTransition(() => deletePosition(id, orgOpts))
  }

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">
        Posições disponíveis para atribuir aos atletas.
      </p>

      <form onSubmit={handleCreate} className="flex gap-2">
        <Input
          placeholder="ex: Central, Levantador, Técnico..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 h-9"
        />
        <Button type="submit" disabled={isPending || !newName.trim()} size="sm" className="gap-1.5 h-9 shadow-sm">
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </form>

      {positions.length === 0 ? (
        <div className="bg-card rounded-xl border border-dashed border-border/60 flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 mb-3">
            <Tag className="h-4 w-4 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">
            Nenhuma posição cadastrada ainda.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {positions.map((pos) => (
            <div
              key={pos.id}
              className="group flex items-center gap-2 rounded-lg border border-border/50 bg-card px-3 py-2 shadow-[0_1px_2px_0_rgb(0_0_0/0.03)] hover:shadow-[0_1px_4px_0_rgb(0_0_0/0.06)] transition-all"
            >
              <span className="text-sm font-medium">{pos.name}</span>
              <button
                type="button"
                onClick={() => handleDelete(pos.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
