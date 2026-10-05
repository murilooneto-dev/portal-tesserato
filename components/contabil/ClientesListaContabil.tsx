'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useFiltroPersistente } from '@/lib/use-filtro-persistente'
import type { ClienteComContabil } from '@/lib/clientes-contabil'
import type { PendenciaVinculo } from '@/lib/vinculos'
import { formatarBadgeVinculo } from '@/lib/vinculos'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import EmpresaContabilModal from './EmpresaContabilModal'
import { labelRegime } from '@/lib/atividades-regimes'
import { Badge } from '@/components/ui/Badge'
import { NomeCliente } from '@/components/ui/NomeCliente'
import { COR, tomDoPercentual, normalizarPercentual } from '@/components/ui/MonthPill'
import { cn } from '@/components/ui/cn'

const CORES_RESP: string[] = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899','#8b5cf6','#14b8a6','#f97316','#ef4444','#84cc16']
const _respColorCache: Record<string, string> = {}
function corResponsavel(nome: string): string {
  if (!_respColorCache[nome]) {
    _respColorCache[nome] = CORES_RESP[Object.keys(_respColorCache).length % CORES_RESP.length]
  }
  return _respColorCache[nome]
}

interface Props {
  clientes: ClienteComContabil[]
  progressoAnualMap: Record<string, { total: number; concluidasPorMes: Record<number, number> }>
  mes: number
  ano: number
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
  pendenciasVinculo: Record<string, PendenciaVinculo[]>
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function ClientesListaContabil({ clientes, progressoAnualMap, mes, ano, tarefasPadrao, catalogo, pendenciasVinculo }: Props) {
  const [busca, setBusca] = useFiltroPersistente('clientes-contabil:busca', '')
  const [filtroResponsavel, setFiltroResponsavel] = useFiltroPersistente('clientes-contabil:responsavel', 'TODOS')
  const [filtroRegime, setFiltroRegime] = useFiltroPersistente('clientes-contabil:regime', 'TODOS')
  const [filtroPrioridade, setFiltroPrioridade] = useFiltroPersistente('clientes-contabil:prioridade', 'TODOS')
  const [mostrarDesabilitados, setMostrarDesabilitados] = useFiltroPersistente('clientes-contabil:mostrarDesabilitados', false)
  const [modalNovoOpen, setModalNovoOpen] = useState(false)

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

  const selectClass = "bg-[var(--bg-surface)] border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-[var(--fg)]/70 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Buscar cliente ou CNPJ..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] placeholder-[var(--fg)]/25 text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
        />
        <select value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value)} className={selectClass}>
          {responsaveis.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
        </select>
        <select value={filtroRegime} onChange={e => setFiltroRegime(e.target.value)} className={selectClass}>
          <option value="TODOS" className="bg-[var(--bg-surface)]">Todos os regimes</option>
          {catalogo.regimes.map(r => <option key={r} value={r} className="bg-[var(--bg-surface)]">{r}</option>)}
        </select>
        <select value={filtroPrioridade} onChange={e => setFiltroPrioridade(e.target.value)} className={selectClass}>
          <option value="TODOS" className="bg-[var(--bg-surface)]">Todas as prioridades</option>
          {prioridades.map(p => <option key={p} value={p} className="bg-[var(--bg-surface)]">{`P${p}`}</option>)}
        </select>
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--fg)]/10 bg-[var(--bg-surface)] cursor-pointer select-none hover:border-[var(--fg)]/20 transition-colors">
          <input
            type="checkbox"
            checked={mostrarDesabilitados}
            onChange={e => setMostrarDesabilitados(e.target.checked)}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span className="text-sm text-[var(--fg)]/70 whitespace-nowrap">Mostrar desabilitados</span>
        </label>
        <button
          onClick={() => setModalNovoOpen(true)}
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap">
          + Novo Cliente
        </button>
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

      <p className="text-[var(--fg)]/30 text-xs mb-3">
        {filtrados.length} clientes · {ano} · clique em um mês para abrir a ficha naquele mês
      </p>

      {filtrados.length === 0 ? (
        <p className="text-center text-[var(--fg)]/20 py-12 text-sm">Nenhum cliente encontrado.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--fg)]/8">
          {filtrados.map(cliente => {
            const prog = progressoAnualMap[cliente.id]
            const total = prog?.total ?? 0
            const temObs = !!(cliente.obs?.trim())
            const vinculos = pendenciasVinculo[cliente.id] ?? []
            const temP1 = !!cliente.prioridade && cliente.prioridade > 0

            return (
              <div key={cliente.id} className="border-t border-[var(--fg)]/6 first:border-t-0 px-3 py-3 hover:bg-[var(--fg)]/3 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/contabil/clientes/${cliente.id}`} className="min-w-0 flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                    <NomeCliente
                      nome={cliente.nome}
                      cnpj={cliente.cnpj ?? null}
                      depoisDoNome={
                        <>
                          {temP1 && <Badge tom="dng">P{cliente.prioridade}</Badge>}
                          {temObs && <Badge tom="warn">Observação</Badge>}
                          {cliente.ativo === false && <Badge>Desabilitado</Badge>}
                        </>
                      }
                    />
                  </Link>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {vinculos.map((p, i) => {
                      const badge = formatarBadgeVinculo(p)
                      return (
                        <Badge key={i} tom={p.liberada ? 'ok' : 'warn'}>
                          {badge.texto.replace(/^(✓|⏳)\s*/, '')}
                        </Badge>
                      )
                    })}
                    {cliente.regime && <Badge tom="acc">{labelRegime(cliente.regime)}</Badge>}
                    {cliente.responsavel && (
                      <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md px-2 text-xs font-semibold leading-none"
                        style={{ backgroundColor: corResponsavel(cliente.responsavel) + '25', color: corResponsavel(cliente.responsavel), border: `1px solid ${corResponsavel(cliente.responsavel)}50` }}>
                        {cliente.responsavel}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 overflow-x-auto">
                  <div className="grid min-w-[620px] grid-cols-12 gap-1">
                    {MESES.map((nomeMes, i) => {
                      const mesNum = i + 1
                      const concluidas = prog?.concluidasPorMes[mesNum] ?? 0
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
        </div>
      )}
    </div>
  )
}
