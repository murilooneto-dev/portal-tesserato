'use client'

import { useMemo, useState, useTransition } from 'react'
import { Pencil, Plus, Receipt, Search, Trash2 } from 'lucide-react'
import { excluirMovimento } from '@/lib/financeiro-actions'
import { normalizarNome } from '@/lib/config-entidades'
import { formatarDdMm } from '@/lib/formatar-data'
import { formatarValor } from '@/lib/financeiro-movimentos'
import type { FinanceiroNatureza } from '@/lib/types'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import MenuMaisAcoes from '@/components/geral/MenuMaisAcoes'
import NovoMovimentoModal from './NovoMovimentoModal'

export interface MovimentoLinha {
  id: string
  tipo_id: string
  centro_custo_id: string | null
  valor: number
  data: string
  observacao: string | null
  tipo_nome: string
  centro_custo_nome: string | null
  created_at: string
}

interface Props {
  natureza: FinanceiroNatureza
  movimentos: MovimentoLinha[]
}

type Ordenacao = 'lancamento' | 'data_desc' | 'data_asc' | 'valor_desc' | 'valor_asc'

const OPCOES_ORDENACAO: { value: Ordenacao; label: string }[] = [
  { value: 'lancamento', label: 'Mais recente lançado' },
  { value: 'data_desc', label: 'Data (mais recente)' },
  { value: 'data_asc', label: 'Data (mais antiga)' },
  { value: 'valor_desc', label: 'Maior valor' },
  { value: 'valor_asc', label: 'Menor valor' },
]

// A lista inteira vem do servidor (em blocos de 1000); a tela mostra 50 por vez.
const POR_PAGINA = 50

// No cartão do celular o botão ⋯ fica com 36 px (mob-06).
const MENU_36 = '[&_[aria-haspopup]]:h-9 [&_[aria-haspopup]]:w-9'

function plural(n: number) {
  return `${n} ${n === 1 ? 'lançamento' : 'lançamentos'}`
}

export default function MovimentoListClient({ natureza, movimentos }: Props) {
  const ehEntrada = natureza === 'entrada'
  const titulo = ehEntrada ? 'Recebimentos' : 'Pagamentos'
  const botaoNovo = ehEntrada ? 'Novo recebimento' : 'Novo pagamento'
  const nomeItem = ehEntrada ? 'recebimento' : 'pagamento'

  const [modalAberto, setModalAberto] = useState(false)
  const [editando, setEditando] = useState<MovimentoLinha | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('lancamento')
  const [pagina, setPagina] = useState(1)

  function pedirExclusao(id: string) {
    setErroExcluir(null)
    setExcluindoId(id)
  }

  function cancelarExclusao() {
    setErroExcluir(null)
    setExcluindoId(null)
  }

  function handleExcluir(id: string) {
    setErroExcluir(null)
    startTransition(async () => {
      const { error } = await excluirMovimento(id, natureza)
      if (error) { setErroExcluir(error); return }
      setExcluindoId(null)
    })
  }

  const movimentosFiltrados = useMemo(() => {
    const termo = normalizarNome(busca)
    let lista = movimentos
    if (termo) {
      lista = lista.filter(m =>
        normalizarNome(m.tipo_nome).includes(termo) ||
        normalizarNome(m.centro_custo_nome ?? '').includes(termo) ||
        normalizarNome(m.observacao ?? '').includes(termo)
      )
    }
    lista = [...lista].sort((a, b) => {
      switch (ordenacao) {
        case 'data_desc': return b.data.localeCompare(a.data) || b.created_at.localeCompare(a.created_at)
        case 'data_asc': return a.data.localeCompare(b.data) || a.created_at.localeCompare(b.created_at)
        case 'valor_desc': return b.valor - a.valor
        case 'valor_asc': return a.valor - b.valor
        case 'lancamento':
        default: return b.created_at.localeCompare(a.created_at)
      }
    })
    return lista
  }, [movimentos, busca, ordenacao])

  const total = movimentosFiltrados.reduce((acc, m) => acc + m.valor, 0)
  const n = movimentosFiltrados.length
  const totalPaginas = Math.max(1, Math.ceil(n / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * POR_PAGINA
  const visiveis = movimentosFiltrados.slice(inicio, inicio + POR_PAGINA)

  const textoMostrando = n === 1
    ? 'Mostrando 1 lançamento'
    : totalPaginas === 1
      ? `Mostrando os ${n} lançamentos`
      : `Mostrando ${inicio + 1}–${inicio + visiveis.length} de ${n} lançamentos`

  const paginacao = totalPaginas > 1 && (
    <nav aria-label="Paginação" className="flex items-center gap-1.5">
      <Button variante="fantasma" tamanho="p" disabled={paginaAtual <= 1} onClick={() => { setPagina(paginaAtual - 1); setExcluindoId(null) }}>Anterior</Button>
      <span className="text-[13px] tabular-nums text-fg-3">Página {paginaAtual} de {totalPaginas}</span>
      <Button variante="fantasma" tamanho="p" disabled={paginaAtual >= totalPaginas} onClick={() => { setPagina(paginaAtual + 1); setExcluindoId(null) }}>Próxima</Button>
    </nav>
  )

  function itensMenu(m: MovimentoLinha) {
    return [
      { rotulo: 'Editar', icone: <Pencil size={16} aria-hidden="true" />, onSelecionar: () => setEditando(m) },
      { rotulo: 'Excluir', icone: <Trash2 size={16} aria-hidden="true" />, perigo: true, onSelecionar: () => pedirExclusao(m.id) },
    ]
  }

  function textoConfirmacao(m: MovimentoLinha) {
    return (
      <span className="min-w-0 text-sm text-fg-2 [&_b]:font-semibold [&_b]:text-fg">
        Excluir o {nomeItem} <b>{m.tipo_nome}</b> de {formatarDdMm(m.data)}, no valor de <b className="tabular-nums">{formatarValor(m.valor)}</b>?
      </span>
    )
  }

  function botoesConfirmacao(m: MovimentoLinha) {
    return (
      <div className="ml-auto flex flex-none items-center gap-2">
        <Button variante="fantasma" tamanho="p" onClick={cancelarExclusao} disabled={isPending}>Cancelar</Button>
        <Button variante="perigo-solido" tamanho="p" onClick={() => handleExcluir(m.id)} carregando={isPending}>
          Excluir {nomeItem}
        </Button>
      </div>
    )
  }

  const erroExclusao = erroExcluir && (
    <p role="alert" className="mt-2 text-[13px] text-danger">Não foi possível excluir: {erroExcluir}</p>
  )

  return (
    <Pagina>
      <CabecalhoPagina
        titulo={titulo}
        subtitulo={<>{plural(n)} · total <b className="font-semibold text-fg tabular-nums">{formatarValor(total)}</b></>}
        acoes={
          <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => setModalAberto(true)} className="hidden lg:inline-flex">
            {botaoNovo}
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field rotulo="Buscar" className="w-full sm:w-[360px]">
          {c => (
            <Input
              id={c.id}
              type="search"
              value={busca}
              onChange={e => { setBusca(e.target.value); setPagina(1); setExcluindoId(null) }}
              placeholder="Tipo, centro de custo ou observação"
              iconeEsquerda={<Search size={16} />}
            />
          )}
        </Field>
        <Field rotulo="Ordenar por" className="w-full sm:w-[230px]">
          {c => (
            <Select id={c.id} value={ordenacao} onChange={e => { setOrdenacao(e.target.value as Ordenacao); setPagina(1); setExcluindoId(null) }}>
              {OPCOES_ORDENACAO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
      </div>

      {n === 0 ? (
        <Card>
          <EmptyState
            icone={<Receipt size={24} />}
            titulo={movimentos.length === 0 ? 'Nenhum lançamento ainda.' : 'Nenhum lançamento encontrado com esse filtro.'}
          />
        </Card>
      ) : (
        <>
          {/* Celular (mob-06): total e um cartão por lançamento */}
          <div className="flex flex-col gap-3 lg:hidden">
            <div className="flex items-center gap-3 rounded-xl border border-line-soft bg-surface px-4 py-3.5">
              <span className="text-fg-2">Total</span>
              <b className="ml-auto font-mono text-xl font-semibold tabular-nums text-fg">{formatarValor(total)}</b>
            </div>
            {visiveis.map(m => excluindoId === m.id ? (
              <div key={m.id} className="rounded-xl border border-line-soft bg-danger-soft px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <Trash2 size={18} aria-hidden="true" className="mt-0.5 flex-none text-danger" />
                  {textoConfirmacao(m)}
                </div>
                <div className="mt-3 flex">{botoesConfirmacao(m)}</div>
                {erroExclusao}
              </div>
            ) : (
              <div key={m.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-line-soft bg-surface px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-fg" title={m.tipo_nome}>{m.tipo_nome}</p>
                  <p className="truncate text-[13px] text-fg-3">
                    {formatarDdMm(m.data)}{m.observacao ? ` · ${m.observacao}` : ''}
                  </p>
                </div>
                <b className="flex-none font-mono text-sm font-semibold tabular-nums text-fg">{formatarValor(m.valor)}</b>
                <div className={`-mr-2 -mt-1.5 flex-none ${MENU_36}`}>
                  <MenuMaisAcoes rotulo="Editar ou excluir" itens={itensMenu(m)} />
                </div>
              </div>
            ))}
            {(totalPaginas > 1) && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-fg-3">
                <span>{textoMostrando}</span>
                {paginacao}
              </div>
            )}
            {/* espaço para o botão flutuante não cobrir o último cartão */}
            <div aria-hidden="true" className="h-16" />
          </div>

          {/* Tela larga (fn-01 / fn-03): tabela */}
          <Card semPadding className="hidden overflow-hidden lg:block">
            <div className="relative overflow-x-auto xl:overflow-visible">
              <Tabela className="min-w-[940px]">
                <thead>
                  <tr>
                    <Th largura={140}>Data</Th>
                    <Th largura={220}>Tipo</Th>
                    <Th largura={220}>Centro de custo</Th>
                    <Th>Observação</Th>
                    <Th largura={ehEntrada ? 150 : 170} alinhar="dir">Valor</Th>
                    <Th largura={56}><span className="sr-only">Ações</span></Th>
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0">
                  {visiveis.map(m => excluindoId === m.id ? (
                    <tr key={m.id}>
                      <Td colSpan={6} className="bg-danger-soft">
                        <div className="flex flex-wrap items-center gap-3">
                          <Trash2 size={18} aria-hidden="true" className="flex-none text-danger" />
                          {textoConfirmacao(m)}
                          {botoesConfirmacao(m)}
                        </div>
                        {erroExclusao}
                      </Td>
                    </tr>
                  ) : (
                    <tr key={m.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                      <Td className="whitespace-nowrap font-mono text-[13px] tabular-nums text-fg-2">{formatarDdMm(m.data)}</Td>
                      <Td><span className="block truncate font-semibold text-fg" title={m.tipo_nome}>{m.tipo_nome}</span></Td>
                      <Td>
                        {m.centro_custo_nome
                          ? <span className="block truncate text-fg-2" title={m.centro_custo_nome}>{m.centro_custo_nome}</span>
                          : <span className="text-fg-3">—</span>}
                      </Td>
                      <Td>
                        {m.observacao
                          ? <span className="block truncate text-fg-2" title={m.observacao}>{m.observacao}</span>
                          : <span className="text-fg-2">—</span>}
                      </Td>
                      <Td alinhar="dir" className="whitespace-nowrap font-mono font-semibold tabular-nums text-fg">{formatarValor(m.valor)}</Td>
                      <Td alinhar="dir" className="py-2">
                        <div className="flex justify-end">
                          <MenuMaisAcoes rotulo="Editar ou excluir" itens={itensMenu(m)} />
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4} className="border-t border-line-soft px-[18px] py-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="text-[13px] text-fg-3">{textoMostrando}</span>
                        {paginacao}
                        <span className="ml-auto text-fg-2">Total</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap border-t border-line-soft px-3.5 py-3 text-right font-mono font-semibold tabular-nums text-fg">
                      {formatarValor(total)}
                    </td>
                    <td className="border-t border-line-soft" />
                  </tr>
                </tfoot>
              </Tabela>
            </div>
          </Card>
        </>
      )}

      <Button
        variante="primario"
        icone={<Plus size={18} aria-hidden="true" />}
        onClick={() => setModalAberto(true)}
        className="fixed right-4 bottom-[84px] z-30 h-[52px] rounded-[26px] px-5 shadow-lg lg:hidden"
      >
        {botaoNovo}
      </Button>

      {modalAberto && (
        <NovoMovimentoModal natureza={natureza} onClose={() => setModalAberto(false)} />
      )}

      {editando && (
        <NovoMovimentoModal
          natureza={natureza}
          onClose={() => setEditando(null)}
          movimento={{
            id: editando.id,
            tipoId: editando.tipo_id,
            tipoNome: editando.tipo_nome,
            centroCustoId: editando.centro_custo_id,
            centroCustoNome: editando.centro_custo_nome,
            valor: editando.valor,
            data: editando.data,
            observacao: editando.observacao,
          }}
        />
      )}
    </Pagina>
  )
}
