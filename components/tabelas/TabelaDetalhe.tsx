import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { podeEditarLinhas } from '@/lib/tabelas/permissoes'
import { paginar, POR_PAGINA } from '@/lib/tabelas/paginacao'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'
import type { ClienteMatch } from '@/lib/tabelas/cliente-match'
import TabelaEditavel, { type ColunaGrade, type LinhaGrade } from './TabelaEditavel'

interface Props {
  setor: SetorTabela
  id: string
  pagina?: string
  semCliente: boolean
}

export default async function TabelaDetalhe({ setor, id, pagina: paginaBruta, semCliente }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: planilha } = await supabase.from('planilhas').select('id, nome, setor').eq('id', id).maybeSingle()
  if (!planilha || planilha.setor !== setor) notFound()

  const [{ data: profile }, { data: colunasRaw }] = await Promise.all([
    supabase.from('profiles').select('role, setores').eq('id', user.id).single(),
    supabase.from('planilha_colunas').select('id, nome, tipo, opcoes').eq('planilha_id', id).order('ordem'),
  ])
  const colunas = (colunasRaw ?? []) as ColunaGrade[]
  const temColunaCliente = colunas.some(c => c.tipo === 'cliente')
  const filtrarSemCliente = semCliente && temColunaCliente
  const podeEditar = podeEditarLinhas(profile, setor)

  let contagem = supabase.from('planilha_linhas').select('id', { count: 'exact', head: true }).eq('planilha_id', id)
  if (filtrarSemCliente) contagem = contagem.is('cliente_id', null)
  const { count } = await contagem
  const total = count ?? 0
  const { pagina, totalPaginas, de, ate } = paginar(paginaBruta, total)

  let consulta = supabase.from('planilha_linhas').select('id, dados, cliente_id')
    .eq('planilha_id', id).order('ordem').range(de, ate)
  if (filtrarSemCliente) consulta = consulta.is('cliente_id', null)
  const { data: linhasRaw } = await consulta
  const linhas = (linhasRaw ?? []) as LinhaGrade[]

  // A lista de clientes só é buscada para quem pode editar e se há coluna Cliente.
  // (PostgREST limita a 1000 linhas por consulta; acima disso o seletor fica parcial.)
  let clientes: ClienteMatch[] = []
  if (podeEditar && temColunaCliente) {
    const { data } = await supabase.from('clientes').select('id, nome, cnpj').order('nome')
    clientes = (data ?? []) as ClienteMatch[]
  }

  const base = `/${setor}/tabelas/${id}`
  const link = (p: number, sem: boolean) => {
    const qs = new URLSearchParams()
    if (p > 1) qs.set('pagina', String(p))
    if (sem) qs.set('semCliente', '1')
    const s = qs.toString()
    return s ? `${base}?${s}` : base
  }

  return (
    <div className="p-8">
      <Link href={`/${setor}/tabelas`} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">← Tabelas</Link>
      <h1 className="text-2xl font-bold text-[var(--fg)] mt-2">{planilha.nome}</h1>
      <p className="text-sm text-[var(--fg)]/40 mt-1 mb-4">
        {total.toLocaleString('pt-BR')} {total === 1 ? 'linha' : 'linhas'}
        {filtrarSemCliente ? ' sem cliente' : ''}
        {totalPaginas > 1 ? ` · página ${pagina} de ${totalPaginas}` : ''}
        {podeEditar ? '' : ' · somente leitura'}
      </p>

      {temColunaCliente && (
        <div className="flex gap-2 mb-4 text-xs">
          <Link href={link(1, false)}
            className={`px-3 py-1.5 rounded-lg border ${!filtrarSemCliente ? 'bg-[var(--fg)]/10 border-[var(--fg)]/20 text-[var(--fg)]' : 'border-[var(--fg)]/10 text-[var(--fg)]/50 hover:text-[var(--fg)]'}`}>
            Todas
          </Link>
          <Link href={link(1, true)}
            className={`px-3 py-1.5 rounded-lg border ${filtrarSemCliente ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'border-[var(--fg)]/10 text-[var(--fg)]/50 hover:text-[var(--fg)]'}`}>
            Só sem cliente
          </Link>
        </div>
      )}

      <TabelaEditavel
        key={`${pagina}-${filtrarSemCliente}`}
        planilhaId={id}
        colunas={colunas}
        linhas={linhas}
        clientes={clientes}
        podeEditar={podeEditar}
      />

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-[var(--fg)]/50">
          {pagina > 1
            ? <Link href={link(pagina - 1, filtrarSemCliente)} className="px-3 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:text-[var(--fg)]">← Anterior</Link>
            : <span />}
          <span>Página {pagina} de {totalPaginas} · {POR_PAGINA} por página</span>
          {pagina < totalPaginas
            ? <Link href={link(pagina + 1, filtrarSemCliente)} className="px-3 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:text-[var(--fg)]">Próxima →</Link>
            : <span />}
        </div>
      )}
    </div>
  )
}
