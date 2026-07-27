import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

type UsuarioTeste = {
  id: string
  email: string
  senha: string
}

async function criarUsuariosTeste(usuarios: UsuarioTeste[]) {
  const url = process.env.TARGET_SUPABASE_URL
  const serviceRoleKey = process.env.TARGET_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Defina TARGET_SUPABASE_URL e TARGET_SERVICE_ROLE_KEY antes de rodar.')
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  for (const usuario of usuarios) {
    const { data, error } = await admin.auth.admin.createUser({
      id: usuario.id,
      email: usuario.email,
      password: usuario.senha,
      email_confirm: true,
    })

    if (error) {
      console.error(`Falha ao criar ${usuario.email} (id ${usuario.id}):`, error.message)
      continue
    }

    console.log(`Criado: ${usuario.email} — id ${data.user.id}`)
  }
}

const usuarios: UsuarioTeste[] = JSON.parse(process.argv[2] ?? '[]')

if (usuarios.length === 0) {
  console.error(
    'Uso: npx tsx scripts/rollout/criar-usuarios-teste.ts \'[{"id":"UUID","email":"...","senha":"..."}]\'',
  )
  process.exit(1)
}

criarUsuariosTeste(usuarios).catch((err) => {
  console.error(err)
  process.exit(1)
})
