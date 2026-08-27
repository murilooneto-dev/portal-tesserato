import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Configurações — Tesserato' }

const AREAS = [
  { href: '/admin/configuracoes/fiscal', label: 'Fiscal', desc: 'Grupos, Regimes, Atividades e Tarefas' },
  { href: '/admin/configuracoes/contabil', label: 'Contábil', desc: 'Grupos, Regimes, Atividades e Tarefas' },
  { href: '/admin/configuracoes/pessoal', label: 'Pessoal', desc: 'Grupos, Regimes, Atividades e Tarefas' },
  { href: '/admin/configuracoes/societario', label: 'Societário', desc: 'Processos e Documentações' },
]

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/intranet')

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-[var(--fg)] font-bold text-2xl mb-1">Configurações</h1>
      <p className="text-[var(--fg)]/50 text-sm mb-8">Escolha o setor para configurar.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {AREAS.map(area => (
          <Link
            key={area.href}
            href={area.href}
            className="block px-5 py-4 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8 hover:border-[var(--accent)]/40 hover:bg-[var(--fg)]/5 transition-colors"
          >
            <span className="block text-[var(--fg)] font-semibold text-sm mb-1">{area.label}</span>
            <span className="block text-[var(--fg)]/40 text-xs">{area.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
