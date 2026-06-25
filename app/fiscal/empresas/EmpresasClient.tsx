'use client'

import { useState, useMemo } from 'react'
import type { Cliente } from '@/lib/types'
import { excluirEmpresa } from './actions'
import EmpresaModal from '@/components/fiscal/EmpresaModal'

const CORES_RESP: Record<string, string> = {}
const PALETA = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ec4899','#8b5cf6','#14b8a6','#f97316']
function corResponsavel(nome: string): string {
  if (!CORES_RESP[nome]) CORES_RESP[nome] = PALETA[Object.keys(CORES_RESP).length % PALETA.length]
  return CORES_RESP[nome]
}

interface Props {
  clientes: Cliente[]
  contagemTarefas: Record<string, number>
}

export default function EmpresasClient({ clientes, contagemTarefas }: Props) {
  const [search, setSearch] = useState('')
  const [filtroGrupo, setFiltroGrupo] = useState('TODOS')
  const [filtroResponsavel, setFiltroResponsavel] = useState('TODOS')
  const [filtroAtividade, setFiltroAtividade] = useState('TODOS')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [modalId, setModalId] = useState<string | null | 'novo'>(undefined as any)
  const [modalOpen, setModalOpen] = useState(false)

  const responsaveis = useMemo(() => Array.from(new Set(
    clientes.map(c => c.responsavel ?? '').filter(Boolean)
  )).sort(), [clientes])

  const atividades = useMemo(() => ['TODOS', ...Array.from(new Set(
    clientes.map(c => c.atividade ?? '').filter(Boolean)
  )).sort()], [clientes])

  const filtrados = useMemo(() => clientes.filter(c => {
    if (search) {
      const q = search.toLowerCase()
      if (!c.nome.toLowerCase().includes(q) && !(c.cnpj ?? '').includes(q) && !(c.cod ?? '').includes(q)) return false
    }
    if (filtroGrupo !== 'TODOS' && c.grupo !== filtroGrupo) return false
    if (filtroResponsavel !== 'TODOS' && c.responsavel !== filtroResponsavel) return false
    if (filtroAtividade !== 'TODOS' && c.atividade !== filtroAtividade) return false
    return true
  }), [clientes, search, filtroGrupo, filtroResponsavel, filtroAtividade])

  function openEdit(id: string) { setModalId(id); setModalOpen(true) }
  function openNovo() { setModalId(null); setModalOpen(true) }
  function closeModal() { setModalOpen(false) }

  async function handleDelete(id: string, nome: string) {
    if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return
    setDeleting(id)
    try { await excluirEmpresa(id) } finally { setDeleting(null) }
  }

  const selectCls = "bg-[#0d1117] border border-white/10 rounded-xl px-4 py-2.5 text-white/70 text-sm focus:outline-none focus:border-[#00B8D4]/50 transition-colors"

  return (
    <>
      {modalOpen && (
        <EmpresaModal
          clienteId={modalId === null ? null : (modalId as string)}
          responsaveis={responsaveis}
          onClose={closeModal}
        />
      )}

      {/* Cabeçalho + botão */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Empresas</h1>
          <p className="text-sm text-white/40 mt-1">Cadastre e gerencie as empresas do setor fiscal.</p>
        </div>
        <button onClick={openNovo}
          className="px-4 py-2.5 rounded-xl bg-[#00B8D4] text-white text-sm font-semibold hover:bg-[#00a3bc] transition-colors">
          + Nova Empresa
        </button>
      </div>

      <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
        {/* Filtros */}
        <div className="px-5 py-4 border-b border-white/8 flex flex-wrap items-center gap-3">
          <div>
            <p className="text-white text-sm font-medium">Empresas cadastradas</p>
            <p className="text-white/30 text-xs">{filtrados.length} de {clientes.length} empresas</p>
          </div>
          <div className="flex-1" />
          <input type="text" placeholder="Buscar empresa, CNPJ ou código..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="min-w-[220px] px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/20 text-sm focus:outline-none focus:border-[#00B8D4]/50 transition-colors" />

          <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)} className={selectCls}>
            <option value="TODOS" className="bg-[#0d1117]">Todos os grupos</option>
            <option value="normal" className="bg-[#0d1117]">Regime Normal</option>
            <option value="simples" className="bg-[#0d1117]">Simples Nacional</option>
            <option value="mei" className="bg-[#0d1117]">MEI</option>
          </select>

          <select value={filtroResponsavel} onChange={e => setFiltroResponsavel(e.target.value)} className={selectCls}>
            <option value="TODOS" className="bg-[#0d1117]">Todos os responsáveis</option>
            {responsaveis.map(r => <option key={r} value={r} className="bg-[#0d1117]">{r}</option>)}
          </select>

          <select value={filtroAtividade} onChange={e => setFiltroAtividade(e.target.value)} className={selectCls}>
            <option value="TODOS" className="bg-[#0d1117]">Todas as atividades</option>
            {atividades.slice(1).map(a => <option key={a} value={a} className="bg-[#0d1117]">{a}</option>)}
          </select>
        </div>

        {/* Lista */}
        <div className="divide-y divide-white/5">
          {filtrados.length === 0 && (
            <p className="text-center text-white/20 py-12 text-sm">Nenhuma empresa encontrada.</p>
          )}
          {filtrados.map(c => {
            const nTarefas = contagemTarefas[c.id] ?? 0
            const cor = c.responsavel ? corResponsavel(c.responsavel) : '#6b7280'
            const infos: string[] = []
            if (c.cnpj) infos.push(c.cnpj)
            if (c.regime) infos.push(c.regime)
            if (c.atividade) infos.push(c.atividade)
            if (c.mit) infos.push(c.mit)
            if (nTarefas > 0) infos.push(`${nTarefas} tarefa${nTarefas > 1 ? 's' : ''}`)

            return (
              <div key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-white/2 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {c.cod && <span className="text-white/30 font-normal mr-2">{c.cod}</span>}
                    {c.nome}
                  </p>
                  <p className="text-white/35 text-xs mt-0.5 truncate">{infos.join(' · ')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.responsavel && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                      style={{ backgroundColor: cor + '25', color: cor, border: `1px solid ${cor}40` }}>
                      {c.responsavel.toUpperCase()}
                    </span>
                  )}
                  <button onClick={() => openEdit(c.id)}
                    className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 text-xs transition-colors">
                    Editar
                  </button>
                  <button onClick={() => handleDelete(c.id, c.nome)} disabled={deleting === c.id}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 text-xs transition-colors disabled:opacity-50">
                    {deleting === c.id ? '...' : 'Excluir'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
