'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Check, Clock, Plus, Search, SlidersHorizontal, StickyNote, Users, X } from 'lucide-react'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComContabil } from '@/lib/clientes-contabil'
import type { PendenciaVinculo } from '@/lib/vinculos'
import { formatarBadgeVinculo } from '@/lib/vinculos'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import EmpresaContabilModal from './EmpresaContabilModal'
import { labelRegime } from '@/lib/atividades-regimes'
import { Pagina, CabecalhoPagina } from '@/components/ui/Pagina'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Field } from '@/components/ui/Field'
import { Input, Select, Switch } from '@/components/ui/Input'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { COR, MonthPill, tomDoPercentual, normalizarPercentual } from '@/components/ui/MonthPill'
import { cn } from '@/components/ui/cn'

interface Props {
  clientes: ClienteComContabil[]
  progressoAnualMap: Record<string, { totalPorMes: Record<number, number>; concluidasPorMes: Record<number, number> }>
  mes: number
  ano: number
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
  coresResponsavel: Record<string, string>
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

// Responsável com a bolinha da inicial na cor do perfil (mesmo desenho da
// ficha do Fiscal); sem cor cadastrada, usa a cor de destaque.
function Responsavel({ nome, cores }: { nome: string; cores: Record<string, string> }) {
  const cor = cores[nome.toUpperCase()] || 'var(--acc)'
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-xs font-bold text-acc-ink" style={{ backgroundColor: cor }}>
        {nome.charAt(0).toUpperCase()}
      </span>
      <span className="truncate text-[13px] text-fg-2" title={nome}>{nome}</span>
    </span>
  )
}

export default function ClientesListaContabil({ clientes, progressoAnualMap, mes, ano, tarefasPadrao, catalogo, pendenciasVinculo, coresResponsavel }: Props) {
  const [busca, setBusca] = useFiltroPersistente('clientes-contabil:busca', '')
  const [filtroResponsavel, setFiltroResponsavel] = useFiltroPersistente('clientes-contabil:responsavel', 'TODOS')
  const [filtroRegime, setFiltroRegime] = useFiltroPersistente('clientes-contabil:regime', 'TODOS')
  const [filtroPrioridade, setFiltroPrioridade] = useFiltroPersistente('clientes-contabil:prioridade', 'TODOS')
  const [mostrarDesabilitados, setMostrarDesabilitados] = useFiltroPersistente('clientes-contabil:mostrarDesabilitados', false)
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

  // No celular os filtros ficam recolhidos; o botão fica destacado quando
  // algum deles está em uso, para ninguém achar que a lista está incompleta.
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
    <EmptyState icone={<Users size={24} />} titulo="Nenhum cliente cadastrado" descricao="Os clientes do Contábil aparecem aqui assim que forem cadastrados." />
  ) : temFiltro ? (
    <EmptyState
      icone={<Users size={24} />}
      titulo="Nenhum cliente com esses filtros"
      descricao={`Há ${clientes.length} ${clientes.length === 1 ? 'cliente' : 'clientes'} no Contábil, mas nenhum com a busca e os filtros escolhidos.`}
      acao={<Button icone={<X size={16} aria-hidden="true" />} onClick={limparFiltros}>Limpar filtros</Button>}
    />
  ) : (
    <EmptyState icone={<Users size={24} />} titulo="Nenhum cliente ativo" descricao="Todos os clientes do Contábil estão desabilitados. Ligue “Mostrar desabilitados” nos filtros para vê-los." />
  )

  const subtitulo = (
    <>
      {filtrados.length} {filtrados.length === 1 ? 'cliente' : 'clientes'} · {ano} ·{' '}
      <span className="hidden sm:inline">clique em um mês para abrir a ficha naquele mês</span>
      <span className="sm:hidden">deslize os meses para o lado</span>
    </>
  )

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
            {c => <Input id={c.id} type="search" iconeEsquerda={<Search size={16} />} placeholder="Nome ou CNPJ" value={busca} onChange={e => setBusca(e.target.value)} className="h-11 sm:h-9" />}
          </Field>
          <IconButton
            borda
            rotulo={filtrosAbertos ? 'Esconder filtros' : 'Mostrar filtros'}
            aria-expanded={filtrosAbertos}
            aria-controls="filtros-clientes-contabil"
            icone={<SlidersHorizontal size={18} aria-hidden="true" />}
            onClick={() => setFiltrosAbertos(a => !a)}
            className={cn('h-11 w-11 sm:hidden', filtrosAtivos > 0 && 'border-acc text-acc-text')}
          />
        </div>
        <div id="filtros-clientes-contabil" className={cn('w-full flex-wrap items-end gap-3 sm:flex sm:w-auto', filtrosAbertos ? 'flex' : 'hidden')}>
          <Field rotulo="Responsável" className="w-full sm:w-[170px]">
            {c => (
              <Select id={c.id} value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value)}>
                {responsaveis.map(r => <option key={r} value={r}>{r === 'TODOS' ? 'Todos' : r}</option>)}
              </Select>
            )}
          </Field>
          <Field rotulo="Regime" className="w-full sm:w-[180px]">
            {c => (
              <Select id={c.id} value={filtroRegime} onChange={e => setFiltroRegime(e.target.value)}>
                <option value="TODOS">Todos</option>
                {catalogo.regimes.map(r => <option key={r} value={r}>{labelRegime(r)}</option>)}
              </Select>
            )}
          </Field>
          <Field rotulo="Prioridade" className="w-full sm:w-[140px]">
            {c => (
              <Select id={c.id} value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)}>
                <option value="TODOS">Todas</option>
                {prioridades.map(p => <option key={p} value={p}>{`P${p}`}</option>)}
              </Select>
            )}
          </Field>
          <div className="flex min-h-11 items-center sm:min-h-9">
            <Switch ligado={mostrarDesabilitados} onMudar={setMostrarDesabilitados} rotulo="Mostrar desabilitados" />
          </div>
        </div>
      </div>

      {modalNovoOpen && (
        <EmpresaContabilModal
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
        <Card semPadding className="overflow-hidden">
          {filtrados.map(cliente => {
            const prog = progressoAnualMap[cliente.id]
            const temObs = !!(cliente.obs?.trim())
            const vinculos = pendenciasVinculo[cliente.id] ?? []
            const temP1 = !!cliente.prioridade && cliente.prioridade > 0

            return (
              <div key={cliente.id} className="border-t border-line-soft px-3.5 py-3.5 transition-colors first:border-t-0 hover:bg-[color-mix(in_srgb,var(--fg)_3%,transparent)] sm:px-[18px] sm:py-4">
                <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
                  <Link href={`/contabil/clientes/${cliente.id}`} className="min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                    <NomeCliente
                      nome={cliente.nome}
                      cnpj={cliente.cnpj ?? null}
                      depoisDoNome={
                        <>
                          {temP1 && <Badge tom="dng">P{cliente.prioridade}</Badge>}
                          {temObs && <Badge tom="warn" icone={<StickyNote size={14} aria-hidden="true" />}>Observação</Badge>}
                          {cliente.ativo === false && <Badge>Desabilitado</Badge>}
                        </>
                      }
                    />
                  </Link>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-none sm:justify-end">
                    {vinculos.map((p, i) => {
                      const badge = formatarBadgeVinculo(p)
                      return (
                        <Badge
                          key={i}
                          tom={p.liberada ? 'ok' : 'warn'}
                          icone={p.liberada ? <Check size={14} aria-hidden="true" /> : <Clock size={14} aria-hidden="true" />}
                        >
                          {badge.texto}
                        </Badge>
                      )
                    })}
                    {cliente.regime
                      ? <Badge tom="acc">{labelRegime(cliente.regime)}</Badge>
                      : <span className="text-[13px] text-fg-3">Sem regime</span>}
                    {cliente.responsavel
                      ? <Responsavel nome={cliente.responsavel} cores={coresResponsavel} />
                      : <span className="text-[13px] text-fg-3">Sem responsável</span>}
                  </div>
                </div>

                <div className="mt-1.5 overflow-x-auto overflow-y-hidden py-1 md:overflow-visible">
                  <div className="grid min-w-[620px] grid-cols-12 gap-1">
                    {MESES.map((nomeMes, i) => {
                      const mesNum = i + 1
                      const concluidas = prog?.concluidasPorMes[mesNum] ?? 0
                      const total = prog?.totalPorMes[mesNum] ?? 0
                      const pct = total > 0 ? normalizarPercentual((concluidas / total) * 100) : null
                      const atual = mesNum === mes
                      const conteudo = (
                        <>
                          <span className="text-xs font-semibold leading-none">{nomeMes}</span>
                          <span className="mt-1 text-sm font-bold tabular-nums leading-none">{pct === null ? '—' : `${pct}%`}</span>
                        </>
                      )
                      const classe = cn(
                        'flex flex-col items-center justify-center rounded-lg py-1.5',
                        COR[tomDoPercentual(pct)],
                      )
                      const estilo = atual ? { boxShadow: 'inset 0 0 0 2px var(--acc)' } : undefined

                      return total > 0 ? (
                        <Link
                          key={mesNum}
                          href={`/contabil/clientes/${cliente.id}?mes=${mesNum}&ano=${ano}`}
                          aria-current={atual ? 'date' : undefined}
                          title={`${nomeMes}: ${concluidas}/${total} concluídas`}
                          className={cn(classe, 'transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc')}
                          style={estilo}
                        >
                          {conteudo}
                        </Link>
                      ) : (
                        <span key={mesNum} aria-current={atual ? 'date' : undefined} className={cn(classe)} style={estilo}>
                          {conteudo}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[13px] text-fg-2">
        <span>Tarefas concluídas no mês:</span>
        <span className="inline-flex items-center gap-1.5"><MonthPill percentual={0} />nenhuma</span>
        <span className="inline-flex items-center gap-1.5"><MonthPill percentual={50} />em andamento</span>
        <span className="inline-flex items-center gap-1.5"><MonthPill percentual={100} />todas</span>
      </div>
    </Pagina>
  )
}
