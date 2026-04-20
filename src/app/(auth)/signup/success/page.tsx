import Link from 'next/link'
import { CheckCircle2, ArrowRight, Info } from 'lucide-react'

export default function SignupSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex flex-col">
      <header className="px-6 py-4 md:px-12 border-b border-slate-100 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <span className="font-semibold text-lg text-slate-800">Apita aí</span>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-slate-900">Cadastro concluído!</h1>
            <p className="text-slate-600">
              Sua conta foi criada com sucesso. Você já pode acessar o sistema e começar a configurar
              seu clube.
            </p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3 text-left">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800 space-y-1">
              <p className="font-medium">Assinatura pendente de ativação</p>
              <p className="text-blue-700">
                Nossa equipe entrará em contato para confirmar o pagamento e ativar todos os recursos
                do seu plano.
              </p>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold shadow-lg shadow-blue-600/20 hover:shadow-xl transition-all"
          >
            Ir para o sistema
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  )
}
