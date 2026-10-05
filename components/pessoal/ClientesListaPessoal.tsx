'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronRight, Check, Clock, Plus, Search, SlidersHorizontal, StickyNote, Users, X } from 'lucide-react'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComPessoal } from '@/lib/clientes-pessoal'
import type { PendenciaVinculo } from '@/lib/vinculos'
import { formatarBadgeVinculo } from '@/lib/vinculos'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import EmpresaPessoalModal from './EmpresaPessoalModal'
import { labelRegime } from '@/lib/atividades-regimes'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Button, IconButton } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { BarraProgresso } from '@/components/ui/BarraProgresso'
import { cn } from '@/components/ui/cn'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Select, Switch } from '@/components/ui/Input'
import { MonthPill } from '@/components/ui/MonthPill'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { Tabela, Th, Td } from '@/components/ui/Tabela'

interface Props {
  clientes: ClienteComPessoal[]
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function ClientesListaPessoal({ clientes, progressoMap, mes, ano, tarefasPadrao, catalogo, pendenciasVinculo }: Props) {
  const [busca, setBusca] = useFiltroPersistente('clientes-pessoal:busca', '')
  const [filtroResponsavel, setFiltroResponsavel] = useFiltroPersistente('clientes-pessoal:responsavel', 'TODOS')
  const [filtroRegime, setFiltroRegime] = useFiltroPersistente('clientes-pessoal:regime', 'TODOS')
  const [filtroPrioridade, setFiltroPrioridade] = useFiltroPersistente('clientes-pessoal:prioridade', 'TODOS')
  const [mostrarDesabilitados, setMostrarDesabilitados] = useFiltroPersistente('clientes-pessoal:mostrarDesabilitados', false)
  const [modalNovoOpen, setModalNovoOpen] = useState(false)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  const responsaveis = useMemo(() => ['TODOS', ...Array.from(new Set(
    clientes.map(c => c.responsavel ?? '').filter(Boolean)
  )).sort()], [clientes])

  const prioridades = useMemo(() => Array.from(new Set(
    clientes.map(c => c.prioridade).filter((p): p is number => !!p && p > 0)
  )).sort((a, b) => a - b), [clientes])

  const filtrados = useMemo(() => clientes.filter(c => {
    if (busca) {
      const q = busca.toLowerCase()
      if (!c.nome.toLowerCase().includes(q) && !(c.cnpj ?? '').includes(q)) return false
    }
    if (filtroResponsavel !== 'TODOS' && c.responsavel !== filtroResponsavel) return false
    if (filtroRegime !== 'TODOS' && c.regime !== filtroRegime) return false
    if (filtroPrioridade !== 'TODOS' && String(c.prioridade ?? '') !== filtroPrioridade) return false
    if (!mostrarDesabilitados && c.ativo === false) return false
    return true
  }), [clientes, busca, filtroResponsavel, filtroRegime, filtroPrioridade, mostrarDesabilitados])

  // No celular os filtros ficam recolhidos atrás do botão "Filtros", que fica
  // destacado quando algum deles está em uso.
  const filtrosAtivos = [filtroResponsavel !== 'TODOS', filtroRegime !== 'TODOS', filtroPrioridade !== 'TODOS', mostrarDesabilitados].filter(Boolean).length
  const temFiltro = busca.trim() !== '' || filtrosAtivos > 0

  function limparFiltros() {
    setBusca('')
    setFiltroResponsavel('TODOS')
    setFiltroRegime('TODOS')
    setFiltroPrioridade('TODOS')
    setMostrarDesabilitados(false)
  }

  const vazio = clientes.length === 0 ? (
    <EmptyState icone={<Users size={24} />} titulo="Nenhum cliente cadastrado" descricao="Os clientes do Pessoal aparecem aqui assim que forem cadastrados." />
  ) : temFiltro ? (
    <EmptyState
      icone={<Users size={24} />}
      titulo="Nenhum cliente com esses filtros"
      descricao={`Há ${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'} no Pessoal, mas nenhum com a busca e os filtros escolhidos.`}
      acao={<Button icone={<X size={16} aria-hidden="true" />} onClick={limparFiltros}>Limpar filtros</Button>}
    />
  ) : (
    <EmptyState icone={<Users size={24} />} titulo="Nenhum cliente ativo" descricao="Todos os clientes do Pessoal estão desabilitados. Ligue “Mostrar desabilitados” nos filtros para vê-los." />
  )

  const subtitulo = `${filtrados.length} ${filtrados.length === 1 ? 'cliente ativo' : 'clientes'} no Pessoal · ${MESES[mes - 1]}/${ano}`

  return (
    <Pagina>
      <CabecalhoPagina
        titulo="Clientes"
        subtitulo={subtitulo}
        acoes={<Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => setModalNovoOpen(true)}>Novo cliente</Button>}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-full min-w-0 items-end gap-2 sm:w-[300px]">
          <Field rotulo="Buscar" className="min-w-0 flex-1">
            {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Cliente ou CNPJ" value={busca} onChange={e => setBusca(e.target.value)} />}
          </Field>
          <IconButton
            borda
            rotulo={filtrosAbertos ? 'Esconder filtros' : 'Mostrar filtros'}
            aria-expanded={filtrosAbertos}
            aria-controls="filtros-clientes-pessoal"
            icone={<SlidersHorizontal size={18} aria-hidden="true" />}
            onClick={() => setFiltrosAbertos(a => !a)}
            className={cn('h-11 w-11 sm:hidden', filtrosAtivos > 0 && 'border-acc text-acc-text')}
          />
        </div>
        <div id="filtros-clientes-pessoal" className={cn('w-full flex-col gap-3 sm:contents', filtrosAbertos ? 'flex' : 'hidden')}>
          <Field rotulo="Responsável" className="w-full sm:w-[190px]">
            {c => (
              <Select id={c.id} value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value)}>
                {responsaveis.map(r => <option key={r} value={r}>{r === 'TODOS' ? 'Todos' : r}</option>)}
              </Select>
            )}
          </Field>
          <Field rotulo="Regime" className="w-full sm:w-[190px]">
            {c => (
              <Select id={c.id} value={filtroRegime} onChange={e => setFiltroRegime(e.target.value)}>
                <option value="TODOS">Todos</option>
                {catalogo.regimes.map(r => <option key={r} value={r}>{labelRegime(r)}</option>)}
              </Select>
            )}
          </Field>
          <Field rotulo="Prioridade" className="w-full sm:w-[160px]">
            {c => (
              <Select id={c.id} value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}>
                <option value="TODOS">Todas</option>
                {prioridades.map(p => <option key={p} value={p}>{`P${p}`}</option>)}
              </Select>
            )}
          </Field>
        </div>
      </div>

      <div className={cn('flex-wrap items-center gap-x-6 gap-y-3 sm:flex', filtrosAbertos ? 'flex' : 'hidden')}>
        <Switch ligado={mostrarDesabilitados} onMudar={setMostrarDesabilitados} rotulo="Mostrar desabilitados" />
      </div>

      {modalNovoOpen && (
        <EmpresaPessoalModal
          clienteId={null}
          responsaveis={responsaveis.slice(1)}
          tarefasPadrao={tarefasPadrao}
          catalogo={catalogo}
          onClose={() => setModalNovoOpen(false)}
        />
      )}

      {filtrados.length === 0 ? (
        <Card>{vazio}</Card>
      ) : (
        <>
          {/* Celular (nav-03): um cartão por cliente; o toque leva à ficha. */}
          <ul className="flex flex-col gap-2.5 sm:hidden">
            {filtrados.map(cliente => {
              const prog = progressoMap[cliente.id]
              const vinculos = pendenciasVinculo[cliente.id] ?? []
              const temObs = !!(cliente.obs?.trim())
              const temP = (cliente.prioridade ?? 0) > 0
              const temSelos = vinculos.length > 0 || temObs || temP || cliente.ativo === false
              return (
                <li key={cliente.id}>
                  <Link
                    href={`/pessoal/clientes/${cliente.id}`}
                    className="flex flex-col gap-2.5 rounded-xl border border-line-soft bg-surface px-4 py-3.5 transition-colors active:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="min-w-0 flex-1"><NomeCliente nome={cliente.nome} cnpj={cliente.cnpj} /></div>
                      <ChevronRight size={18} aria-hidden="true" className="mt-0.5 flex-none text-fg-3" />
                    </div>
                    {temSelos && (
                      <div className="flex flex-wrap gap-1.5">
                        {temP && <Badge tom="dng">P{cliente.prioridade}</Badge>}
                        {vinculos.map((p, i) => (
                          <Badge
                            key={i}
                            tom={p.liberada ? 'ok' : 'warn'}
                            icone={p.liberada ? <Check size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
                          >
                            {formatarBadgeVinculo(p).texto}
                          </Badge>
                        ))}
                        {temObs && <Badge tom="warn" icone={<StickyNote size={14} aria-hidden="true" />}>Observação</Badge>}
                        {cliente.ativo === false && <Badge>Desabilitado</Badge>}
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      {cliente.responsavel ? (
                        <span className="inline-flex min-w-0 max-w-[50%] items-center gap-2">
                          <Avatar nome={cliente.responsavel} />
                          <span className="truncate text-[13px] text-fg-2">{cliente.responsavel}</span>
                        </span>
                      ) : <span className="text-[13px] text-fg-3">Sem responsável</span>}
                      <div className="flex min-w-0 flex-1 justify-end">
                        <BarraProgresso feitas={prog?.concluidas ?? 0} total={prog?.total ?? 0} className="w-full" />
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>

          <Card semPadding className="hidden overflow-hidden sm:block">
          <div className="relative overflow-x-auto xl:overflow-visible">
            <Tabela className="min-w-[560px]">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th largura={190}>Responsável</Th>
                  <Th largura={170}>Progresso do mês</Th>
                  <Th largura={56}><span className="sr-only">Abrir</span></Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(cliente => {
                  const prog = progressoMap[cliente.id]
                  const total = prog?.total ?? 0
                  const concluidas = prog?.concluidas ?? 0
                  const pct = total > 0 ? Math.round((concluidas / total) * 100) : null
                  const temObs = !!(cliente.obs?.trim())
                  const vinculos = pendenciasVinculo[cliente.id] ?? []
                  const href = `/pessoal/clientes/${cliente.id}`
                  return (
                    <tr key={cliente.id} className="transition-colors hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)]">
                      <Td>
                        <Link href={href} className="block w-full min-w-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <NomeCliente
                            nome={cliente.nome}
                            cnpj={cliente.cnpj}
                            depoisDoNome={
                              <>
                                {(cliente.prioridade ?? 0) > 0 && <Badge tom="dng">P{cliente.prioridade}</Badge>}
                                {temObs && <Badge tom="warn" icone={<StickyNote size={14} aria-hidden="true" />}>Observação</Badge>}
                                {cliente.ativo === false && <Badge>Desabilitado</Badge>}
                              </>
                            }
                            abaixo={vinculos.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {vinculos.map((p, i) => (
                                  <Badge
                                    key={i}
                                    tom={p.liberada ? 'ok' : 'warn'}
                                    icone={p.liberada ? <Check size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
                                  >
                                    {formatarBadgeVinculo(p).texto}
                                  </Badge>
                                ))}
                              </div>
                            ) : undefined}
                          />
                        </Link>
                      </Td>
                      <Td className="text-fg-2">{cliente.responsavel ? <span className="block truncate" title={cliente.responsavel}>{cliente.responsavel}</span> : <span className="text-fg-3">—</span>}</Td>
                      <Td>
                        {total > 0 ? (
                          <div className="flex items-center gap-2">
                            <MonthPill percentual={pct} />
                            <span className="text-[13px] text-fg-3">{concluidas}/{total}</span>
                          </div>
                        ) : <span className="text-fg-3">—</span>}
                      </Td>
                      <Td alinhar="dir">
                        <Link href={href} aria-label={`Abrir ${cliente.nome}`} className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-fg-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <ChevronRight size={18} aria-hidden="true" />
                        </Link>
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
    </Pagina>
  )
}
