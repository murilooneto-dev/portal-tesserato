import { Megaphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import LinksRapidos from '@/components/fiscal/LinksRapidos'
import Agenda from '@/components/geral/agenda/Agenda'
import { Pagina } from '@/components/ui/Pagina'
import { Aviso } from '@/components/ui/Aviso'

export const metadata = { title: 'Início — Tesserato' }

export default async function IntranetPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: links }, { data: settings }, { data: profile }] = await Promise.all([
    supabase.from('links_rapidos').select('*').order('ordem'),
    supabase.from('app_settings').select('dashboard_announcement').eq('id', 1).single(),
    user ? supabase.from('profiles').select('role').eq('id', user.id).single() : Promise.resolve({ data: null }),
  ])

  const comunicado = settings?.dashboard_announcement?.trim() ?? ''
  const isAdmin = profile?.role === 'admin'

  const avisoComunicado = comunicado ? (
    <Aviso tom="warn" icone={<Megaphone size={18} />}>
      <b>Comunicado da administração</b>
      <p className="mt-0.5 whitespace-pre-wrap">{comunicado}</p>
    </Aviso>
  ) : null

  return (
    <Pagina>
      <Agenda titulo="Início" subtitulo="Sua agenda, os avisos da equipe e os links do escritório" topo={avisoComunicado} />
      <LinksRapidos links={links ?? []} isAdmin={isAdmin} />
    </Pagina>
  )
}
