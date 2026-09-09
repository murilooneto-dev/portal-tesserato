'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export interface MovimentoRelatorio {
  id: string
  natureza: 'entrada' | 'saida'
  valor: number
  data: string
  observacao: string | null
  tipo_nome: string
  centro_custo_nome: string | null
}

interface OpcaoTipo { id: string; nome: string }

interface Filtros {
  natureza: string
  tipoId: string
  centroCustoId: string
  de: string
  ate: string
}

interface Props {
  movimentos: MovimentoRelatorio[]
  tiposEntrada: OpcaoTipo[]
  tiposSaida: OpcaoTipo[]
  centrosCusto: OpcaoTipo[]
  filtros: Filtros
}

const NATUREZA_LABEL: Record<string, string> = { entrada: 'Entrada', saida: 'Saída' }

function formatarData(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function formatarValor(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const inputCls = "px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

export default function RelatoriosFinanceiroClient({ movimentos, tiposEntrada, tiposSaida, centrosCusto, filtros }: Props) {
  const router = useRouter()
  const [form, setForm] = useState(filtros)

  const opcoesTipo = form.natureza === 'saida' ? tiposSaida : form.natureza === 'entrada' ? tiposEntrada : [...tiposEntrada, ...tiposSaida]

  const filtrosAplicados = [
    form.natureza && `Natureza: ${NATUREZA_LABEL[form.natureza] ?? form.natureza}`,
    form.tipoId && `Tipo: ${opcoesTipo.find(t => t.id === form.tipoId)?.nome ?? form.tipoId}`,
    form.centroCustoId && `Centro de custo: ${centrosCusto.find(c => c.id === form.centroCustoId)?.nome ?? form.centroCustoId}`,
    form.de && `De: ${formatarData(form.de)}`,
    form.ate && `Até: ${formatarData(form.ate)}`,
  ].filter(Boolean).join(' — ')

  function aplicar() {
    const params = new URLSearchParams()
    if (form.natureza) params.set('natureza', form.natureza)
    if (form.tipoId) params.set('tipoId', form.tipoId)
    if (form.centroCustoId) params.set('centroCustoId', form.centroCustoId)
    if (form.de) params.set('de', form.de)
    if (form.ate) params.set('ate', form.ate)
    router.push(`/financeiro/relatorios?${params.toString()}`)
  }

  function limpar() {
    setForm({ natureza: '', tipoId: '', centroCustoId: '', de: '', ate: '' })
    router.push('/financeiro/relatorios')
  }

  const totalEntradas = movimentos.filter(m => m.natureza === 'entrada').reduce((acc, m) => acc + m.valor, 0)
  const totalSaidas = movimentos.filter(m => m.natureza === 'saida').reduce((acc, m) => acc + m.valor, 0)

  return (
    <div className="p-8 max-w-6xl mx-auto print:p-0 print:max-w-none">
      <div className="print:hidden flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Relatórios — Financeiro</h1>
        <button onClick={() => window.print()}
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors">
          Gerar relatório
        </button>
      </div>

      <div className="print:hidden bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-5 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">Natureza</label>
          <select className={inputCls} value={form.natureza} onChange={e => setForm(p => ({ ...p, natureza: e.target.value, tipoId: '' }))}>
            <option value="" className="bg-[var(--bg-surface)]">Todas</option>
            <option value="entrada" className="bg-[var(--bg-surface)]">Entrada</option>
            <option value="saida" className="bg-[var(--bg-surface)]">Saída</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">Tipo</label>
          <select className={inputCls} value={form.tipoId} onChange={e => setForm(p => ({ ...p, tipoId: e.target.value }))}>
            <option value="" className="bg-[var(--bg-surface)]">Todos</option>
            {opcoesTipo.map(t => (
              <option key={t.id} value={t.id} className="bg-[var(--bg-surface)]">{t.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">Centro de custo</label>
          <select className={inputCls} value={form.centroCustoId} onChange={e => setForm(p => ({ ...p, centroCustoId: e.target.value }))}>
            <option value="" className="bg-[var(--bg-surface)]">Todos</option>
            {centrosCusto.map(c => (
              <option key={c.id} value={c.id} className="bg-[var(--bg-surface)]">{c.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">De</label>
          <input type="date" className={inputCls} value={form.de} onChange={e => setForm(p => ({ ...p, de: e.target.value }))} />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">Até</label>
          <input type="date" className={inputCls} value={form.ate} onChange={e => setForm(p => ({ ...p, ate: e.target.value }))} />
        </div>
        <button onClick={aplicar} className="px-4 py-2 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] text-sm font-semibold hover:bg-[var(--accent)]/30 transition-colors">
          Filtrar
        </button>
        <button onClick={limpar} className="px-4 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)]/40 text-sm hover:bg-[var(--fg)]/10 transition-colors">
          Limpar
        </button>
      </div>

      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold text-black">Relatório Financeiro</h1>
        {filtrosAplicados && <p className="text-xs text-black/70 mt-1">Filtros: {filtrosAplicados}</p>}
        <p className="text-xs text-black/50 mt-1">Gerado em {new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </div>

      <div className="flex flex-wrap gap-4 mb-6 px-5 py-4 rounded-2xl bg-[var(--fg)]/3 border border-[var(--fg)]/8 print:border-black/20 print:bg-transparent">
        <div>
          <p className="text-[10px] font-bold text-[var(--fg)]/40 print:text-black/60 uppercase tracking-widest mb-1">Entradas</p>
          <p className="text-base font-semibold text-[var(--fg)] print:text-black">{formatarValor(totalEntradas)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[var(--fg)]/40 print:text-black/60 uppercase tracking-widest mb-1">Saídas</p>
          <p className="text-base font-semibold text-[var(--fg)] print:text-black">{formatarValor(totalSaidas)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-[var(--fg)]/40 print:text-black/60 uppercase tracking-widest mb-1">Saldo</p>
          <p className="text-base font-semibold text-[var(--fg)] print:text-black">{formatarValor(totalEntradas - totalSaidas)}</p>
        </div>
      </div>

      <div className="overflow-auto rounded-2xl border border-[var(--fg)]/8 print:overflow-visible print:border-black/20 print:rounded-none">
        <table className="w-full text-xs border-collapse print:table-fixed">
          <thead>
            <tr className="border-b border-[var(--fg)]/8 print:border-black/20 bg-[var(--fg)]/3 print:bg-transparent">
              <th className="text-left px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)]/40 print:text-black font-semibold whitespace-nowrap print:w-[10%]">Data</th>
              <th className="text-left px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)]/40 print:text-black font-semibold whitespace-nowrap print:w-[9%]">Natureza</th>
              <th className="text-left px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)]/40 print:text-black font-semibold whitespace-nowrap print:w-[18%]">Tipo</th>
              <th className="text-left px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)]/40 print:text-black font-semibold whitespace-nowrap print:w-[17%]">Centro de custo</th>
              <th className="text-left px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)]/40 print:text-black font-semibold whitespace-nowrap print:w-[31%]">Observação</th>
              <th className="text-left px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)]/40 print:text-black font-semibold whitespace-nowrap print:w-[15%]">Valor</th>
            </tr>
          </thead>
          <tbody>
            {movimentos.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-[var(--fg)]/20">Nenhum registro</td></tr>
            )}
            {movimentos.map(m => (
              <tr key={m.id} className="border-b border-[var(--fg)]/5 print:border-black/10 hover:bg-[var(--fg)]/2 align-top">
                <td className="px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)]/50 print:text-black whitespace-nowrap">{formatarData(m.data)}</td>
                <td className="px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)]/70 print:text-black whitespace-nowrap">{NATUREZA_LABEL[m.natureza]}</td>
                <td className="px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)]/70 print:text-black break-words max-w-[180px]">{m.tipo_nome}</td>
                <td className="px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)]/70 print:text-black break-words max-w-[160px]">{m.centro_custo_nome ?? '—'}</td>
                <td className="px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)]/50 print:text-black break-words max-w-[260px]">{m.observacao ?? '—'}</td>
                <td className="px-3 py-2.5 print:px-1.5 print:py-1 text-[var(--fg)] print:text-black font-medium whitespace-nowrap">{formatarValor(m.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
