import Link from 'next/link'

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-white to-blue-50">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 md:px-12">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-lg">A</span>
          </div>
          <span className="font-semibold text-lg text-slate-800">Apita aí</span>
        </div>
        <Link
          href="/login"
          className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors border border-slate-200"
        >
          Login
        </Link>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium mb-8">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            Em manutenção — novas inscrições abertas em breve
          </div>

          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight">
            Gestão completa para
            <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              clubes esportivos
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 mb-10 leading-relaxed">
            Controle de categorias, atletas, treinos, presenças e financeiro em um só lugar.
            Pensado para quem gerencia a base de clubes esportivos.
          </p>

          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-lg shadow-lg shadow-blue-600/20 hover:shadow-xl hover:shadow-blue-600/30 transition-all hover:scale-[1.02]"
          >
            Cadastre-se
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>

          <p className="mt-6 text-sm text-slate-500">
            Comece com o plano Basic por apenas R$ 30/mês
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-6 text-center text-sm text-slate-500 border-t border-slate-100">
        © {new Date().getFullYear()} Apita aí. Todos os direitos reservados.
      </footer>
    </div>
  )
}
