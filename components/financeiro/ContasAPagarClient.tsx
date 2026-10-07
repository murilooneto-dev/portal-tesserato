'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Pencil, Plus, Search, SlidersHorizontal, Trash2, Undo2, X } from 'lucide-react'
import { definirPagamentoConfirmado, excluirMovimento } from '@/lib/financeiro-actions'
import { normalizarNome } from '@/lib/config-entidades'
import { formatarDdMm } from '@/lib/formatar-data'
import { formatarValor, situacaoPagamento, type ResultadoFormaPagamento } from '@/lib/financeiro-movimentos'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Aviso } from '@/components/ui/Aviso'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { cn } from '@/components/ui/cn'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import MenuMaisAcoes from '@/components/geral/MenuMaisAcoes'
import NovoMovimentoModal from './NovoMovimentoModal'
import NovaContaModal from './NovaContaModal'
import type { MovimentoLinha } from './MovimentoListClient'

export type ContaLinha = MovimentoLinha & { competencia: string | null }

interface Props {
  contas: ContaLinha[]
  /** Mês e ano escolhidos no seletor do portal: a lista traz o mês e as vencidas de antes. */
  mes: number
  ano: number
  /** Hoje (YYYY-MM-DD, fuso de São Paulo), pra saber o que está vencido. */
  hoje: string
  /** Só admin cria conta nova (é quem define a forma de pagamento de um tipo). */
  podeCriar: boolean
}

type Ordenacao = 'data_asc' | 'data_desc' | 'valor_desc' | 'valor_asc'

const OPCOES_ORDENACAO: { value: Ordenacao; label: string }[] = [
  { value: 'data_asc', label: 'Vencimento (mais antigo)' },
  { value: 'data_desc', label: 'Vencimento (mais recente)' },
  { value: 'valor_desc', label: 'Maior valor' },
  { value: 'valor_asc', label: 'Menor valor' },
]

// A lista inteira vem do servidor (em blocos de 1000); a tela mostra 50 por vez.
const POR_PAGINA = 50

// No cartão do celular o botão ⋯ fica com 36 px (mob-06).
const MENU_36 = '[&_[aria-haspopup]]:h-9 [&_[aria-haspopup]]:w-9'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function plural(n: number) {
  return `${n} ${n === 1 ? 'conta' : 'contas'}`
}

export default function ContasAPagarClient({ contas, mes, ano, hoje, podeCriar }: Props) {
  const router = useRouter()
  const periodo = `${MESES[mes - 1]} de ${ano}`

  const [criando, setCriando] = useState(false)
  // Conta recém-criada: diz quantas contas nasceram (elas podem estar em outro mês).
  const [criada, setCriada] = useState<{ nome: string; quantidade: number } | null>(null)
  const [editando, setEditando] = useState<ContaLinha | null>(null)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)
  const [erroPagar, setErroPagar] = useState<string | null>(null)
  // Última conta paga, com o botão Desfazer: o Toast do projeto não tem ação.
  const [desfazer, setPagaAgora] = useState<{ id: string; tipo: string; vencimento: string } | null>(null)
  // Trocou o mês no seletor: o aviso some de vez (não volta ao retornar ao
  // mês). Ajuste de estado durante a renderização, sem effect.
  const mesDoSeletor = `${ano}-${mes}`
  const [mesVisto, setMesVisto] = useState(mesDoSeletor)
  if (mesVisto !== mesDoSeletor) {
    setMesVisto(mesDoSeletor)
    setPagaAgora(null)
    setCriada(null)
  }

  function handleCriada(nome: string, resultado: ResultadoFormaPagamento) {
    setCriando(false)
    setCriada({ nome, quantidade: resultado.criadas })
    router.refresh()
  }

  const botaoNovaConta = (classe?: string) => (
    <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => setCriando(true)} className={classe}>
      Nova conta
    </Button>
  )
  const [isPending, startTransition] = useTransition()
  const [busca, setBusca] = useState('')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('data_asc')
  const [pagina, setPagina] = useState(1)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  function pedirExclusao(id: string) {
    setErroExcluir(null)
    setExcluindoId(id)
  }

  function cancelarExclusao() {
    setErroExcluir(null)
    setExcluindoId(null)
  }

  function handleExcluir(id: string, escopo: 'este' | 'este_e_proximos' = 'este') {
    setErroExcluir(null)
    startTransition(async () => {
      const { error } = await excluirMovimento(id, 'saida', escopo)
      if (error) { setErroExcluir(error); return }
      setExcluindoId(null)
      router.refresh()
    })
  }

  function handlePagar(m: ContaLinha) {
    setErroPagar(null)
    setPagaAgora(null)
    startTransition(async () => {
      const { error } = await definirPagamentoConfirmado(m.id, true)
      if (error) { setErroPagar(error); return }
      setPagaAgora({ id: m.id, tipo: m.tipo_nome, vencimento: formatarDdMm(m.data).slice(0, 5) })
      router.refresh()
    })
  }

  function handleDesfazer(id: string) {
    setErroPagar(null)
    startTransition(async () => {
      const { error } = await definirPagamentoConfirmado(id, false)
      if (error) { setErroPagar(error); return }
      setPagaAgora(null)
      router.refresh()
    })
  }

  const filtradas = useMemo(() => {
    const termo = normalizarNome(busca)
    let lista = contas
    if (termo) {
      lista = lista.filter(m =>
        normalizarNome(m.tipo_nome).includes(termo) ||
        normalizarNome(m.centro_custo_nome ?? '').includes(termo) ||
        normalizarNome(m.observacao ?? '').includes(termo)
      )
    }
    return [...lista].sort((a, b) => {
      switch (ordenacao) {
        case 'data_desc': return b.data.localeCompare(a.data) || a.id.localeCompare(b.id)
        case 'valor_desc': return b.valor - a.valor
        case 'valor_asc': return a.valor - b.valor
        case 'data_asc':
        default: return a.data.localeCompare(b.data) || a.id.localeCompare(b.id)
      }
    })
  }, [contas, busca, ordenacao])

  const total = filtradas.reduce((acc, m) => acc + m.valor, 0)
  const vencido = filtradas.reduce((acc, m) => situacaoPagamento(m, hoje) === 'vencido' ? acc + m.valor : acc, 0)
  const n = filtradas.length
  const totalPaginas = Math.max(1, Math.ceil(n / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const inicio = (paginaAtual - 1) * POR_PAGINA
  const visiveis = filtradas.slice(inicio, inicio + POR_PAGINA)

  const textoMostrando = n === 1
    ? 'Mostrando 1 conta'
    : totalPaginas === 1
      ? `Mostrando as ${n} contas`
      : `Mostrando ${inicio + 1}–${inicio + visiveis.length} de ${n} contas`

  const paginacao = totalPaginas > 1 && (
    <nav aria-label="Paginação" className="flex items-center gap-1.5">
      <Button variante="fantasma" tamanho="p" disabled={paginaAtual <= 1} onClick={() => { setPagina(paginaAtual - 1); setExcluindoId(null) }}>Anterior</Button>
      <span className="text-[13px] tabular-nums text-fg-3">Página {paginaAtual} de {totalPaginas}</span>
      <Button variante="fantasma" tamanho="p" disabled={paginaAtual >= totalPaginas} onClick={() => { setPagina(paginaAtual + 1); setExcluindoId(null) }}>Próxima</Button>
    </nav>
  )

  function itensMenu(m: ContaLinha) {
    return [
      { rotulo: 'Editar', icone: <Pencil size={16} aria-hidden="true" />, onSelecionar: () => setEditando(m) },
      { rotulo: 'Excluir', icone: <Trash2 size={16} aria-hidden="true" />, perigo: true, onSelecionar: () => pedirExclusao(m.id) },
    ]
  }

  function textoConfirmacao(m: ContaLinha) {
    return (
      <span className="min-w-0 text-sm text-fg-2 [&_b]:font-semibold [&_b]:text-fg">
        Excluir a conta <b>{m.tipo_nome}</b> com vencimento em {formatarDdMm(m.data)}, no valor de <b className="tabular-nums">{formatarValor(m.valor)}</b>?
        {m.recorrencia_id
          ? <> É uma conta recorrente: dá para excluir só esta ou também as dos meses seguintes.</>
          : m.competencia && <> Para parar de criar esta conta, mude a forma de pagamento do tipo em Configurações.</>}
      </span>
    )
  }

  function botoesConfirmacao(m: ContaLinha) {
    return (
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <Button variante="fantasma" tamanho="p" onClick={cancelarExclusao} disabled={isPending}>Cancelar</Button>
        {m.recorrencia_id ? (
          <>
            <Button variante="perigo" tamanho="p" onClick={() => handleExcluir(m.id, 'este_e_proximos')} disabled={isPending}>
              Este e os próximos
            </Button>
            <Button variante="perigo-solido" tamanho="p" onClick={() => handleExcluir(m.id)} carregando={isPending}>
              Só este
            </Button>
          </>
        ) : (
          <Button variante="perigo-solido" tamanho="p" onClick={() => handleExcluir(m.id)} carregando={isPending}>
            Excluir conta
          </Button>
        )}
      </div>
    )
  }

  function seloSituacao(m: ContaLinha) {
    return situacaoPagamento(m, hoje) === 'vencido'
      ? <Badge tom="dng" className="flex-none">Vencido</Badge>
      : <Badge tom="warn" className="flex-none">A pagar</Badge>
  }

  function botaoPagar(m: ContaLinha) {
    return (
      <Button
        variante="primario"
        tamanho="p"
        onClick={() => handlePagar(m)}
        disabled={isPending}
        aria-label={`Pagar ${m.tipo_nome}, vencimento ${formatarDdMm(m.data).slice(0, 5)}`}
        className="flex-none"
      >
        Pagar
      </Button>
    )
  }

  const erroExclusao = erroExcluir && (
    <p role="alert" className="mt-2 text-[13px] text-danger">Não foi possível excluir: {erroExcluir}</p>
  )

  return (
    <Pagina className="pb-24 sm:pb-24 lg:pb-7">
      <CabecalhoPagina
        titulo="Contas a pagar"
        subtitulo={<>
          <span className="first-letter:uppercase inline-block">{periodo}</span> · {plural(n)} · total <b className="font-semibold text-fg tabular-nums">{formatarValor(total)}</b>
          {vencido > 0 && <> · vencido <b className="font-semibold text-fg tabular-nums">{formatarValor(vencido)}</b></>}
        </>}
        acoes={podeCriar ? botaoNovaConta('hidden lg:inline-flex') : undefined}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full min-w-0 items-end gap-2 sm:w-[360px]">
          <Field rotulo="Buscar" className="min-w-0 flex-1">
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
          {/* No celular a ordenação fica atrás do botão "Filtros", destacado quando mudou. */}
          <IconButton
            borda
            rotulo={filtrosAbertos ? 'Esconder filtros' : 'Mostrar filtros'}
            aria-expanded={filtrosAbertos}
            icone={<SlidersHorizontal size={18} aria-hidden="true" />}
            onClick={() => setFiltrosAbertos(a => !a)}
            className={cn('h-11 w-11 sm:hidden', ordenacao !== 'data_asc' && 'border-acc text-acc-text')}
          />
        </div>
        <Field rotulo="Ordenar por" className={cn('w-full sm:flex sm:w-[230px]', !filtrosAbertos && 'max-sm:hidden')}>
          {c => (
            <Select id={c.id} value={ordenacao} onChange={e => { setOrdenacao(e.target.value as Ordenacao); setPagina(1); setExcluindoId(null) }}>
              {OPCOES_ORDENACAO.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          )}
        </Field>
      </div>

      {criada && (
        <div role="status">
          <Aviso tom="ok">
            <b>Conta criada: {criada.nome}.</b> {criada.quantidade === 1 ? 'Foi gerada 1 conta a pagar' : `Foram geradas ${criada.quantidade} contas a pagar`}; cada uma aparece no mês do seu vencimento. Para mudar valor, dia ou prazo depois, use Configurações &gt; Financeiro &gt; Tipos de saída.
          </Aviso>
        </div>
      )}
      {erroPagar && <div role="alert"><Aviso tom="dng">Não foi possível salvar o pagamento: {erroPagar}</Aviso></div>}
      {desfazer && (
        <div role="status">
          <Aviso tom="ok">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <b>Pago: {desfazer.tipo}, vencimento {desfazer.vencimento}. Foi para Pagamentos.</b>
              <Button variante="fantasma" tamanho="p" icone={<Undo2 size={14} aria-hidden="true" />} onClick={() => handleDesfazer(desfazer.id)} disabled={isPending}>
                Desfazer
              </Button>
            </div>
          </Aviso>
        </div>
      )}

      {n === 0 ? (
        <Card>
          {contas.length === 0 ? (
            <EmptyState
              icone={<CalendarClock size={24} />}
              titulo="Nenhuma conta a pagar"
              descricao={podeCriar
                ? `Nada vence em ${periodo} e não há contas vencidas. Crie uma conta recorrente ou de prazo determinado em "Nova conta".`
                : `Nada vence em ${periodo} e não há contas vencidas. Quem cria as contas é um administrador.`}
              acao={podeCriar ? botaoNovaConta() : undefined}
            />
          ) : (
            <EmptyState
              icone={<Search size={24} />}
              titulo="Nenhuma conta com essa busca"
              descricao="Mude a busca para ver outras contas."
              acao={<Button icone={<X size={16} aria-hidden="true" />} onClick={() => { setBusca(''); setPagina(1); setExcluindoId(null) }}>Limpar busca</Button>}
            />
          )}
        </Card>
      ) : (
        <>
          {/* Celular (mob-06): total e um cartão por conta, com o botão Pagar */}
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
              <div key={m.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-line-soft bg-surface px-4 py-3.5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-fg" title={m.tipo_nome}>{m.tipo_nome}</p>
                    <p className="flex min-w-0 items-center gap-2 text-[13px] text-fg-3">
                      {seloSituacao(m)}
                      <span className="truncate">{formatarDdMm(m.data)}{m.observacao ? ` · ${m.observacao}` : ''}</span>
                    </p>
                  </div>
                  <b className="flex-none font-mono text-sm font-semibold tabular-nums text-fg">{formatarValor(m.valor)}</b>
                  <div className={`-mr-2 -mt-1.5 flex-none ${MENU_36}`}>
                    <MenuMaisAcoes rotulo="Editar ou excluir" itens={itensMenu(m)} />
                  </div>
                </div>
                <div className="flex justify-end">{botaoPagar(m)}</div>
              </div>
            ))}
            {(totalPaginas > 1) && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-fg-3">
                <span>{textoMostrando}</span>
                {paginacao}
              </div>
            )}
          </div>

          {/* Tela larga: tabela */}
          <Card semPadding className="hidden overflow-hidden lg:block">
            <div className="relative overflow-x-auto xl:overflow-visible">
              <Tabela className="min-w-[1040px]">
                <thead>
                  <tr>
                    <Th largura={140}>Vencimento</Th>
                    <Th largura={200}>Tipo</Th>
                    <Th largura={200}>Centro de custo</Th>
                    <Th>Observação</Th>
                    <Th largura={150} alinhar="dir">Valor</Th>
                    <Th largura={110}>Situação</Th>
                    <Th largura={150}><span className="sr-only">Ações</span></Th>
                  </tr>
                </thead>
                <tbody className="[&>tr:last-child>td]:border-b-0">
                  {visiveis.map(m => excluindoId === m.id ? (
                    <tr key={m.id}>
                      <Td colSpan={7} className="bg-danger-soft">
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
                      <Td>
                        <span className="block truncate font-semibold text-fg" title={m.tipo_nome}>{m.tipo_nome}</span>
                      </Td>
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
                      <Td>{seloSituacao(m)}</Td>
                      <Td alinhar="dir" className="py-2">
                        <div className="flex items-center justify-end gap-2">
                          {botaoPagar(m)}
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
                    <td colSpan={2} className="border-t border-line-soft" />
                  </tr>
                </tfoot>
              </Tabela>
            </div>
          </Card>
        </>
      )}

      {/* Celular: botão flutuante, como em Pagamentos. */}
      {podeCriar && botaoNovaConta('fixed right-4 bottom-[84px] md:bottom-6 z-30 h-[52px] rounded-[26px] px-5 shadow-lg lg:hidden')}

      {criando && <NovaContaModal onClose={() => setCriando(false)} onCriada={handleCriada} />}

      {editando && (
        <NovoMovimentoModal
          natureza="saida"
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
            conta: true,
          }}
        />
      )}
    </Pagina>
  )
}
