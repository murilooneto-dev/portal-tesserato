import { createClient } from '@/lib/supabase/server'
import LinksRapidos from '@/components/fiscal/LinksRapidos'
import CalendarioFiscal from '@/components/fiscal/CalendarioFiscal'

export const metadata = { title: 'Intranet — Tesserato Fiscal' }

export default async function IntranetPage() {
  const supabase = await createClient()

  const { data: links } = await supabase
    .from('links_rapidos')
    .select('*')
    .order('ordem')

  const hoje = new Date()
  const mes = hoje.getMonth() + 1
  const ano = hoje.getFullYear()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Intranet</h1>
        <p className="text-white/40 mt-1 text-sm">Sistemas e ferramentas do escritório</p>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-8">
        <LinksRapidos links={links ?? []} />
        <CalendarioFiscal mes={mes} ano={ano} />
      </div>
    </div>
  )
}
