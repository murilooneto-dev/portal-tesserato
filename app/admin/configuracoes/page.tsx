import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowDownLeft, Building2, ChevronRight, CreditCard, FileText, Users, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { podeAcessarPagina } from '@/lib/route-permissions'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { EmptyState } from '@/components/ui/EmptyState'

export const metadata = { title: 'Configurações — Tesserato' }

const AREAS: { href: string; slug: string; label: string; desc: string; Icone: LucideIcon }[] = [
  { href: '/admin/configuracoes/fiscal', slug: 'fiscal', label: 'Fiscal', desc: 'Regimes, atividades e tarefas', Icone: FileText },
  { href: '/admin/configuracoes/contabil', slug: 'contabil', label: 'Contábil', desc: 'Regimes, atividades e tarefas', Icone: CreditCard },
  { href: '/admin/configuracoes/pessoal', slug: 'pessoal', label: 'Pessoal', desc: 'Regimes, atividades e tarefas', Icone: Users },
  { href: '/admin/configuracoes/societario', slug: 'societario', label: 'Societário', desc: 'Tipos de processo, documentações e tarefas', Icone: Building2 },
  { href: '/admin/configuracoes/financeiro', slug: 'financeiro', label: 'Financeiro', desc: 'Tipos de entrada e saída, centros de custo e tarefas', Icone: ArrowDownLeft },
]

export default async function ConfiguracoesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, setores, paginas_acesso')
    .eq('id', user.id)
    .single()

  const areasVisiveis = AREAS.filter(area => podeAcessarPagina(profile, 'configuracoes', area.slug))

  return (
    <Pagina>
      <CabecalhoPagina titulo="Configurações" subtitulo="Escolha o setor que você quer configurar" />

      {areasVisiveis.length === 0 ? (
        <EmptyState icone={<FileText size={24} />} titulo="Nenhum setor liberado para você configurar" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {areasVisiveis.map(({ href, label, desc, Icone }) => (
            <Link
              key={href}
              href={href}
              className="flex min-w-0 items-center gap-4 rounded-xl border border-line-soft bg-surface px-[22px] py-5 text-fg transition-colors hover:border-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            >
              <span aria-hidden="true" className="grid h-11 w-11 flex-none place-items-center rounded-[11px] bg-acc-soft text-acc-text">
                <Icone size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[17px] font-semibold">{label}</span>
                <span className="block text-[13px] text-fg-3">{desc}</span>
              </span>
              <ChevronRight size={20} aria-hidden="true" className="flex-none text-fg-3" />
            </Link>
          ))}
        </div>
      )}
    </Pagina>
  )
}
