// components/tabelas/TabelaDetalhe.tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { podeEditarLinhas } from '@/lib/tabelas/permissoes'
import { paginar, POR_PAGINA } from '@/lib/tabelas/paginacao'
import { parseConsulta, serializeConsulta, alternarOrdem, temConsultaAtiva, type ParamsBrutos } from '@/lib/tabelas/consulta'
import { consultarLinhas } from '@/lib/tabelas/consultar'
import type { SetorTabela } from '@/lib/tabelas/montar-payload'
import type { ClienteMatch } from '@/lib/tabelas/cliente-match'
import TabelaEditavel, { type ColunaGrade, type LinhaGrade } from './TabelaEditavel'
import BarraConsulta from './BarraConsulta'

interface Props {
  setor: SetorTabela
  id: string
  params: ParamsBrutos & { pagina?: string }
}

export default async function TabelaDetalhe({ setor, id, params }: Props) {
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
  const podeEditar = podeEditarLinhas(profile, setor)

  const consulta = parseConsulta(params, colunas)

  // 1ª chamada só para saber o total (limit 1); depois busca a página já limitada.
  const contagem = await consultarLinhas(supabase, id, consulta, colunas, 0, 1)
  const { pagina, totalPaginas, de } = paginar(params.pagina, contagem.total)
  const resultado = contagem.error || contagem.total === 0
    ? { linhas: [], total: contagem.total, error: contagem.error }
    : await consultarLinhas(supabase, id, consulta, colunas, de, POR_PAGINA)
  const linhas = resultado.linhas as LinhaGrade[]
  const total = contagem.total

  // A lista de clientes só é buscada para quem pode editar e se há coluna Cliente.
  // (PostgREST limita a 1000 linhas por consulta; acima disso o seletor fica parcial.)
  let clientes: ClienteMatch[] = []
  if (podeEditar && temColunaCliente) {
    const { data } = await supabase.from('clientes').select('id, nome, cnpj').order('nome')
    clientes = (data ?? []) as ClienteMatch[]
  }

  const base = `/${setor}/tabelas/${id}`
  const href = (c: typeof consulta, p: number = 1) => {
    const qs = serializeConsulta(c, p)
    return qs ? `${base}?${qs}` : base
  }
  const hrefsOrdem: Record<string, string> = {}
  for (const c of colunas) hrefsOrdem[c.id] = href(alternarOrdem(consulta, c.id))
  const consultaAtiva = temConsultaAtiva(consulta)
  const exportQs = serializeConsulta(consulta, 1)
  const exportarHref = `/api/tabelas/${id}/exportar${exportQs ? `?${exportQs}` : ''}`
  const hrefNovaLinha = href({ ...consulta, q: '', filtros: {} }, 999999)

  return (
    <div className="p-8">
      <Link href={`/${setor}/tabelas`} className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]">← Tabelas</Link>
      <h1 className="text-2xl font-bold text-[var(--fg)] mt-2">{planilha.nome}</h1>
      <p className="text-sm text-[var(--fg)]/40 mt-1 mb-4">
        {total.toLocaleString('pt-BR')} {total === 1 ? 'linha' : 'linhas'}
        {consultaAtiva ? ' na consulta' : ''}
        {totalPaginas > 1 ? ` · página ${pagina} de ${totalPaginas}` : ''}
        {podeEditar ? '' : ' · somente leitura'}
      </p>

      <BarraConsulta
        key={serializeConsulta(consulta, 1)}
        base={base}
        consulta={consulta}
        colunas={colunas}
        exportarHref={exportarHref}
      />

      {temColunaCliente && (
        <div className="flex gap-2 mb-4 text-xs">
          <Link href={href({ ...consulta, semCliente: false })}
            className={`px-3 py-1.5 rounded-lg border ${!consulta.semCliente ? 'bg-[var(--fg)]/10 border-[var(--fg)]/20 text-[var(--fg)]' : 'border-[var(--fg)]/10 text-[var(--fg)]/50 hover:text-[var(--fg)]'}`}>
            Todas
          </Link>
          <Link href={href({ ...consulta, semCliente: true })}
            className={`px-3 py-1.5 rounded-lg border ${consulta.semCliente ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'border-[var(--fg)]/10 text-[var(--fg)]/50 hover:text-[var(--fg)]'}`}>
            Só sem cliente
          </Link>
        </div>
      )}

      {resultado.error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          Não foi possível carregar as linhas. Se acabou de atualizar o sistema, confirme que a migration 049 foi aplicada no banco.
        </div>
      )}

      <TabelaEditavel
        key={`${pagina}-${serializeConsulta(consulta, 1)}`}
        planilhaId={id}
        colunas={colunas}
        linhas={linhas}
        clientes={clientes}
        podeEditar={podeEditar}
        ordenacao={{ coluna: consulta.ordem, desc: consulta.desc, hrefs: hrefsOrdem }}
        consultaAtiva={consultaAtiva}
        hrefNovaLinha={hrefNovaLinha}
      />

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-[var(--fg)]/50">
          {pagina > 1
            ? <Link href={href(consulta, pagina - 1)} className="px-3 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:text-[var(--fg)]">← Anterior</Link>
            : <span />}
          <span>Página {pagina} de {totalPaginas} · {POR_PAGINA} por página</span>
          {pagina < totalPaginas
            ? <Link href={href(consulta, pagina + 1)} className="px-3 py-1.5 rounded-lg border border-[var(--fg)]/10 hover:text-[var(--fg)]">Próxima →</Link>
            : <span />}
        </div>
      )}
    </div>
  )
}
