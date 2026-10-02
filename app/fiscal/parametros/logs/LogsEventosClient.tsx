'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { descreverEventoTarefas, type DetalhesTarefas } from '@/lib/logs-tarefas'

const TIPO_EVENTO_LABEL: Record<string, string> = {
  criacao: 'Criação',
  edicao: 'Edição de dados',
  exclusao: 'Exclusão',
  desabilitacao: 'Desabilitação',
  reabilitacao: 'Reabilitação',
  troca_responsavel: 'Troca de responsável',
  tarefas: 'Tarefas',
}

const SETOR_LABEL: Record<string, string> = {
  fiscal: 'Fiscal',
  contabil: 'Contábil',
  pessoal: 'Pessoal',
  societario: 'Societário',
  financeiro: 'Financeiro',
  configuracoes: 'Configurações',
  geral: 'Geral',
}

// Tipos de item que aparecem em detalhes.entidade nos eventos de criação/
// exclusão — os mesmos rótulos gravados pelas triggers da migration 058
// (mais 'Usuário', gravado pela criação/exclusão de usuário em Parâmetros).
const ITENS = [
  'Anexo do evento', 'Arquivo do cliente', 'Anexo do procedimento', 'Nota', 'Parcelamento',
  'Seção de parcelamento', 'Evento do calendário', 'Evento', 'Tipo de tarefa', 'Vínculo de tarefa',
  'Vínculo entre setores', 'Processo', 'Procedimento', 'Tabela', 'Modelo de documentação',
  'Atividade', 'Regime', 'Movimento financeiro', 'Tipo financeiro', 'Centro de custo',
  'Link rápido', 'Compromisso na agenda', 'Usuário',
].sort((a, b) => a.localeCompare(b, 'pt-BR'))

interface EventoLog {
  id: string
  created_at: string
  usuario_nome: string | null
  setor: string | null
  cliente_nome: string | null
  tipo_evento: string
  detalhes: { campos?: string[]; responsavel_antigo?: string | null; responsavel_novo?: string | null; entidade?: string; descricao?: string } & Partial<DetalhesTarefas> | null
}

interface Cliente {
  id: string
  nome: string
}

interface Filtros {
  tipo: string
  setor: string
  clienteId: string
  item: string
  de: string
  ate: string
}

interface Props {
  logs: EventoLog[]
  clientes: Cliente[]
  filtros: Filtros
}

function formatDate(s: string) {
  return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function detalheTexto(log: EventoLog) {
  if (log.tipo_evento === 'troca_responsavel' && log.detalhes) {
    return `de ${log.detalhes.responsavel_antigo ?? '—'} para ${log.detalhes.responsavel_novo ?? '—'}`
  }
  if (log.tipo_evento === 'tarefas') {
    return descreverEventoTarefas(log.detalhes as DetalhesTarefas | null)
  }
  if (log.tipo_evento === 'edicao' && log.detalhes?.campos) {
    return log.detalhes.campos.join(', ')
  }
  return '—'
}

// Coluna "Item": o que foi criado/excluído (só eventos com entidade —
// os de cliente não têm, o cliente já aparece na coluna Cliente).
function itemTexto(log: EventoLog) {
  if (!log.detalhes?.entidade) return '—'
  return log.detalhes.descricao ? `${log.detalhes.entidade}: ${log.detalhes.descricao}` : log.detalhes.entidade
}

const inputCls = "px-3 py-2 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"

export default function LogsEventosClient({ logs, clientes, filtros }: Props) {
  const router = useRouter()
  const [form, setForm] = useState(filtros)

  function aplicar() {
    const params = new URLSearchParams()
    if (form.tipo) params.set('tipo', form.tipo)
    if (form.setor) params.set('setor', form.setor)
    if (form.clienteId) params.set('clienteId', form.clienteId)
    if (form.item) params.set('item', form.item)
    if (form.de) params.set('de', form.de)
    if (form.ate) params.set('ate', form.ate)
    router.push(`/fiscal/parametros/logs?${params.toString()}`)
  }

  function limpar() {
    setForm({ tipo: '', setor: '', clienteId: '', item: '', de: '', ate: '' })
    router.push('/fiscal/parametros/logs')
  }

  const filtrosAplicados = [
    form.tipo && `Evento: ${TIPO_EVENTO_LABEL[form.tipo] ?? form.tipo}`,
    form.setor && `Setor: ${SETOR_LABEL[form.setor] ?? form.setor}`,
    form.clienteId && `Cliente: ${clientes.find(c => c.id === form.clienteId)?.nome ?? form.clienteId}`,
    form.item && `Item: ${form.item}`,
    form.de && `De: ${form.de}`,
    form.ate && `Até: ${form.ate}`,
  ].filter(Boolean).join(' — ')

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="print:hidden flex items-center justify-between mb-6">
        <div>
          <Link href="/fiscal/parametros" className="text-[var(--fg)]/30 hover:text-[var(--fg)]/70 transition-colors text-sm">← Parâmetros</Link>
          <h1 className="text-2xl font-bold text-[var(--fg)] mt-1">Log de Eventos</h1>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors"
        >
          Gerar relatório
        </button>
      </div>

      <div className="print:hidden bg-[var(--fg)]/3 border border-[var(--fg)]/8 rounded-2xl p-5 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">Tipo de evento</label>
          <select className={inputCls} value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
            <option value="" className="bg-[var(--bg-surface)]">Todos</option>
            {Object.entries(TIPO_EVENTO_LABEL).map(([v, label]) => (
              <option key={v} value={v} className="bg-[var(--bg-surface)]">{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">Setor</label>
          <select className={inputCls} value={form.setor} onChange={e => setForm(p => ({ ...p, setor: e.target.value }))}>
            <option value="" className="bg-[var(--bg-surface)]">Todos</option>
            {Object.entries(SETOR_LABEL).map(([v, label]) => (
              <option key={v} value={v} className="bg-[var(--bg-surface)]">{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">Cliente</label>
          <select className={inputCls + ' max-w-[220px]'} value={form.clienteId} onChange={e => setForm(p => ({ ...p, clienteId: e.target.value }))}>
            <option value="" className="bg-[var(--bg-surface)]">Todos</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id} className="bg-[var(--bg-surface)]">{c.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1">Item</label>
          <select className={inputCls} value={form.item} onChange={e => setForm(p => ({ ...p, item: e.target.value }))}>
            <option value="" className="bg-[var(--bg-surface)]">Todos</option>
            {ITENS.map(i => (
              <option key={i} value={i} className="bg-[var(--bg-surface)]">{i}</option>
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
        <h1 className="text-lg font-bold text-black">Relatório de Log de Eventos</h1>
        {filtrosAplicados && <p className="text-xs text-black/70 mt-1">Filtros: {filtrosAplicados}</p>}
        <p className="text-xs text-black/50 mt-1">Gerado em {new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--fg)]/8 print:border-black/20">
              {['Data/Hora','Usuário','Setor','Cliente','Item','Evento','Detalhes'].map(h => (
                <th key={h} className="text-left px-3 py-2 text-[var(--fg)]/40 print:text-black font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-[var(--fg)]/20">Nenhum registro</td></tr>
            )}
            {logs.map(log => (
              <tr key={log.id} className="border-b border-[var(--fg)]/5 print:border-black/10 hover:bg-[var(--fg)]/2">
                <td className="px-3 py-2 text-[var(--fg)]/50 print:text-black whitespace-nowrap">{formatDate(log.created_at)}</td>
                <td className="px-3 py-2 text-[var(--fg)]/70 print:text-black">{log.usuario_nome ?? '—'}</td>
                <td className="px-3 py-2 text-[var(--fg)]/70 print:text-black">{log.setor ? (SETOR_LABEL[log.setor] ?? log.setor) : 'Geral'}</td>
                <td className="px-3 py-2 text-[var(--fg)]/70 print:text-black">{log.cliente_nome ?? '—'}</td>
                <td className="px-3 py-2 text-[var(--fg)]/70 print:text-black">{itemTexto(log)}</td>
                <td className="px-3 py-2 text-[var(--fg)]/70 print:text-black">{TIPO_EVENTO_LABEL[log.tipo_evento] ?? log.tipo_evento}</td>
                <td className="px-3 py-2 text-[var(--fg)]/50 print:text-black">{detalheTexto(log)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
