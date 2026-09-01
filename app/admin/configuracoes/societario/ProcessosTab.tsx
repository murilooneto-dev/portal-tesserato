// app/admin/configuracoes/societario/ProcessosTab.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  listarProcessoTipos,
  criarProcessoTipo,
  excluirProcessoTipo,
  type ProcessoTipoResumo,
} from '@/lib/processo-tipos-actions'
import type { EtapaForm } from '@/lib/processo-tipos'

const inputCls = "px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function ProcessosTab() {
  const [itens, setItens] = useState<ProcessoTipoResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [novoNome, setNovoNome] = useState('')
  const [etapas, setEtapas] = useState<string[]>([])
  const [novaEtapa, setNovaEtapa] = useState('')
  const [salvando, setSalvando] = useState(false)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await listarProcessoTipos()
    if (error) setErro(error)
    else { setItens(data); setErro(null) }
    setCarregando(false)
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  function addEtapa() {
    const e = novaEtapa.trim()
    if (!e) return
    setEtapas(prev => [...prev, e])
    setNovaEtapa('')
  }

  async function handleCriar() {
    if (!novoNome.trim() || etapas.length === 0) return
    setSalvando(true)
    const etapasForm: EtapaForm[] = etapas.map(nome => ({
      nome,
      subetapas: [],
    }))
    const { error } = await criarProcessoTipo(novoNome, etapasForm)
    if (error) { setErro(error); setSalvando(false); return }
    setErro(null)
    setNovoNome('')
    setEtapas([])
    setSalvando(false)
    await recarregar()
  }

  async function handleExcluir(item: ProcessoTipoResumo) {
    if (!confirm(`Excluir o tipo de processo "${item.nome}"? Essa ação não pode ser desfeita.`)) return
    const { error } = await excluirProcessoTipo(item.id)
    if (error) { setErro(error); return }
    setErro(null)
    await recarregar()
  }

  return (
    <div>
      <div className="rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-4 mb-6">
        <label className={labelCls}>Nome do tipo de processo</label>
        <input
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          placeholder="Ex.: Abertura de empresa"
          className={inputCls + ' w-full mb-4'}
        />

        <label className={labelCls}>Etapas ({etapas.length})</label>
        <div className="flex flex-wrap gap-1.5 mb-3 mt-2 min-h-[32px]">
          {etapas.map((e, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--fg)] px-2.5 py-1 rounded-lg">
              {e}
              <button type="button" onClick={() => setEtapas(prev => prev.filter((_, idx) => idx !== i))}
                className="text-[var(--fg)]/40 hover:text-red-400 transition-colors font-bold">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 mb-4">
          <input value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEtapa())}
            placeholder="Digitar nome da etapa e pressionar Enter..."
            className={inputCls + ' flex-1 text-xs'} />
          <button type="button" onClick={addEtapa}
            className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 text-xs font-semibold transition-colors whitespace-nowrap">
            + Adicionar
          </button>
        </div>

        <button
          onClick={handleCriar}
          disabled={salvando || !novoNome.trim() || etapas.length === 0}
          className="px-5 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {salvando ? 'Criando...' : '+ Criar tipo de processo'}
        </button>
      </div>

      {erro && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          ⚠ {erro}
        </div>
      )}

      {carregando ? (
        <p className="text-[var(--fg)]/40 text-sm">Carregando...</p>
      ) : itens.length === 0 ? (
        <p className="text-[var(--fg)]/40 text-sm">Nenhum tipo de processo cadastrado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map(item => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8">
              <div className="flex-1">
                <span className="block text-sm text-[var(--fg)]">{item.nome}</span>
                <span className="block text-xs text-[var(--fg)]/40">
                  {(item.etapas ?? []).length} etapa{(item.etapas ?? []).length === 1 ? '' : 's'}
                </span>
              </div>

              <button onClick={() => handleExcluir(item)} className="text-xs text-red-400/70 hover:text-red-400">
                Excluir
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
