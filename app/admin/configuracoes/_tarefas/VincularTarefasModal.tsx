'use client'

import { useEffect, useState } from 'react'
import type { UserSetor } from '@/lib/types'
import {
  listarTarefaTiposDoSetor,
  listarTarefaTipoIdsVinculados,
  alternarVinculo,
  type TipoEntidadeVinculo,
  type TarefaTipoResumo,
} from '@/lib/tarefa-tipo-vinculos-actions'

interface Props {
  entidadeTipo: TipoEntidadeVinculo
  entidadeId: string
  entidadeNome: string
  setor: UserSetor
  onClose: () => void
}

export default function VincularTarefasModal({ entidadeTipo, entidadeId, entidadeNome, setor, onClose }: Props) {
  const [tarefas, setTarefas] = useState<TarefaTipoResumo[]>([])
  const [vinculadas, setVinculadas] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    async function carregar() {
      setCarregando(true)
      const [tarefasRes, vinculosRes] = await Promise.all([
        listarTarefaTiposDoSetor(setor),
        listarTarefaTipoIdsVinculados(entidadeTipo, entidadeId),
      ])
      if (tarefasRes.error) setErro(tarefasRes.error)
      else if (vinculosRes.error) setErro(vinculosRes.error)
      else {
        setTarefas(tarefasRes.data)
        setVinculadas(new Set(vinculosRes.data))
        setErro(null)
      }
      setCarregando(false)
    }
    carregar()
  }, [setor, entidadeTipo, entidadeId])

  async function toggle(tarefaTipoId: string) {
    const jaVinculada = vinculadas.has(tarefaTipoId)
    // Otimista: atualiza a UI antes da resposta, reverte se der erro.
    setVinculadas(prev => {
      const novo = new Set(prev)
      jaVinculada ? novo.delete(tarefaTipoId) : novo.add(tarefaTipoId)
      return novo
    })

    const { error } = await alternarVinculo(tarefaTipoId, entidadeTipo, entidadeId, !jaVinculada)
    if (error) {
      setErro(error)
      setVinculadas(prev => {
        const novo = new Set(prev)
        jaVinculada ? novo.add(tarefaTipoId) : novo.delete(tarefaTipoId)
        return novo
      })
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Tarefas de &quot;{entidadeNome}&quot;</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">
          {erro && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              ⚠ {erro}
            </div>
          )}

          {carregando ? (
            <p className="text-[var(--fg)]/40 text-sm">Carregando...</p>
          ) : tarefas.length === 0 ? (
            <p className="text-[var(--fg)]/40 text-sm">Nenhuma tarefa cadastrada no catálogo desse setor ainda.</p>
          ) : (
            <div className="space-y-2">
              {tarefas.map(t => (
                <label key={t.id} className="flex items-center gap-3 cursor-pointer px-3 py-2 rounded-xl hover:bg-[var(--fg)]/5">
                  <input
                    type="checkbox"
                    checked={vinculadas.has(t.id)}
                    onChange={() => toggle(t.id)}
                    className="accent-[var(--accent)]"
                  />
                  <span className={`text-sm ${t.ativo ? 'text-[var(--fg)]' : 'text-[var(--fg)]/30 line-through'}`}>
                    {t.nome}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm">
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}
