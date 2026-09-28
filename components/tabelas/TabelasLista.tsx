import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { podeAcessarPagina } from '@/lib/route-permissions'
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
    supabase.from('planilhas').select('id, nome, created_at, planilha_linhas(count)').eq('setor', setor).order('created_at', { ascending: false }),
    podeCriar
      ? supabase.from('clientes').select('id, nome, cnpj').order('nome')
      : Promise.resolve({ data: [] as { id: string; nome: string; cnpj: string | null }[] }),
  ])

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--fg)]">Tabelas</h1>
          <p className="text-sm text-[var(--fg)]/40 mt-1">Planilhas mantidas dentro do sistema</p>
        </div>
        {podeCriar && <NovaTabelaWizard setor={setor} clientes={clientes ?? []} />}
      </div>

      <div className="flex flex-col gap-2">
        {(planilhas ?? []).map(p => {
          const linhas = (p.planilha_linhas as unknown as { count: number }[] | null)?.[0]?.count ?? 0
          return (
            <Link key={p.id} href={`/${setor}/tabelas/${p.id}`}
              className="flex items-center justify-between p-4 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/6 hover:bg-[var(--fg)]/6 transition-all">
              <span className="text-sm font-medium text-[var(--fg)]">{p.nome}</span>
              <span className="text-xs text-[var(--fg)]/40">{linhas.toLocaleString('pt-BR')} linhas · {new Date(p.created_at).toLocaleDateString('pt-BR')}</span>
            </Link>
          )
        })}
        {(planilhas ?? []).length === 0 && (
          <p className="text-center text-[var(--fg)]/30 py-12 text-sm">
            Nenhuma tabela ainda.{podeCriar ? ' Use “Nova tabela” para enviar uma planilha.' : ''}
          </p>
        )}
      </div>
    </div>
  )
}
