import { PlanSelector } from './plan-selector'

export default function SignupPlanPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="px-6 py-4 md:px-12 border-b border-slate-100 bg-white/70 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <span className="font-semibold text-lg text-slate-800">Apita aí</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Escolha o plano ideal</h1>
          <p className="text-slate-600">
            Você pode trocar de plano a qualquer momento.
          </p>
        </div>
        <PlanSelector />
      </main>
    </div>
  )
}
