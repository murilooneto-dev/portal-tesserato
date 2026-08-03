// lib/get-portal-context.ts
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getMesAno } from '@/lib/mes-atual-server'
import { SETOR_HOME, type Profile, type UserSetor } from '@/lib/types'
import { resolveSetorPagina, podeAcessarSetor, podeAcessarPagina } from '@/lib/route-permissions'

export async function getPortalContext(): Promise<{ profile: Profile; mes: number; ano: number }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const safeProfile: Profile = profile ?? {
    id: user.id,
    nome: user.email?.split('@')[0] ?? 'Usuário',
    role: 'operador',
    setores: ['fiscal'],
    cor: '#6366f1',
    created_at: new Date().toISOString(),
    paginas_acesso: [],
  }

  // Defesa em profundidade: repete a checagem de setor/página que o
  // proxy.ts já faz (via lib/route-permissions, fonte única dessa lógica).
  // Necessário porque o proxy é pulado para requisições que se identificam
  // como prefetch (headers "next-router-prefetch" / "purpose: prefetch") —
  // headers HTTP comuns que qualquer cliente pode enviar pra escapar do
  // matcher do Proxy. Sem essa checagem aqui, uma requisição forjada com
  // esses headers acessaria qualquer setor/página só por ter uma sessão
  // válida, mesmo sem pertencer àquele setor (privilege escalation / IDOR
  // entre setores). O proxy injeta o header `x-pathname` em toda requisição
  // que ele processa; se esse header não chegar aqui, é sinal de que o
  // proxy foi pulado — nega o acesso por padrão em vez de confiar apenas em
  // "existe um usuário logado".
  const pathname = (await headers()).get('x-pathname')
  if (!pathname) redirect('/login')

  const { setor, pagina } = resolveSetorPagina(pathname)
  if (setor && (!podeAcessarSetor(safeProfile, setor) || !podeAcessarPagina(safeProfile, setor, pagina))) {
    const primeiroSetor = safeProfile.setores?.[0] as UserSetor | undefined
    redirect(primeiroSetor ? SETOR_HOME[primeiroSetor] : '/intranet')
  }

  const { mes, ano } = await getMesAno()

  return { profile: safeProfile, mes, ano }
}
