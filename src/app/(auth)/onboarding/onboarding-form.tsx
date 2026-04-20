'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Loader2, Search, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveOnboarding, type OnboardingData } from '@/app/actions/onboarding'

const ADDRESS_TYPES = ['casa', 'trabalho', 'faculdade', 'outros'] as const

export function OnboardingForm({ initial }: { initial: OnboardingData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<OnboardingData>(initial)
  const [error, setError] = useState('')
  const [cepLoading, setCepLoading] = useState({ origin: false, destination: false })
  const [cepError, setCepError] = useState<{ origin: string | null; destination: string | null }>(
    { origin: null, destination: null },
  )

  /**
   * Busca endereço no ViaCEP quando o CEP tem 8 dígitos. Preenche rua/bairro
   * automaticamente, mas o usuário pode editar manualmente depois.
   */
  async function fetchCep(dir: 'origin' | 'destination', rawValue: string) {
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
        [`${dir}_street`]: data.logradouro ?? f[`${dir}_street` as keyof OnboardingData],
        [`${dir}_neighborhood`]: data.bairro ?? f[`${dir}_neighborhood` as keyof OnboardingData],
      }))
    } catch {
      setCepError((p) => ({ ...p, [dir]: 'Erro ao consultar CEP.' }))
    } finally {
      setCepLoading((p) => ({ ...p, [dir]: false }))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      try {
        await saveOnboarding(form)
        // Após completar, o layout do dashboard já não redireciona mais. Um
        // refresh garante que a próxima navegação usa o profile atualizado.
        router.push('/dashboard')
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao salvar cadastro.')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Dados pessoais ────────────────────────────────────────── */}
      <section className="space-y-4 bg-card border border-border/50 rounded-xl p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        <h3 className="text-sm font-semibold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
          Dados pessoais
        </h3>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Nome completo *</Label>
          <Input
            placeholder="Seu nome completo"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="h-10"
            required
            disabled={isPending}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Data de nascimento *</Label>
            <Input
              type="date"
              value={form.dob}
              onChange={(e) => setForm((f) => ({ ...f, dob: e.target.value }))}
              className="h-10"
              required
              disabled={isPending}
            />
            <p className="text-[11px] text-muted-foreground/70 leading-snug">
              *usado para cadastro em torneios e campeonatos
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">CPF *</Label>
            <Input
              placeholder="00000000000"
              value={form.cpf}
              inputMode="numeric"
              className="h-10 font-mono tracking-wider"
              maxLength={11}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 11)
                setForm((f) => ({ ...f, cpf: v }))
              }}
              required
              disabled={isPending}
            />
            <p className="text-[11px] text-muted-foreground/70 leading-snug">
              *usado para cadastro em torneios e campeonatos
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">RG *</Label>
          <Input
            placeholder="0000000000"
            value={form.rg}
            inputMode="numeric"
            className="h-10 font-mono tracking-wider"
            maxLength={10}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 10)
              setForm((f) => ({ ...f, rg: v }))
            }}
            required
            disabled={isPending}
          />
          <p className="text-[11px] text-muted-foreground/70 leading-snug">
            *usado para cadastro em torneios e campeonatos
          </p>
        </div>
      </section>

      {/* ── Logística ─────────────────────────────────────────────── */}
      <section className="space-y-5 bg-card border border-border/50 rounded-xl p-5 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">
        <div>
          <h3 className="text-sm font-semibold tracking-tight" style={{ fontFamily: "'Outfit', sans-serif" }}>
            Logística
          </h3>
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-snug">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              *usado para ver quem mora perto e tentar melhorar a logística dos nossos atletas. Não é necessário informar número/apartamento — <strong>apenas</strong> a rua.
            </span>
          </div>
        </div>

        {(['origin', 'destination'] as const).map((dir) => {
          const label = dir === 'origin' ? 'Saída para o treino' : 'Destino após o treino'
          const typeKey = `${dir}_type` as keyof OnboardingData
          const streetKey = `${dir}_street` as keyof OnboardingData
          const nbhKey = `${dir}_neighborhood` as keyof OnboardingData
          const zipKey = `${dir}_zip` as keyof OnboardingData
          return (
            <div key={dir} className="space-y-3">
              <Label className="text-sm font-semibold">{label} *</Label>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">CEP *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="00000000"
                    value={form[zipKey] as string}
                    inputMode="numeric"
                    className="h-10 w-36 font-mono"
                    maxLength={8}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 8)
                      setForm((f) => ({ ...f, [zipKey]: v }))
                      if (v.length === 8) fetchCep(dir, v)
                    }}
                    required
                    disabled={isPending}
                  />
                  <button
                    type="button"
                    onClick={() => fetchCep(dir, form[zipKey] as string)}
                    disabled={cepLoading[dir] || isPending}
                    title="Buscar endereço pelo CEP (ViaCEP)"
                    className="h-10 w-10 flex items-center justify-center rounded-md border border-border/60 bg-card hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    {cepLoading[dir]
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Search className="h-4 w-4" />}
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
                  <button
                    key={t}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, [typeKey]: t }))}
                    disabled={isPending}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Rua *</Label>
                  <Input
                    value={form[streetKey] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [streetKey]: e.target.value }))}
                    className="h-10"
                    required
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Bairro *</Label>
                  <Input
                    value={form[nbhKey] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [nbhKey]: e.target.value }))}
                    className="h-10"
                    required
                    disabled={isPending}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </section>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 px-4 py-3 rounded-lg border border-destructive/15">
          <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
          {error}
        </div>
      )}

      <Button className="w-full h-11 gap-2 font-medium text-sm" type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Salvando…
          </>
        ) : (
          <>
            Concluir cadastro
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  )
}
