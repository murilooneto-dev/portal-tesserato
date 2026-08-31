'use client'

import { useEffect, useState } from 'react'
import type { UserSetor } from '@/lib/types'
import {
  listarTarefaTiposDoSetor,
  listarTarefaTipoIdsVinculados,
  listarVinculosAtividadeComRegime,
  definirVinculoAtividadeRegime,
  alternarVinculo,
  type TipoEntidadeVinculo,
  type TarefaTipoResumo,
} from '@/lib/tarefa-tipo-vinculos-actions'
import { listarEntidades, type EntidadeConfig } from '@/lib/config-entidades-actions'

interface Props {
  entidadeTipo: TipoEntidadeVinculo
  entidadeId: string
  entidadeNome: string
  setor: UserSetor
  onClose: () => void
}

const selectCls = "text-xs px-2 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)]/70 focus:outline-none focus:border-[var(--accent)]/50 disabled:opacity-40"

export default function VincularTarefasModal({ entidadeTipo, entidadeId, entidadeNome, setor, onClose }: Props) {
  const [tarefas, setTarefas] = useState<TarefaTipoResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // grupo (vínculo normal) e regime (visão legada, só remoção)
  const [vinculadas, setVinculadas] = useState<Set<string>>(new Set())

  // atividade: tarefaTipoId -> regimeId vinculado (null = todos os regimes)
  const [vinculosAtividade, setVinculosAtividade] = useState<Map<string, string | null>>(new Map())
  const [regimes, setRegimes] = useState<EntidadeConfig[]>([])

  useEffect(() => {
    async function carregar() {
      setCarregando(true)

      if (entidadeTipo === 'atividade') {
        const [tarefasRes, vinculosRes, regimesRes] = await Promise.all([
          listarTarefaTiposDoSetor(setor),
          listarVinculosAtividadeComRegime(entidadeId),
          listarEntidades('regimes', setor),
        ])
        if (tarefasRes.error) setErro(tarefasRes.error)
        else if (vinculosRes.error) setErro(vinculosRes.error)
        else if (regimesRes.error) setErro(regimesRes.error)
        else {
          setTarefas(tarefasRes.data)
          setVinculosAtividade(new Map(vinculosRes.data.map(v => [v.tarefaTipoId, v.regimeId])))
          setRegimes(regimesRes.data)
          setErro(null)
        }
      } else {
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
      }

      setCarregando(false)
    }
    carregar()
  }, [setor, entidadeTipo, entidadeId])

  async function toggleGrupo(tarefaTipoId: string) {
    const jaVinculada = vinculadas.has(tarefaTipoId)
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

  async function handleRemoverLegado(tarefaTipoId: string) {
    const anterior = new Set(vinculadas)
    setVinculadas(prev => { const novo = new Set(prev); novo.delete(tarefaTipoId); return novo })

    const { error } = await alternarVinculo(tarefaTipoId, 'regime', entidadeId, false)
    if (error) { setErro(error); setVinculadas(anterior) }
  }

  async function handleToggleAtividade(tarefaTipoId: string) {
    const jaVinculada = vinculosAtividade.has(tarefaTipoId)
    const anterior = new Map(vinculosAtividade)
    setVinculosAtividade(prev => {
      const novo = new Map(prev)
      jaVinculada ? novo.delete(tarefaTipoId) : novo.set(tarefaTipoId, null)
      return novo
    })

    const { error } = await definirVinculoAtividadeRegime(tarefaTipoId, entidadeId, null, !jaVinculada)
    if (error) { setErro(error); setVinculosAtividade(anterior) }
  }

  async function handleRegimeChange(tarefaTipoId: string, regimeId: string) {
    const valor = regimeId === '' ? null : regimeId
    const anterior = new Map(vinculosAtividade)
    setVinculosAtividade(prev => new Map(prev).set(tarefaTipoId, valor))

    const { error } = await definirVinculoAtividadeRegime(tarefaTipoId, entidadeId, valor, true)
    if (error) { setErro(error); setVinculosAtividade(anterior) }
  }

  const tarefasLegadoRegime = tarefas.filter(t => vinculadas.has(t.id))

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

          ) : entidadeTipo === 'regime' ? (
            <>
              <p className="text-[var(--fg)]/50 text-xs mb-4">
                Vínculo direto por regime foi descontinuado — essas tarefas ainda usam o mecanismo antigo.
                Recrie pela aba Atividade escolhendo a atividade certa e este regime, depois remova daqui.
              </p>
              {tarefasLegadoRegime.length === 0 ? (
                <p className="text-[var(--fg)]/40 text-sm">Nenhum vínculo antigo restante.</p>
              ) : (
                <div className="space-y-2">
                  {tarefasLegadoRegime.map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[var(--fg)]/3">
                      <span className={`flex-1 text-sm ${t.ativo ? 'text-[var(--fg)]' : 'text-[var(--fg)]/30 line-through'}`}>
                        {t.nome}
                      </span>
                      <button onClick={() => handleRemoverLegado(t.id)} className="text-xs text-red-400/70 hover:text-red-400">
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>

          ) : tarefas.length === 0 ? (
            <p className="text-[var(--fg)]/40 text-sm">Nenhuma tarefa cadastrada no catálogo desse setor ainda.</p>

          ) : entidadeTipo === 'atividade' ? (
            <div className="space-y-2">
              {tarefas.map(t => {
                const regimeId = vinculosAtividade.get(t.id)
                const vinculada = vinculosAtividade.has(t.id)
                return (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[var(--fg)]/5">
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={vinculada}
                        onChange={() => handleToggleAtividade(t.id)}
                        className="accent-[var(--accent)]"
                      />
                      <span className={`text-sm ${t.ativo ? 'text-[var(--fg)]' : 'text-[var(--fg)]/30 line-through'}`}>
                        {t.nome}
                      </span>
                    </label>
                    <select
                      value={regimeId ?? ''}
                      onChange={e => handleRegimeChange(t.id, e.target.value)}
                      disabled={!vinculada}
                      className={selectCls}
                    >
                      <option value="">Todos os regimes</option>
                      {regimes.map(r => (
                        <option key={r.id} value={r.id}>{r.nome}</option>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>

          ) : (
            <div className="space-y-2">
              {tarefas.map(t => (
                <label key={t.id} className="flex items-center gap-3 cursor-pointer px-3 py-2 rounded-xl hover:bg-[var(--fg)]/5">
                  <input
                    type="checkbox"
                    checked={vinculadas.has(t.id)}
                    onChange={() => toggleGrupo(t.id)}
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
