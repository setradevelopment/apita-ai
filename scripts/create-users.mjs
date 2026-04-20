/**
 * Script para criar usuários de teste no Supabase Auth
 * Execute: node scripts/create-users.mjs
 */

const SUPABASE_URL = 'https://zsauwrvuzxsihbomsyww.supabase.co'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  console.error('❌ Defina SUPABASE_SERVICE_ROLE_KEY no ambiente ou no .env.local')
  process.exit(1)
}

const users = [
  {
    email: 'coordenador@testeapp.com',
    password: 'coordenador',
    user_metadata: { role: 'coordinator', name: 'Coordenador Teste' },
  },
  {
    email: 'atleta@testeapp.com',
    password: 'atleta',
    user_metadata: { role: 'member', name: 'Atleta Teste' },
  },
]

async function createUser(user) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: user.user_metadata,
    }),
  })

  const data = await res.json()

  if (!res.ok) {
    console.error(`❌ Erro ao criar ${user.email}:`, data)
    return null
  }

  console.log(`✅ Usuário criado: ${user.email} (role: ${user.user_metadata.role}) → id: ${data.id}`)
  return data
}

console.log('🚀 Criando usuários de teste...\n')
for (const user of users) {
  await createUser(user)
}
console.log('\n✓ Concluído.')
