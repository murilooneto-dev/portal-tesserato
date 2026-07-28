import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

type UsuarioTeste = {
  id: string
  email: string
  senha: string
}

const USO =
  'Uso: npx tsx scripts/rollout/criar-usuarios-teste.ts \'[{"id":"UUID","email":"...","senha":"..."}]\''

async function criarUsuariosTeste(usuarios: UsuarioTeste[]): Promise<boolean> {
  const url = process.env.TARGET_SUPABASE_URL
  const serviceRoleKey = process.env.TARGET_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Defina TARGET_SUPABASE_URL e TARGET_SERVICE_ROLE_KEY antes de rodar.')
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let algumaFalha = false

  for (const usuario of usuarios) {
    const { data, error } = await admin.auth.admin.createUser({
      id: usuario.id,
      email: usuario.email,
      password: usuario.senha,
      email_confirm: true,
    })

    if (error) {
      console.error(`Falha ao criar ${usuario.email} (id ${usuario.id}):`, error.message)
      algumaFalha = true
      continue
    }

    console.log(`Criado: ${usuario.email} — id ${data.user.id}`)
  }

  return algumaFalha
}

function lerUsuarios(argv2: string | undefined): UsuarioTeste[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(argv2 ?? '[]')
  } catch {
    console.error('JSON inválido no argumento.')
    console.error(USO)
    process.exit(1)
  }

  if (!Array.isArray(parsed)) {
    console.error('O argumento precisa ser um array JSON de usuários.')
    console.error(USO)
    process.exit(1)
  }

  return parsed as UsuarioTeste[]
}

const usuarios = lerUsuarios(process.argv[2])

if (usuarios.length === 0) {
  console.error(USO)
  process.exit(1)
}

criarUsuariosTeste(usuarios)
  .then((algumaFalha) => {
    if (algumaFalha) {
      console.error('\nUm ou mais usuários falharam — não considere este batch como sucesso.')
      process.exit(1)
    }
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
