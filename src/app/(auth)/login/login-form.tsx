'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, ArrowRight, Loader2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const supabase = createClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('E-mail ou senha incorretos.')
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user!.id)
      .single()

    const role = profile?.role ?? 'member'
    if (role === 'super_admin') {
      router.push('/admin')
    } else {
      router.push('/dashboard')
    }
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground/80" htmlFor="email">
          E-mail
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            className="pl-10 h-11 bg-muted/30 border-border/60 focus:bg-background transition-colors"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground/80" htmlFor="password">
            Senha
          </label>
          <button
            type="button"
            onClick={() => setForgotOpen(true)}
            className="text-xs text-primary/70 hover:text-primary transition-colors cursor-pointer"
          >
            Esqueceu a senha?
          </button>
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            className="pl-10 h-11 bg-muted/30 border-border/60 focus:bg-background transition-colors"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/8 px-4 py-3 rounded-lg border border-destructive/15">
          <div className="w-1.5 h-1.5 rounded-full bg-destructive shrink-0" />
          {error}
        </div>
      )}

      <Button className="w-full h-11 gap-2 font-medium text-sm" type="submit" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Entrando...
          </>
        ) : (
          <>
            Entrar
            <ArrowRight className="h-4 w-4" />
          </>
        )}
      </Button>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <KeyRound className="h-4 w-4" />
              </div>
              <DialogTitle className="text-base">Redefinir senha</DialogTitle>
            </div>
            <DialogDescription className="text-sm leading-relaxed">
              Para redefinir sua senha, entre em contato com o{' '}
              <strong className="text-foreground">responsável pela sua conta</strong> (coordenação ou administrador
              do clube) e solicite a geração de uma senha provisória.
              <br />
              <br />
              Assim que receber a senha provisória, você poderá entrar normalmente — o sistema vai
              solicitar que você defina uma nova senha pessoal no primeiro acesso.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setForgotOpen(false)}
            >
              Entendi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}
