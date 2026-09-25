import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatarValor } from '@/lib/tabelas/formatar'
import type { OpcaoColuna, TipoColuna, ValorCelula } from '@/lib/tabelas/tipos'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'

const POR_PAGINA = 100

interface Coluna { id: string; nome: string; tipo: TipoColuna; opcoes: OpcaoColuna[] | null }
interface Linha { id: string; dados: Record<string, ValorCelula>; cliente_id: string | null }

export default async function TabelaLeitura({ setor, id }: { setor: SetorTabela; id: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: planilha } = await supabase.from('planilhas').select('id, nome, setor').eq('id', id).maybeSingle()
  if (!planilha || planilha.setor !== setor) notFound()

  const [{ data: colunasRaw }, { data: linhasRaw, count }] = await Promise.all([
    supabase.from('planilha_colunas').select('id, nome, tipo, opcoes').eq('planilha_id', id).order('ordem'),
    supabase.from('planilha_linhas').select('id, dados, cliente_id', { count: 'exact' })
      .eq('planilha_id', id).order('ordem').range(0, POR_PAGINA - 1),
  ])
  const colunas = (colunasRaw ?? []) as Coluna[]
  const linhas = (linhasRaw ?? []) as Linha[]

  return (
    <div className="p-8">
      <Link href={`/${setor}/tabelas`} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">← Tabelas</Link>
      <h1 className="text-2xl font-bold text-[var(--fg)] mt-2">{planilha.nome}</h1>
      <p className="text-sm text-[var(--fg)]/40 mt-1 mb-6">
        {count ?? linhas.length} linhas · mostrando as primeiras {Math.min(POR_PAGINA, linhas.length)} (somente leitura)
      </p>

      <div className="overflow-x-auto rounded-xl border border-[var(--fg)]/12">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--fg)]/12">
              {colunas.map(c => (
                <th key={c.id} className="text-left text-xs font-semibold text-[var(--fg)]/60 uppercase tracking-widest px-4 py-3 whitespace-nowrap">
                  {c.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.id} className="border-b border-[var(--fg)]/8">
                {colunas.map(c => {
                  const valor = l.dados[c.id] ?? null
                  const texto = formatarValor(c.tipo, valor)
                  const cor = c.tipo === 'opcoes' ? c.opcoes?.find(o => o.valor === valor)?.cor : undefined
                  return (
                    <td key={c.id} className="px-4 py-2.5 text-sm text-[var(--fg)] whitespace-nowrap">
                      {cor ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: cor + '25', color: cor, border: `1px solid ${cor}50` }}>{texto}</span>
                      ) : texto}
                      {c.tipo === 'cliente' && !l.cliente_id && valor !== null && (
                        <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30">sem cliente</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {linhas.length === 0 && <p className="text-center text-[var(--fg)]/30 py-12 text-sm">Tabela sem linhas.</p>}
      </div>
    </div>
  )
}
