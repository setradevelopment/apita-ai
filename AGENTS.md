# Apita aí — contexto pros próximos chats

## Marca

- **Nome oficial**: "Apita aí" (com acento, com espaço)
- **Sem acento**: "Apita ai"
- **Sem espaço e sem acento**: `apita-ai` (kebab) ou `apita.ai` (domínio)
- **Domínio do site**: `apitaai.com.br`
- **Slug técnico** (`package.json`, fallback de slug, `localStorage`): `apita-ai`
- **Primeira letra do logo** (onde era "T" no TeamHub): "A"

Em textos para o usuário, **sempre** preferir "Apita aí" com acento. Versões sem acento/sem espaço só onde o contexto técnico proibir (URL, identificador, nome de pacote).

> Histórico: o projeto começou como "TeamHub" e foi renomeado pra "Apita aí". Se encontrar resíduos de "TeamHub" ou "teamhub" em algum arquivo, é bug de rebrand — pode substituir pelo equivalente da tabela acima.

## Stack

- **Next.js 16.2.3** (React 19.2.4) — versão recente com breaking changes. Ver `node_modules/next/dist/docs/` antes de escrever código novo, NÃO confiar em memória de versões antigas.
- **Supabase** cloud (Auth + Postgres + RLS). Migrations em `supabase/migrations/`.
- **Tailwind 4** + shadcn/ui.
- `@supabase/ssr` para Server Components; `createAdminClient` com service role pra server actions que fazem bypass de RLS.

## Estrutura chave

- `src/app/(auth)/` — login, signup, onboarding, join por token, change-password
- `src/app/(dashboard)/` — app interno: dashboard, members, trainings, financials, categories, settings, profile
- `src/app/(admin)/admin/` — painel do CEO (super_admin apenas — ver gate abaixo)
- `src/app/actions/` — server actions (Next.js 16 style)
- `src/lib/auth/` — `getSessionContext`, `resolveTargetOrg`

## Roles & multi-tenant

Roles: `super_admin` (dono do SaaS) > `admin` (contratante/dono do clube) > `coordinator` > `member` (atleta).
Isolamento por `organization_id` — toda query server-side já filtra por org via `resolveTargetOrg`/`getSessionContext`.

## Fluxo de pagamentos (importante — domínio central)

- **Atleta** marca pagamento como pago → `awaiting_confirmation` (com nota opcional)
- **Coord/admin** confirma no `/financials` → `paid`, ou rejeita → volta pra `pending`
- 3 tipos de registro: `member_attendances` (treino avulso/semanal/mensal dentro do mês), `monthly_payments` (mensalidade agregada), `subscription_invoices` (contratante pagando o SaaS pro super_admin)
- Status: `pending | awaiting_confirmation | paid | no_payment | refunded | exempt`

## Plano de deploy (acordado — ainda NÃO executado)

Quando o usuário pedir pra retomar:

1. **Domínio**: `apitaai.com.br` no Registro.br (usuário compra)
2. **Git**: `master` ainda sem commits — precisa primeiro commit + push pro GitHub
3. **Host**: Vercel Hobby → Pro quando tiver receita
4. **2 projetos Supabase separados**: `apita-ai-prod` e `apita-ai-staging` (NUNCA misturar — env vars diferentes por environment na Vercel)
5. **Gate do painel de CEO**: só em `VERCEL_ENV === 'production'` E email do dono (`gabrielsetrar@gmail.com`)
6. **Backups**: Supabase Pro (PITR) como baseline; feature self-service de backup por organização depois
7. **Anonimização de dados** pra clonar prod → staging (LGPD)

Checklist do que o Claude consegue fazer:
- Criar repo + push (via `gh`): sim
- Criar projetos Supabase (via MCP) + rodar migrations: sim
- Configurar env vars Vercel (via MCP): sim
- Clone prod → staging com anonimização: sim (script)
- Implementar gate do painel de CEO: sim (código)
- Implementar backup self-service: sim (código, dias de trabalho)
- Comprar domínio, pagar plano Pro, clicar OAuth Vercel↔GitHub pela primeira vez: **NÃO** — o usuário faz

## Contato

Dono: Gabriel (`gabrielsetrar@gmail.com`).

---

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
