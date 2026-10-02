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
import { podeAcessarPagina } from '@/lib/route-permissions'
import { ChevronLeft } from 'lucide-react'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Aviso } from '@/components/ui/Aviso'
import GerenciarEstrutura from './GerenciarEstrutura'
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

  const { data: planilha } = await supabase.from('planilhas').select('id, nome, setor, coluna_chave').eq('id', id).maybeSingle()
  if (!planilha || planilha.setor !== setor) notFound()

  const [{ data: profile }, { data: colunasRaw }] = await Promise.all([
    supabase.from('profiles').select('role, setores, paginas_acesso').eq('id', user.id).single(),
    supabase.from('planilha_colunas').select('id, nome, tipo, opcoes').eq('planilha_id', id).order('ordem'),
  ])
  const colunas = (colunasRaw ?? []) as ColunaGrade[]
  const temColunaCliente = colunas.some(c => c.tipo === 'cliente')
  const podeEditar = podeEditarLinhas(profile, setor)
  const podeConfigurar = podeAcessarPagina(profile, 'configuracoes', setor)

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
  if ((podeEditar || podeConfigurar) && temColunaCliente) {
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


  const linkSemCliente = (ativo: boolean) =>
    `inline-flex h-[30px] items-center rounded-[7px] border px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
      ativo ? 'border-acc bg-acc-soft text-acc-text' : 'border-line text-fg-2 hover:border-fg-3 hover:text-fg'
    }`
  const linkPagina = 'inline-flex h-9 items-center rounded-lg border border-line bg-raised px-3.5 text-sm font-medium text-fg hover:border-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc'

  return (
    <Pagina>
      <Link href={`/${setor}/tabelas`} className="inline-flex w-fit items-center gap-1 rounded text-[13px] text-fg-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
        <ChevronLeft size={14} aria-hidden="true" />Tabelas
      </Link>
      <CabecalhoPagina
        titulo={planilha.nome}
        subtitulo={`${total.toLocaleString('pt-BR')} ${total === 1 ? 'linha' : 'linhas'}${consultaAtiva ? ' na consulta' : ''}${totalPaginas > 1 ? ` · página ${pagina} de ${totalPaginas}` : ''}${podeEditar ? '' : ' · somente leitura'}`}
        acoes={podeConfigurar ? (
          <GerenciarEstrutura planilhaId={id} nome={planilha.nome} setor={setor} colunas={colunas}
            temColunaChave={planilha.coluna_chave !== null} clientes={clientes} />
        ) : undefined}
      />

      <BarraConsulta
        key={serializeConsulta(consulta, 1)}
        base={base}
        consulta={consulta}
        colunas={colunas}
        exportarHref={exportarHref}
      />

      {temColunaCliente && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por vínculo com cliente">
          <Link href={href({ ...consulta, semCliente: false })} aria-current={!consulta.semCliente ? 'true' : undefined} className={linkSemCliente(!consulta.semCliente)}>
            Todas
          </Link>
          <Link href={href({ ...consulta, semCliente: true })} aria-current={consulta.semCliente ? 'true' : undefined} className={linkSemCliente(consulta.semCliente)}>
            Só sem cliente
          </Link>
        </div>
      )}

      {resultado.error && (
        <Aviso tom="dng">
          Não foi possível carregar as linhas. Se acabou de atualizar o sistema, confirme que a migration 049 foi aplicada no banco.
        </Aviso>
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
        rodape={totalPaginas > 1 ? (
          <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft px-3.5 py-3 text-[13px] text-fg-3">
            {pagina > 1
              ? <Link href={href(consulta, pagina - 1)} className={linkPagina}>Anterior</Link>
              : <span />}
            <span>Página {pagina} de {totalPaginas} · {POR_PAGINA} por página</span>
            {pagina < totalPaginas
              ? <Link href={href(consulta, pagina + 1)} className={linkPagina}>Próxima</Link>
              : <span />}
          </nav>
        ) : undefined}
      />
    </Pagina>
  )
}
