import { Trophy } from 'lucide-react'
import { SignupForm } from './signup-form'

export default function SignupPage() {
  return (
    <div className="flex min-h-screen">
      {/* Painel esquerdo */}
      <div
        className="hidden lg:flex lg:w-[45%] flex-col items-center justify-center p-12 relative overflow-hidden"
        style={{
          background:
            'linear-gradient(135deg, oklch(0.30 0.08 270), oklch(0.22 0.05 270) 50%, oklch(0.18 0.04 270))',
        }}
      >
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-[10%] left-[10%] w-64 h-64 rounded-full border border-white/[0.06]" />
          <div className="absolute top-[5%] left-[5%] w-96 h-96 rounded-full border border-white/[0.04]" />
          <div className="absolute bottom-[10%] right-[10%] w-72 h-72 rounded-full border border-white/[0.06]" />
          <div className="absolute bottom-[5%] right-[5%] w-[28rem] h-[28rem] rounded-full border border-white/[0.03]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40rem] h-[40rem] rounded-full bg-white/[0.02]" />
        </div>

        <div className="relative z-10 flex flex-col items-center text-center gap-8">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/10">
            <Trophy className="h-8 w-8 text-white" />
          </div>
          <div className="space-y-3">
            <h1
              className="text-4xl font-bold text-white tracking-tight"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              Crie sua conta
            </h1>
            <p className="text-base text-white/60 font-light">
              Comece a gerenciar seu clube hoje
            </p>
          </div>
          <p className="max-w-[320px] text-white/40 text-sm leading-relaxed">
            Categorias, atletas, treinos, presenças e finanças — tudo organizado em um só lugar.
          </p>
          <div className="flex gap-2 mt-4">
            <div className="w-8 h-1 rounded-full bg-white/30" />
            <div className="w-8 h-1 rounded-full bg-white/10" />
            <div className="w-8 h-1 rounded-full bg-white/10" />
          </div>
        </div>
      </div>

      {/* Painel direito — formulário */}
      <div className="flex flex-1 items-start justify-center bg-background p-8 overflow-y-auto">
        <div className="w-full max-w-[440px] space-y-6 py-4">
          <div className="flex flex-col items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary">
              <Trophy className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "'Outfit', sans-serif" }}>
              Apita aí
            </h1>
          </div>

          <div className="space-y-2">
            <h2
              className="text-2xl font-semibold tracking-tight"
              style={{ fontFamily: "'Outfit', sans-serif" }}
            >
              Cadastro do contratante
            </h2>
            <p className="text-muted-foreground text-sm">
              Preencha os dados para começar — escolha de plano e pagamento nas próximas etapas.
            </p>
          </div>

          <SignupForm />
        </div>
      </div>
    </div>
  )
}
