import { createClient } from '@/lib/supabase/server'
import LinksRapidos from '@/components/fiscal/LinksRapidos'
import AgendaPessoal from '@/components/fiscal/AgendaPessoal'

export const metadata = { title: 'Intranet — Tesserato Fiscal' }

export default async function IntranetPage() {
  const supabase = await createClient()

  const [{ data: links }, { data: settings }] = await Promise.all([
    supabase.from('links_rapidos').select('*').order('ordem'),
    supabase.from('app_settings').select('dashboard_announcement').eq('id', 1).single(),
  ])

  const comunicado = settings?.dashboard_announcement?.trim() ?? ''

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {comunicado && (
        <div className="mb-8 flex gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
          <span className="text-amber-400 text-lg shrink-0">📢</span>
          <p className="text-amber-200/90 text-sm leading-relaxed whitespace-pre-wrap">{comunicado}</p>
        </div>
      )}
      <AgendaPessoal />
      <div className="mt-10 pt-8 border-t border-white/8">
        <LinksRapidos links={links ?? []} />
      </div>
    </div>
  )
}
