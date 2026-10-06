'use client'

import { useState, useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Eye, Pencil, Plus, Printer, Search, SlidersHorizontal, Users, X } from 'lucide-react'
import { SETOR_LABEL, type Cliente, type TarefaVinculo } from '@/lib/types'
import ClienteGeralModal from './ClienteGeralModal'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import { empresaDesabilitada, empresaTemSetorDesabilitavel } from '@/lib/cliente-ativo'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Chip } from '@/components/ui/Chip'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import { cn } from '@/components/ui/cn'
import {
  SETORES_DE_CLIENTE, TODOS, filtrarClientesGeral, proximaOrdenacao, ariaSort, setoresDoCliente,
  type Ordenacao, type CampoOrdem,
} from '@/lib/clientes-geral'

type ClienteComDadosFiscais = Cliente & {
  clientes_fiscal: { regime: string | null; atividade: string[]; ativo: boolean } | null
  clientes_contabil: { ativo: boolean } | null
  clientes_pessoal: { ativo: boolean } | null
}

interface Props {
  clientes: ClienteComDadosFiscais[]
  isAdmin: boolean
  podeCriar: boolean
  podeDesabilitar: boolean
  vinculosCatalogo: TarefaVinculo[]
  catalogoFiscal: CatalogoCliente
}

export default function ClientesGeralLista({ clientes, isAdmin, podeCriar, podeDesabilitar, vinculosCatalogo, catalogoFiscal }: Props) {
  const [busca, setBusca] = useState('')
  const [modalNovoOpen, setModalNovoOpen] = useState(false)
  const [clienteAbertoId, setClienteAbertoId] = useState<string | null>(null)
  const clienteAberto = clientes.find(c => c.id === clienteAbertoId)
  // Chave nova ('regimes'): a antiga guardava um regime só, em texto.
  const [filtroRegime, setFiltroRegime] = useFiltroPersistente<string[]>('clientesGeral:regimes', [])
  const [filtroSetor, setFiltroSetor] = useFiltroPersistente('clientesGeral:setor', TODOS)
  const [filtroAtividade, setFiltroAtividade] = useFiltroPersistente<string[]>('clientesGeral:atividade', [])
  const [ordenacao, setOrdenacao] = useState<Ordenacao>(null)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  function toggleRegime(nome: string) {
    setFiltroRegime(
      filtroRegime.includes(nome) ? filtroRegime.filter(r => r !== nome) : [...filtroRegime, nome]
    )
  }

  function toggleAtividade(nome: string) {
    setFiltroAtividade(
      filtroAtividade.includes(nome) ? filtroAtividade.filter(a => a !== nome) : [...filtroAtividade, nome]
    )
  }

  const filtrados = useMemo(
    () => filtrarClientesGeral(clientes, { busca, regimes: filtroRegime, setor: filtroSetor, atividades: filtroAtividade }, ordenacao),
    [clientes, busca, filtroRegime, filtroSetor, filtroAtividade, ordenacao],
  )

  const total = clientes.length

  // No celular os filtros ficam recolhidos atrás do botão "Filtros", que fica
  // destacado quando algum deles está em uso.
  const filtrosAtivos = [filtroRegime.length > 0, filtroSetor !== TODOS, filtroAtividade.length > 0].filter(Boolean).length

  function limparFiltros() {
    setBusca('')
    setFiltroRegime([])
    setFiltroSetor(TODOS)
    setFiltroAtividade([])
  }

  const vazio = total === 0 ? (
    <EmptyState
      icone={<Users size={24} />}
      titulo="Nenhum cliente cadastrado"
      descricao="Os clientes de todos os setores aparecem aqui assim que forem cadastrados."
      acao={podeCriar ? <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => setModalNovoOpen(true)}>Novo cliente</Button> : undefined}
    />
  ) : (
    <EmptyState
      icone={<Users size={24} />}
      titulo="Nenhum cliente com esses filtros"
      descricao={`Há ${total} ${total === 1 ? 'cliente cadastrado' : 'clientes cadastrados'}, mas nenhum com a busca e os filtros escolhidos.`}
      acao={<Button icone={<X size={16} aria-hidden="true" />} onClick={limparFiltros}>Limpar filtros</Button>}
    />
  )
  const subtitulo = filtrados.length === total
    ? `${total} ${total === 1 ? 'cliente' : 'clientes'} · todos os setores`
    : `${filtrados.length} de ${total} clientes · todos os setores`

  const thOrdenavel = (campo: CampoOrdem, rotulo: string, largura?: number) => (
    <Th largura={largura} aria-sort={ariaSort(ordenacao, campo)}>
      <button
        type="button"
        onClick={() => setOrdenacao(o => proximaOrdenacao(o, campo))}
        className="inline-flex items-center gap-1.5 rounded uppercase hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        {rotulo}
        {ordenacao?.campo !== campo
          ? <ArrowUpDown size={14} aria-hidden="true" />
          : ordenacao.direcao === 'asc'
            ? <ArrowUp size={14} aria-hidden="true" className="text-acc-text" />
            : <ArrowDown size={14} aria-hidden="true" className="text-acc-text" />}
      </button>
    </Th>
  )

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Cadastro de clientes"
        subtitulo={subtitulo}
        acoes={
          <>
            <Button icone={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>Imprimir</Button>
            {podeCriar && <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => setModalNovoOpen(true)}>Novo cliente</Button>}
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="flex w-full min-w-0 items-end gap-2 sm:w-[300px]">
          <Field rotulo="Buscar" className="min-w-0 flex-1">
            {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Nome ou CNPJ" value={busca} onChange={e => setBusca(e.target.value)} />}
          </Field>
          <IconButton
            borda
            rotulo={filtrosAbertos ? 'Esconder filtros' : 'Mostrar filtros'}
            aria-expanded={filtrosAbertos}
            aria-controls="filtros-clientes-geral"
            icone={<SlidersHorizontal size={18} aria-hidden="true" />}
            onClick={() => setFiltrosAbertos(a => !a)}
            className={cn('h-11 w-11 sm:hidden', filtrosAtivos > 0 && 'border-acc text-acc-text')}
          />
        </div>
        <div id="filtros-clientes-geral" className={cn('w-full flex-col gap-3 sm:contents', filtrosAbertos ? 'flex' : 'hidden')}>
        <Field rotulo="Setor" className="w-full sm:w-[170px]">
          {c => (
            <Select id={c.id} value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}>
              <option value={TODOS}>Todos</option>
              {SETORES_DE_CLIENTE.map(s => <option key={s} value={s}>{SETOR_LABEL[s]}</option>)}
            </Select>
          )}
        </Field>
        {catalogoFiscal.regimes.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id="rotulo-filtro-regime" className="text-[13px] font-medium text-fg-2">Regime</span>
            <div role="group" aria-labelledby="rotulo-filtro-regime" className="flex flex-wrap gap-2">
              {catalogoFiscal.regimes.map(nome => (
                <Chip key={nome} ativo={filtroRegime.includes(nome)} onClick={() => toggleRegime(nome)}>{nome}</Chip>
              ))}
            </div>
          </div>
        )}
        {catalogoFiscal.atividades.length > 0 && (
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id="rotulo-filtro-atividade" className="text-[13px] font-medium text-fg-2">Atividade</span>
            <div role="group" aria-labelledby="rotulo-filtro-atividade" className="flex flex-wrap gap-2">
              {catalogoFiscal.atividades.map(nome => (
                <Chip key={nome} ativo={filtroAtividade.includes(nome)} onClick={() => toggleAtividade(nome)}>{nome}</Chip>
              ))}
            </div>
          </div>
        )}
        </div>
      </div>

      {filtrados.length === 0 ? (
        <Card>{vazio}</Card>
      ) : (
        <>
          {/* Celular (nav-03): um cartão por cliente; o toque abre o cadastro. A impressão continua usando a tabela. */}
          <ul className="flex flex-col gap-2.5 sm:hidden print:hidden">
            {filtrados.map(c => {
              const desabilitado = empresaDesabilitada([c.clientes_fiscal, c.clientes_contabil, c.clientes_pessoal])
              const regime = c.clientes_fiscal?.regime
              const setores = setoresDoCliente(c.setores)
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setClienteAbertoId(c.id)}
                    aria-label={`${isAdmin ? 'Editar' : 'Ver'} ${c.nome}`}
                    className="flex w-full flex-col gap-2.5 rounded-xl border border-line-soft bg-surface px-4 py-3.5 text-left transition-colors active:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <div className="flex w-full items-start gap-2.5">
                      <div className="min-w-0 flex-1"><NomeCliente nome={c.nome} cnpj={c.cnpj} /></div>
                      <ChevronRight size={18} aria-hidden="true" className="mt-0.5 flex-none text-fg-3" />
                    </div>
                    {(regime || desabilitado || setores.length > 0) && (
                      <div className="flex flex-wrap gap-1.5">
                        {regime && <Badge tom="acc">{regime.split('/')[0].trim()}</Badge>}
                        {setores.map(s => <Badge key={s}>{SETOR_LABEL[s]}</Badge>)}
                        {desabilitado && <Badge tom="warn">Desabilitado</Badge>}
                      </div>
                    )}
                    {c.contato_chat?.trim() && <span className="block w-full truncate text-[13px] text-fg-2">{c.contato_chat}</span>}
                  </button>
                </li>
              )
            })}
          </ul>

          <Card semPadding className="hidden overflow-hidden sm:block print:block">
          <div className="relative overflow-x-auto xl:overflow-visible">
            <Tabela className="min-w-[940px]">
              <thead>
                <tr>
                  {thOrdenavel('nome', 'Razão social')}
                  {thOrdenavel('regime', 'Regime', 170)}
                  <Th largura={150}>Atividade</Th>
                  <Th largura={180}>Contato</Th>
                  <Th>Setores</Th>
                  <Th largura={160} className="hidden print:table-cell">Município</Th>
                  <Th largura={56} className="print:hidden"><span className="sr-only">Ações</span></Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => {
                  const desabilitado = empresaDesabilitada([c.clientes_fiscal, c.clientes_contabil, c.clientes_pessoal])
                  const regime = c.clientes_fiscal?.regime
                  const atividades = c.clientes_fiscal?.atividade ?? []
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                      <Td>
                        <button type="button" onClick={() => setClienteAbertoId(c.id)} className="block w-full min-w-0 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <NomeCliente nome={c.nome} cnpj={c.cnpj} depoisDoNome={desabilitado ? <Badge tom="warn">Desabilitado</Badge> : undefined} />
                        </button>
                      </Td>
                      <Td>
                        {regime
                          ? <Badge tom="acc" className="max-w-full overflow-hidden"><span className="truncate" title={regime}>{regime.split('/')[0].trim()}</span></Badge>
                          : <span className="text-fg-3">—</span>}
                      </Td>
                      <Td className="text-fg-2">{atividades.length > 0 ? atividades.join(', ') : <span className="text-fg-3">—</span>}</Td>
                      <Td className="text-fg-2">{c.contato_chat?.trim() ? <span className="block truncate" title={c.contato_chat}>{c.contato_chat}</span> : <span className="text-fg-3">—</span>}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-1.5">
                          {setoresDoCliente(c.setores).map(s => <Badge key={s}>{SETOR_LABEL[s]}</Badge>)}
                        </div>
                      </Td>
                      <Td className="hidden text-fg-2 print:table-cell">{[c.municipio, c.uf].filter(Boolean).join('/') || '—'}</Td>
                      <Td alinhar="dir" className="print:hidden">
                        <IconButton
                          rotulo={`${isAdmin ? 'Editar' : 'Ver'} ${c.nome}`}
                          icone={isAdmin ? <Pencil size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                          onClick={() => setClienteAbertoId(c.id)}
                        />
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </Tabela>
          </div>
          </Card>
        </>
      )}

      {modalNovoOpen && (
        <ClienteGeralModal
          clienteId={null}
          vinculosCatalogo={vinculosCatalogo}
          onClose={() => setModalNovoOpen(false)}
        />
      )}

      {clienteAbertoId && (
        <ClienteGeralModal
          clienteId={clienteAbertoId}
          vinculosCatalogo={vinculosCatalogo}
          readOnly={!isAdmin}
          podeDesabilitar={podeDesabilitar}
          desabilitada={empresaDesabilitada([clienteAberto?.clientes_fiscal, clienteAberto?.clientes_contabil, clienteAberto?.clientes_pessoal])}
          temSetorDesabilitavel={empresaTemSetorDesabilitavel([clienteAberto?.clientes_fiscal, clienteAberto?.clientes_contabil, clienteAberto?.clientes_pessoal])}
          onClose={() => setClienteAbertoId(null)}
        />
      )}
    </Pagina>
  )
}
