'use client'

import { useEffect, useState } from 'react'
import {
  listarGruposCliente,
  criarGrupoTarefas,
  atualizarGrupoTarefas,
  excluirGrupoTarefas,
} from '@/lib/tarefa-grupos-actions'
import type { UserSetor, TarefaGrupo } from '@/lib/types'

interface Props {
  clienteId: string
  setor: UserSetor
  tarefasDisponiveis: string[]
  onClose: () => void
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function GruposTarefasModal({ clienteId, setor, tarefasDisponiveis, onClose }: Props) {
  const [grupos, setGrupos] = useState<TarefaGrupo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroLista, setErroLista] = useState<string | null>(null)

  const [editando, setEditando] = useState<TarefaGrupo | null | 'novo'>(null)
  const [nome, setNome] = useState('')
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)

  async function carregar() {
    setCarregando(true)
    const { data, error } = await listarGruposCliente(clienteId, setor)
    if (error) setErroLista(error)
    else setGrupos(data)
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function abrirNovo() {
    setEditando('novo')
    setNome('')
    setSelecionadas(new Set())
    setErroForm(null)
  }

  function abrirEdicao(grupo: TarefaGrupo) {
    setEditando(grupo)
    setNome(grupo.nome)
    setSelecionadas(new Set(grupo.tarefas))
    setErroForm(null)
  }

  function toggleTarefa(tipo: string) {
    setSelecionadas(prev => {
      const next = new Set(prev)
      if (next.has(tipo)) next.delete(tipo)
      else next.add(tipo)
      return next
    })
  }

  // Tarefa já usada em outro grupo (não o que está sendo editado) não pode
  // ser selecionada de novo — evita uma tarefa em dois grupos ao mesmo tempo.
  function grupoDeOutraTarefa(tipo: string): TarefaGrupo | undefined {
    return grupos.find(g => g.tarefas.includes(tipo) && g !== editando)
  }

  async function confirmar() {
    if (!nome.trim() || selecionadas.size === 0) return
    setSalvando(true)
    setErroForm(null)
    const tarefas = Array.from(selecionadas)
    const { error } = editando === 'novo'
      ? await criarGrupoTarefas(clienteId, setor, nome, tarefas)
      : await atualizarGrupoTarefas((editando as TarefaGrupo).id, clienteId, setor, nome, tarefas)
    setSalvando(false)
    if (error) { setErroForm(error); return }
    setEditando(null)
    await carregar()
  }

  async function excluir(grupo: TarefaGrupo) {
    if (!confirm(`Excluir o grupo "${grupo.nome}"? As tarefas voltam a ficar soltas na checklist.`)) return
    const { error } = await excluirGrupoTarefas(grupo.id, clienteId, setor)
    if (error) { setErroLista(error); return }
    await carregar()
  }

  const emForm = editando !== null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">
            {emForm ? (editando === 'novo' ? 'Novo grupo de tarefas' : 'Editar grupo') : 'Grupos de tarefas'}
          </h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {!emForm && (
            <>
              {carregando && <p className="text-[var(--fg)]/40 text-sm">Carregando...</p>}
              {erroLista && (
                <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">⚠ {erroLista}</div>
              )}
              {!carregando && grupos.length === 0 && (
                <p className="text-[var(--fg)]/40 text-sm">Nenhum grupo criado ainda.</p>
              )}
              {grupos.map(g => (
                <div key={g.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2">
                  <div>
                    <p className="text-[var(--fg)] text-sm font-semibold">{g.nome}</p>
                    <p className="text-[var(--fg)]/40 text-xs">{g.tarefas.length} tarefa{g.tarefas.length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => abrirEdicao(g)}
                      className="px-3 py-1.5 rounded-lg border border-[var(--fg)]/12 text-[var(--fg)]/60 hover:text-[var(--fg)] text-xs transition-colors">
                      Editar
                    </button>
                    <button onClick={() => excluir(g)}
                      className="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400/70 hover:text-red-400 text-xs transition-colors">
                      Excluir
                    </button>
                  </div>
                </div>
              ))}

              {tarefasDisponiveis.length === 0 ? (
                <p className="text-[var(--fg)]/30 text-xs">
                  Adicione tarefas ao cliente antes de criar um grupo.
                </p>
              ) : (
                <button onClick={abrirNovo}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 text-sm font-semibold transition-colors">
                  + Novo grupo
                </button>
              )}
            </>
          )}

          {emForm && (
            <>
              <div>
                <label className={labelCls}>Nome do grupo</label>
                <input value={nome} onChange={e => setNome(e.target.value)} className={inputCls} placeholder="Ex.: Movimento mensal" />
              </div>

              <div>
                <label className={labelCls}>Tarefas ({selecionadas.size} selecionada{selecionadas.size === 1 ? '' : 's'})</label>
                <div className="space-y-1.5 mt-2">
                  {tarefasDisponiveis.map(tipo => {
                    const outroGrupo = grupoDeOutraTarefa(tipo)
                    return (
                      <label key={tipo}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${
                          outroGrupo ? 'border-[var(--fg)]/5 opacity-40 cursor-not-allowed' : 'border-[var(--fg)]/8 bg-[var(--fg)]/2 cursor-pointer'
                        }`}>
                        <input type="checkbox" checked={selecionadas.has(tipo)} disabled={!!outroGrupo}
                          onChange={() => toggleTarefa(tipo)} className="w-4 h-4 accent-[var(--accent)]" />
                        <span className="text-sm text-[var(--fg)] flex-1">{tipo}</span>
                        {outroGrupo && <span className="text-[10px] text-[var(--fg)]/30">em &quot;{outroGrupo.nome}&quot;</span>}
                      </label>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {erroForm && emForm && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">⚠ {erroForm}</div>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          {emForm ? (
            <>
              <button onClick={() => setEditando(null)}
                className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
                Voltar
              </button>
              <button onClick={confirmar} disabled={salvando || !nome.trim() || selecionadas.size === 0}
                className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Confirmar'}
              </button>
            </>
          ) : (
            <button onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
