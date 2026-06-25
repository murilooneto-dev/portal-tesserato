'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import type { Cliente } from '@/lib/types'

const CORES_REGIME: Record<string, string> = {
  simples:   '#10b981',
  presumido: '#0ea5e9',
  real:      '#8b5cf6',
  mei:       '#f59e0b',
  isenta:    '#6b7280',
  normal:    '#3b82f6',
}

function corRegime(regime: string): string {
  const r = regime.toLowerCase()
  for (const [key, cor] of Object.entries(CORES_REGIME)) {
    if (r.includes(key)) return cor
  }
  return '#6b7280'
}

const CORES_RESP: string[] = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899','#8b5cf6','#14b8a6','#f97316','#ef4444','#84cc16']
const _respColorCache: Record<string, string> = {}
function corResponsavel(nome: string): string {
  if (!_respColorCache[nome]) {
    _respColorCache[nome] = CORES_RESP[Object.keys(_respColorCache).length % CORES_RESP.length]
  }
  return _respColorCache[nome]
}

interface Props {
  clientes: Cliente[]
  comPendencia: Set<string>
  progressoMap: Record<string, { total: number; concluidas: number }>
  mes: number
  ano: number
}

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export default function ClientesLista({ clientes, comPendencia, progressoMap, mes, ano }: Props) {
  const [busca, setBusca] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('TODOS')
  const [filtroGrupo, setFiltroGrupo] = useState('TODOS')
  const [filtroAtividade, setFiltroAtividade] = useState('TODOS')
  const [filtroPendencia, setFiltroPendencia] = useState(false)

  const responsaveis = useMemo(() => ['TODOS', ...Array.from(new Set(
    clientes.map(c => c.responsavel ?? '').filter(Boolean)
  )).sort()], [clientes])

  const grupos = useMemo(() => ['TODOS', ...Array.from(new Set(
    clientes.map(c => c.grupo ?? '').filter(Boolean)
  )).sort()], [clientes])

  const atividades = useMemo(() => ['TODOS', ...Array.from(new Set(
    clientes.map(c => c.atividade ?? '').filter(Boolean)
  )).sort()], [clientes])

  const filtrados = useMemo(() => clientes.filter(c => {
    if (busca) {
      const q = busca.toLowerCase()
      if (
        !c.nome.toLowerCase().includes(q) &&
        !(c.cnpj ?? '').includes(q) &&
        !(c.cod ?? '').includes(q)
      ) return false
    }
    if (filtroResponsavel !== 'TODOS' && c.responsavel !== filtroResponsavel) return false
    if (filtroGrupo !== 'TODOS' && c.grupo !== filtroGrupo) return false
    if (filtroAtividade !== 'TODOS' && c.atividade !== filtroAtividade) return false
    if (filtroPendencia && !comPendencia.has(c.id)) return false
    return true
  }), [clientes, busca, filtroResponsavel, filtroGrupo, filtroAtividade, filtroPendencia, comPendencia])

  const selectClass = "bg-[#0d1320] border border-white/10 rounded-xl px-3 py-2 text-white/70 text-sm focus:outline-none focus:border-[#00B8D4]/50 transition-colors"

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="text"
          placeholder="Buscar cliente ou CNPJ..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          className="flex-1 min-w-[220px] px-4 py-2 rounded-xl bg-[#0d1320] border border-white/10 text-white placeholder-white/25 text-sm focus:outline-none focus:border-[#00B8D4]/50 transition-colors"
        />
        <select value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value)} className={selectClass}>
          {responsaveis.map(r => <option key={r} value={r} className="bg-[#0d1320]">{r === 'TODOS' ? 'TODOS' : r}</option>)}
        </select>
        <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)} className={selectClass}>
          <option value="TODOS" className="bg-[#0d1320]">Todos os grupos</option>
          {grupos.slice(1).map(g => <option key={g} value={g} className="bg-[#0d1320]">{g}</option>)}
        </select>
        <select value={filtroAtividade} onChange={e => setFiltroAtividade(e.target.value)} className={selectClass}>
          <option value="TODOS" className="bg-[#0d1320]">Todas as atividades</option>
          {atividades.slice(1).map(a => <option key={a} value={a} className="bg-[#0d1320]">{a}</option>)}
        </select>
        <label className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-[#0d1320] cursor-pointer select-none hover:border-white/20 transition-colors">
          <input
            type="checkbox"
            checked={filtroPendencia}
            onChange={e => setFiltroPendencia(e.target.checked)}
            className="w-4 h-4 accent-[#00B8D4]"
          />
          <span className="text-sm text-white/70 whitespace-nowrap">Apenas pendentes</span>
        </label>
      </div>

      {/* Contador */}
      <p className="text-white/30 text-xs mb-3">
        {filtrados.length} clientes · {MESES[mes - 1]}/{ano}
      </p>

      {/* Lista */}
      <div className="flex flex-col gap-1.5">
        {filtrados.length === 0 && (
          <p className="text-center text-white/20 py-12 text-sm">Nenhum cliente encontrado.</p>
        )}

        {filtrados.map(cliente => {
          const prog = progressoMap[cliente.id]
          const total = prog?.total ?? 0
          const concluidas = prog?.concluidas ?? 0
          const pct = total > 0 ? Math.round((concluidas / total) * 100) : 0
          const pendente = comPendencia.has(cliente.id)
          const temObs = !!(cliente.obs?.trim())

          return (
            <Link
              key={cliente.id}
              href={`/fiscal/clientes/${cliente.id}`}
              className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/3 border border-white/8 hover:bg-white/6 hover:border-white/15 transition-all group"
            >
              {/* Prioridade */}
              {cliente.prioridade && cliente.prioridade > 0 ? (
                <div className="w-7 h-7 rounded-lg bg-red-500/20 border border-red-500/40 flex items-center justify-center shrink-0">
                  <span className="text-red-400 text-[10px] font-bold">P{cliente.prioridade}</span>
                </div>
              ) : (
                <div className="w-7 h-7 shrink-0" />
              )}

              {/* Nome + CNPJ */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  {cliente.cnpj && (
                    <span className="text-white/40 font-normal mr-1.5">
                      {cliente.cnpj.replace(/^(\d{2})\.?(\d{3})\.?(\d{3}).*/, '$1.$2.$3')}
                    </span>
                  )}
                  {cliente.nome}
                </p>
                <p className="text-white/25 text-xs mt-0.5">{cliente.cnpj ?? '—'}</p>
              </div>

              {/* Badges */}
              <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                {cliente.regime && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: corRegime(cliente.regime) + '25', color: corRegime(cliente.regime), border: `1px solid ${corRegime(cliente.regime)}50` }}>
                    {cliente.regime.split('/')[0].trim()}
                  </span>
                )}
                {cliente.atividade && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#00B8D4]/15 text-[#00B8D4] border border-[#00B8D4]/30">
                    {cliente.atividade}
                  </span>
                )}
                {cliente.responsavel && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                    style={{ backgroundColor: corResponsavel(cliente.responsavel) + '25', color: corResponsavel(cliente.responsavel), border: `1px solid ${corResponsavel(cliente.responsavel)}50` }}>
                    {cliente.responsavel}
                  </span>
                )}
              </div>

              {/* Progresso */}
              {total > 0 && (
                <div className="w-20 shrink-0 text-right">
                  <p className={`text-sm font-bold ${pct === 100 ? 'text-[#10b981]' : pendente ? 'text-amber-400' : 'text-white'}`}>
                    {pct}%
                  </p>
                  <div className="w-full h-1 bg-white/10 rounded-full mt-1">
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: pct === 100 ? '#10b981' : pendente ? '#f59e0b' : '#00B8D4' }} />
                  </div>
                  <p className="text-white/25 text-[10px] mt-0.5">{concluidas}/{total}</p>
                </div>
              )}

              {/* Alerta obs */}
              <div className="w-4 shrink-0 text-center">
                {temObs && <span className="text-amber-400 text-sm font-bold">!</span>}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
