'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarVinculo, excluirVinculo } from './actions'
import { SETORES, SETOR_LABEL, type UserSetor, type TarefaVinculo } from '@/lib/types'

interface Props {
  vinculosIniciais: TarefaVinculo[]
  tiposPorSetor: Record<string, string[]>
}

const selectCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function VinculosClient({ vinculosIniciais, tiposPorSetor }: Props) {
  const router = useRouter()

  const [setorOrigem, setSetorOrigem] = useState<UserSetor>('fiscal')
  const [tipoOrigem, setTipoOrigem] = useState('')
  const [setorDestino, setSetorDestino] = useState<UserSetor>('contabil')
  const [tipoDestino, setTipoDestino] = useState('')
  const [saving, setSaving] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  async function handleCriar() {
    if (!tipoOrigem || !tipoDestino) return
    setSaving(true)
    setErro(null)
    const { error } = await criarVinculo({
      setorOrigem,
      tipoOrigem,
      setorDestino,
      tipoDestino,
    })
    setSaving(false)
    if (error) { setErro(error); return }
    setTipoOrigem('')
    setTipoDestino('')
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
      <p className="text-sm text-[var(--fg)]/40 mb-6">Quando a tarefa de origem é concluída, a tarefa de destino (do mesmo cliente, outro setor) mostra um aviso de liberada.</p>

      <div className="rounded-2xl border border-[var(--fg)]/10 bg-[var(--fg)]/3 p-5 mb-8">
        <p className="text-xs font-bold text-[var(--fg)]/50 uppercase tracking-widest mb-4">Novo vínculo</p>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-[var(--fg)]/70 text-sm font-medium">Origem</p>
            <div>
              <label className={labelCls}>Setor</label>
              <select className={selectCls} value={setorOrigem}
                onChange={e => { setSetorOrigem(e.target.value as UserSetor); setTipoOrigem('') }}>
                {SETORES.map(s => <option key={s} value={s} className="bg-[var(--bg-surface)]">{SETOR_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tarefa</label>
              <select className={selectCls} value={tipoOrigem} onChange={e => setTipoOrigem(e.target.value)}
                disabled={tiposOrigemDisponiveis.length === 0}>
                <option value="" className="bg-[var(--bg-surface)]">
                  {tiposOrigemDisponiveis.length === 0 ? 'Nenhuma tarefa nesse setor' : 'Selecionar...'}
                </option>
                {tiposOrigemDisponiveis.map(t => <option key={t} value={t} className="bg-[var(--bg-surface)]">{t}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[var(--fg)]/70 text-sm font-medium">Destino</p>
            <div>
              <label className={labelCls}>Setor</label>
              <select className={selectCls} value={setorDestino}
                onChange={e => { setSetorDestino(e.target.value as UserSetor); setTipoDestino('') }}>
                {SETORES.map(s => <option key={s} value={s} className="bg-[var(--bg-surface)]">{SETOR_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Tarefa</label>
              <select className={selectCls} value={tipoDestino} onChange={e => setTipoDestino(e.target.value)}
                disabled={tiposDestinoDisponiveis.length === 0}>
                <option value="" className="bg-[var(--bg-surface)]">
                  {tiposDestinoDisponiveis.length === 0 ? 'Nenhuma tarefa nesse setor' : 'Selecionar...'}
                </option>
                {tiposDestinoDisponiveis.map(t => <option key={t} value={t} className="bg-[var(--bg-surface)]">{t}</option>)}
              </select>
            </div>
          </div>
        </div>

        {erro && (
          <div className="mt-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <button onClick={handleCriar} disabled={saving || !tipoOrigem || !tipoDestino}
          className="mt-4 px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
          {saving ? 'Salvando...' : '+ Criar vínculo'}
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
