'use client'

import { useState } from 'react'

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const OBRIGACOES = [
  { id: 'siget',           nome: 'SIGET',             dia: 5  as number | 'ultimo', cor: '#16a34a', desc: 'Prazo interno do escritório para rotinas SIGET.',                                       regimes: ['Regime Normal', 'Simples'] },
  { id: 'speed-gov',       nome: 'SPEED GOV',         dia: 10 as number | 'ultimo', cor: '#0ea5e9', desc: 'Prazo interno do escritório para rotinas Speed Gov.',                                   regimes: ['Regime Normal', 'Simples'] },
  { id: 'efd-reinf',       nome: 'EFD-Reinf',         dia: 15 as number | 'ultimo', cor: '#8b5cf6', desc: 'Retenções na fonte, serviços tomados e prestados.',                                    regimes: ['Regime Normal', 'Simples'] },
  { id: 'das-simples',     nome: 'DAS / PGDAS-D',     dia: 15 as number | 'ultimo', cor: '#10b981', desc: 'Documento de Arrecadação do Simples Nacional.',                                        regimes: ['Simples', 'MEI'] },
  { id: 'iss',             nome: 'ISS',               dia: 15 as number | 'ultimo', cor: '#f59e0b', desc: 'Imposto Sobre Serviços.',                                                              regimes: ['Regime Normal', 'Simples'] },
  { id: 'icms',            nome: 'ICMS / ICMS-ST',    dia: 15 as number | 'ultimo', cor: '#ef4444', desc: 'ICMS e Substituição Tributária.',                                                     regimes: ['Regime Normal', 'Simples'] },
  { id: 'pis-cofins',      nome: 'PIS / COFINS',      dia: 20 as number | 'ultimo', cor: '#f97316', desc: 'Apuração de PIS e COFINS.',                                                           regimes: ['Regime Normal'] },
  { id: 'dctfweb',         nome: 'DCTFWeb',           dia: 20 as number | 'ultimo', cor: '#7c3aed', desc: 'Declaração de débitos e créditos tributários federais previdenciários.',               regimes: ['Regime Normal', 'Simples'] },
  { id: 'irpj-csll',       nome: 'IRPJ / CSLL',       dia: 20 as number | 'ultimo', cor: '#ec4899', desc: 'Imposto de Renda PJ e CSLL. Apuração trimestral.',                                    regimes: ['Regime Normal'], trimestral: true, mesesTrimestral: [1,4,7,10] },
  { id: 'efd-contribuicoes', nome: 'EFD-Contribuições', dia: 'ultimo' as number | 'ultimo', cor: '#0891b2', desc: 'PIS, COFINS e Contribuição Previdenciária sobre Receita.',                   regimes: ['Regime Normal'] },
]

const FLUXO = [
  { label: 'SIGET',                          dia: 'dia 5',        cor: '#16a34a' },
  { label: 'SPEED GOV',                      dia: 'dia 10',       cor: '#0ea5e9' },
  { label: 'EFD-Reinf / DAS / ISS / ICMS',  dia: 'dia 15',       cor: '#8b5cf6' },
  { label: 'PIS-COFINS / DCTFWeb / IRPJ-CSLL', dia: 'dia 20',    cor: '#ef4444' },
  { label: 'EFD-Contribuições',              dia: 'dia último dia', cor: '#0891b2' },
]

function diffCard(diff: number): { badgeText: string; badgeCls: string; cardCls: string; dotCls: string } {
  if (diff < 0) return {
    badgeText: `${Math.abs(diff)}d atraso`,
    badgeCls: 'bg-red-600 text-white',
    cardCls: 'bg-red-900/40 border-red-700/60',
    dotCls: 'bg-red-500',
  }
  if (diff === 0) return {
    badgeText: 'Vence hoje',
    badgeCls: 'bg-orange-500 text-white',
    cardCls: 'bg-orange-900/30 border-orange-600/50',
    dotCls: 'bg-orange-400',
  }
  if (diff <= 5) return {
    badgeText: `${diff}d`,
    badgeCls: 'bg-orange-500/80 text-white',
    cardCls: 'bg-orange-900/20 border-orange-600/40',
    dotCls: 'bg-orange-400',
  }
  if (diff <= 10) return {
    badgeText: `${diff}d`,
    badgeCls: 'bg-blue-600/80 text-white',
    cardCls: 'bg-blue-900/20 border-blue-600/40',
    dotCls: 'bg-blue-400',
  }
  return {
    badgeText: `${diff}d`,
    badgeCls: 'bg-white/10 text-white/60',
    cardCls: 'bg-white/3 border-white/10',
    dotCls: 'bg-green-500',
  }
}

export default function CalendarioPage() {
  const now = new Date()
  const [mes, setMes] = useState(now.getMonth() + 1)
  const [ano, setAno] = useState(now.getFullYear())

  const today = new Date()
  const ultimoDia = new Date(ano, mes, 0).getDate()

  function prev() { if (mes === 1) { setMes(12); setAno(a => a - 1) } else setMes(m => m - 1) }
  function next() { if (mes === 12) { setMes(1); setAno(a => a + 1) } else setMes(m => m + 1) }

  const obrigacoesFiltradas = OBRIGACOES.filter(ob => {
    if (ob.trimestral && ob.mesesTrimestral) return ob.mesesTrimestral.includes(mes)
    return true
  }).map(ob => {
    const diaNum = ob.dia === 'ultimo' ? ultimoDia : ob.dia as number
    const due = new Date(ano, mes - 1, diaNum)
    const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000)
    return { ...ob, diaNum, diff }
  })

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Calendário Fiscal — Prazos {ano}</h1>
          <p className="text-sm text-white/40 mt-1">Prazos internos do escritório para a competência selecionada.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prev} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all flex items-center justify-center">‹</button>
          <span className="text-white font-medium text-sm min-w-[110px] text-center">{MESES_PT[mes - 1]} {ano}</span>
          <button onClick={next} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all flex items-center justify-center">›</button>
        </div>
      </div>

      {/* Cards grid — 3 colunas igual ao print */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {obrigacoesFiltradas.map(ob => {
          const { badgeText, badgeCls, cardCls, dotCls } = diffCard(ob.diff)
          const diaLabel = ob.dia === 'ultimo' ? `Dia ${ob.diaNum}` : `Dia ${ob.diaNum}`

          return (
            <div key={ob.id} className={`rounded-xl border p-4 ${cardCls}`}>
              {/* Cabeçalho do card */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotCls}`} />
                  <span className="text-white font-semibold text-sm">{ob.nome}</span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${badgeCls}`}>
                  {diaLabel} ({badgeText})
                </span>
              </div>

              {/* Descrição */}
              <p className="text-white/50 text-xs leading-relaxed mb-3">{ob.desc}</p>

              {/* Regimes */}
              <div className="flex flex-wrap gap-1.5">
                {ob.regimes.map(r => (
                  <span key={r} className="text-[10px] font-medium px-2 py-0.5 rounded border border-white/15 text-white/50 bg-white/5">
                    {r}
                  </span>
                ))}
                {ob.trimestral && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded border border-yellow-500/30 text-yellow-400 bg-yellow-500/10">
                    Trimestral
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Ordem obrigatória */}
      <div className="rounded-xl bg-white/3 border border-white/10 p-5">
        <p className="text-white font-semibold text-sm mb-4">⚡ Ordem obrigatória das obrigações mensais</p>
        <div className="flex flex-wrap items-center gap-2">
          {FLUXO.map((item, i) => (
            <div key={item.label} className="flex items-center gap-2">
              <div className="rounded-xl px-4 py-2.5 text-center border"
                style={{ borderColor: item.cor + '60', backgroundColor: item.cor + '15' }}>
                <p className="text-white text-xs font-semibold">{item.label}</p>
                <p className="text-[10px] mt-0.5" style={{ color: item.cor }}>{item.dia}</p>
              </div>
              {i < FLUXO.length - 1 && (
                <span className="text-white/25 text-lg">→</span>
              )}
            </div>
          ))}
        </div>
        <p className="text-white/30 text-xs mt-4">Qualquer atraso nessa cadeia trava as declarações seguintes e gera multa automática.</p>
      </div>
    </div>
  )
}
