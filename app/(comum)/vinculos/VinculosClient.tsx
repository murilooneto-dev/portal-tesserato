'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarVinculos, excluirVinculo } from './actions'
import { calcularNovosPares } from '@/lib/vinculos'
import { SETORES, SETOR_LABEL, type UserSetor, type TarefaVinculo } from '@/lib/types'

interface Props {
  vinculosIniciais: TarefaVinculo[]
  tiposPorSetor: Record<string, string[]>
}

const selectCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"
const checkboxRowCls = "flex items-center gap-2 cursor-pointer select-none py-1"

export default function VinculosClient({ vinculosIniciais, tiposPorSetor }: Props) {
  const router = useRouter()

  const [setorOrigem, setSetorOrigem] = useState<UserSetor>('fiscal')
  const [tiposOrigem, setTiposOrigem] = useState<string[]>([])
  const [setorDestino, setSetorDestino] = useState<UserSetor>('contabil')
  const [tiposDestino, setTiposDestino] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  function toggleTipo(lista: string[], setLista: (v: string[]) => void, tipo: string) {
    setLista(lista.includes(tipo) ? lista.filter(t => t !== tipo) : [...lista, tipo])
  }

  async function handleCriar() {
    if (tiposOrigem.length === 0 || tiposDestino.length === 0) return
    const pares = calcularNovosPares(setorOrigem, tiposOrigem, setorDestino, tiposDestino, vinculosIniciais)
    if (pares.length === 0) {
      setErro('Todos os vínculos selecionados já existem no catálogo.')
      return
    }
    setSaving(true)
    setErro(null)
    const { error } = await criarVinculos({ setorOrigem, setorDestino, pares })
    setSaving(false)
    if (error) { setErro(error); return }
    setTiposOrigem([])
    setTiposDestino([])
    router.refresh()
  }

  async function handleExcluir(id: string) {
    setExcluindoId(id)
    const { error } = await excluirVinculo(id)
    setExcluindoId(null)
    if (error) { setErro(error); return }
    router.refresh()
  }

  const tiposOrigemDisponiveis = tiposPorSetor[setorOrigem] ?? []
  const tiposDestinoDisponiveis = tiposPorSetor[setorDestino] ?? []

  return (
    <div>
      <h1 className="text-2xl font-bold text-[var(--fg)] mb-1">Vínculos de Tarefas</h1>
      <p className="text-sm text-[var(--fg)]/40 mb-6">Quando a(s) tarefa(s) de origem são concluídas, a tarefa de destino (do mesmo cliente, outro setor) mostra um aviso de liberada. Marque mais de uma tarefa dos dois lados pra criar vários vínculos de uma vez.</p>

      <div className="rounded-2xl border border-[var(--fg)]/10 bg-[var(--fg)]/3 p-5 mb-8">
        <p className="text-xs font-bold text-[var(--fg)]/50 uppercase tracking-widest mb-4">Novo vínculo</p>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-[var(--fg)]/70 text-sm font-medium">Origem</p>
            <div>
              <label className={labelCls}>Setor</label>
              <select className={selectCls} value={setorOrigem}
                onChange={e => { setSetorOrigem(e.target.value as UserSetor); setTiposOrigem([]) }}>
                {SETORES.map(s => <option key={s} value={s} className="bg-[var(--bg-surface)]">{SETOR_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tarefas</label>
              {tiposOrigemDisponiveis.length === 0 ? (
                <p className="text-[var(--fg)]/30 text-xs">Nenhuma tarefa nesse setor.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--fg)]/10 px-3 py-2">
                  {tiposOrigemDisponiveis.map(t => (
                    <label key={t} className={checkboxRowCls}>
                      <input type="checkbox" checked={tiposOrigem.includes(t)}
                        onChange={() => toggleTipo(tiposOrigem, setTiposOrigem, t)}
                        className="w-3.5 h-3.5 accent-[var(--accent)]" />
                      <span className="text-[var(--fg)]/80 text-sm">{t}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[var(--fg)]/70 text-sm font-medium">Destino</p>
            <div>
              <label className={labelCls}>Setor</label>
              <select className={selectCls} value={setorDestino}
                onChange={e => { setSetorDestino(e.target.value as UserSetor); setTiposDestino([]) }}>
                {SETORES.map(s => <option key={s} value={s} className="bg-[var(--bg-surface)]">{SETOR_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tarefas</label>
              {tiposDestinoDisponiveis.length === 0 ? (
                <p className="text-[var(--fg)]/30 text-xs">Nenhuma tarefa nesse setor.</p>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--fg)]/10 px-3 py-2">
                  {tiposDestinoDisponiveis.map(t => (
                    <label key={t} className={checkboxRowCls}>
                      <input type="checkbox" checked={tiposDestino.includes(t)}
                        onChange={() => toggleTipo(tiposDestino, setTiposDestino, t)}
                        className="w-3.5 h-3.5 accent-[var(--accent)]" />
                      <span className="text-[var(--fg)]/80 text-sm">{t}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {erro && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <button onClick={handleCriar} disabled={saving || tiposOrigem.length === 0 || tiposDestino.length === 0}
          className="mt-4 px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
          {saving ? 'Salvando...' : `+ Criar vínculo${tiposOrigem.length * tiposDestino.length > 1 ? `s (${tiposOrigem.length * tiposDestino.length})` : ''}`}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {vinculosIniciais.length === 0 && (
          <p className="text-center text-[var(--fg)]/30 py-8 text-sm">Nenhum vínculo cadastrado ainda.</p>
        )}
        {vinculosIniciais.map(v => (
          <div key={v.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8">
            <div className="flex-1 text-sm text-[var(--fg)]">
              <span className="font-medium">{v.tipo_origem}</span>
              <span className="text-[var(--fg)]/40"> ({SETOR_LABEL[v.setor_origem]})</span>
              <span className="text-[var(--fg)]/30 mx-2">→</span>
              <span className="font-medium">{v.tipo_destino}</span>
              <span className="text-[var(--fg)]/40"> ({SETOR_LABEL[v.setor_destino]})</span>
            </div>
            <button onClick={() => handleExcluir(v.id)} disabled={excluindoId === v.id}
              className="text-xs bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-red-400/70 hover:text-red-400 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
              {excluindoId === v.id ? 'Removendo...' : 'Excluir'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
