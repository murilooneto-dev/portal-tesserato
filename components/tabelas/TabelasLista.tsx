import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRight, Table2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { podeAcessarPagina } from '@/lib/route-permissions'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import NovaTabelaWizard from './NovaTabelaWizard'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'

export default async function TabelasLista({ setor }: { setor: SetorTabela }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single()
  const podeCriar = podeAcessarPagina(profile, 'configuracoes', setor)

  const [{ data: planilhas }, { data: clientes }] = await Promise.all([
    supabase.from('planilhas').select('id, nome, created_at, updated_at, planilha_linhas(count)').eq('setor', setor).order('created_at', { ascending: false }),
    podeCriar
      ? supabase.from('clientes').select('id, nome, cnpj').order('nome')
      : Promise.resolve({ data: [] as { id: string; nome: string; cnpj: string | null }[] }),
  ])

  const lista = planilhas ?? []

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Tabelas"
        subtitulo="Planilhas mantidas dentro do sistema"
        acoes={podeCriar ? <NovaTabelaWizard setor={setor} clientes={clientes ?? []} /> : undefined}
      />

      <Card semPadding className="overflow-hidden">
        {lista.length === 0 ? (
          <EmptyState
            icone={<Table2 size={24} />}
            titulo="Nenhuma tabela ainda"
            descricao={podeCriar ? 'Use “Nova tabela” para enviar uma planilha.' : undefined}
          />
        ) : (
          <div className="relative overflow-x-auto">
            <Tabela className="min-w-[560px]">
              <thead>
                <tr>
                  <Th>Tabela</Th>
                  <Th largura={120} alinhar="dir">Linhas</Th>
                  <Th largura={150}>Atualizada em</Th>
                  <Th largura={56}><span className="sr-only">Abrir</span></Th>
                </tr>
              </thead>
              <tbody>
                {lista.map(p => {
                  const linhas = (p.planilha_linhas as unknown as { count: number }[] | null)?.[0]?.count ?? 0
                  const href = `/${setor}/tabelas/${p.id}`
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                      <Td className="whitespace-normal break-words">
                        <Link href={href} className="block rounded font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          {p.nome}
                        </Link>
                      </Td>
                      <Td alinhar="dir" className="text-fg-2">{linhas.toLocaleString('pt-BR')}</Td>
                      <Td className="text-fg-2">{new Date(p.updated_at ?? p.created_at).toLocaleDateString('pt-BR')}</Td>
                      <Td alinhar="dir">
                        <Link href={href} aria-label={`Abrir ${p.nome}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-fg-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <ChevronRight size={18} aria-hidden="true" />
                        </Link>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>
    </Pagina>
  )
}
