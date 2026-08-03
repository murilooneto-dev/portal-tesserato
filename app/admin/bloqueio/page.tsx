import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { getAdminSession } from '@/lib/admin-auth/server'
import { ehRotaAdmin } from '@/lib/rotas-admin'
import BloqueioForm from './BloqueioForm'

export const metadata = { title: 'Área Restrita — Tesserato' }

const DESTINO_PADRAO = '/fiscal/parametros'

interface Props {
  searchParams: Promise<{ next?: string; etapa?: string }>
}

export default async function BloqueioPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { next: nextParam, etapa } = await searchParams
  // SECURITY_REPORT.md MED-1: `startsWith('/')` sozinho aceita
  // `//evil.com`/`/\evil.com` (URL protocol-relative), que o browser e o
  // `redirect()`/`router.push()` tratam como absoluta para outro host —
  // um open redirect explorável contra o administrador logo após o login.
  // Validar contra a allowlist real de rotas ADMIN em vez de um prefixo.
  const next = nextParam && ehRotaAdmin(nextParam) ? nextParam : DESTINO_PADRAO

  // Já autenticado na seção ADMIN (e sem troca de senha pendente): não faz
  // sentido mostrar a tela de bloqueio de novo, segue direto ao destino.
  const session = await getAdminSession()
  if (session && !session.mustChangePassword) redirect(next)

  const view = session?.mustChangePassword || etapa === 'trocar-senha' ? 'trocar_senha' : 'login'

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 gap-3">
          <Image
            src="/logo.png"
            alt="Tesserato Contabilidade"
            width={96}
            height={96}
            className="rounded-xl"
            unoptimized
            priority
          />
          <div className="text-center">
            <p className="text-[var(--fg)] font-bold text-lg tracking-wide">Tesserato Contabilidade</p>
            <p className="text-[var(--fg)]/35 text-xs tracking-widest uppercase mt-0.5">Área Restrita · Seção ADMIN</p>
          </div>
        </div>

        <div className="bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-8">
          <BloqueioForm initialView={view} next={next} />
        </div>
      </div>
    </div>
  )
}
