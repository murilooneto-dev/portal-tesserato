// app/admin/configuracoes/societario/ProcessosTab.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  listarProcessoTipos,
  criarProcessoTipo,
  excluirProcessoTipo,
} from '@/lib/processo-tipos-actions'
import {
  adicionarEtapa,
  removerEtapa,
  adicionarSubetapa,
  removerSubetapa,
  type EtapaForm,
  type SubetapaTipoResposta,
  type ProcessoTipoResumo,
} from '@/lib/processo-tipos'

const inputCls = "px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

const FORMATOS_SUBETAPA: { value: SubetapaTipoResposta; label: string }[] = [
  { value: 'texto', label: 'Texto + anexo' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'data', label: 'Data' },
]

function labelFormato(tipo: SubetapaTipoResposta): string {
  return FORMATOS_SUBETAPA.find(f => f.value === tipo)?.label ?? tipo
}

function EtapaBloco({ etapa, onRemoverEtapa, onAdicionarSubetapa, onRemoverSubetapa }: {
  etapa: EtapaForm
  onRemoverEtapa: () => void
  onAdicionarSubetapa: (nome: string, tipoResposta: SubetapaTipoResposta) => void
  onRemoverSubetapa: (subetapaIndex: number) => void
}) {
  const [novaSubetapa, setNovaSubetapa] = useState('')
  const [formato, setFormato] = useState<SubetapaTipoResposta>('texto')

  function adicionar() {
    if (!novaSubetapa.trim()) return
    onAdicionarSubetapa(novaSubetapa, formato)
    setNovaSubetapa('')
  }

  return (
    <div className="rounded-lg border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-3 mb-2">
      <div className="flex items-center gap-2 mb-2">
        <span className="flex-1 text-sm text-[var(--fg)]">{etapa.nome}</span>
        <button type="button" onClick={onRemoverEtapa}
          className="text-[var(--fg)]/40 hover:text-red-400 transition-colors font-bold">×</button>
      </div>

      {etapa.subetapas.length > 0 && (
        <ul className="space-y-1 mb-2">
          {etapa.subetapas.map((sub, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-[var(--fg)]/70 pl-3">
              <span className="flex-1">{sub.nome}</span>
              <span className="px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-semibold">
                {labelFormato(sub.tipoResposta)}
              </span>
              <button type="button" onClick={() => onRemoverSubetapa(i)}
                className="text-[var(--fg)]/30 hover:text-red-400 transition-colors font-bold">×</button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1.5 mb-1.5">
        {FORMATOS_SUBETAPA.map(f => (
          <button key={f.value} type="button" onClick={() => setFormato(f.value)}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
              formato === f.value ? 'bg-[var(--accent)] text-[var(--fg)]' : 'bg-[var(--fg)]/5 text-[var(--fg)]/50 hover:text-[var(--fg)]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={novaSubetapa} onChange={e => setNovaSubetapa(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), adicionar())}
          placeholder="Nome da subetapa..."
          className={inputCls + ' flex-1 text-xs'} />
        <button type="button" onClick={adicionar}
          className="px-3 py-1.5 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 text-[10px] font-semibold transition-colors whitespace-nowrap">
          + Subetapa
        </button>
      </div>
    </div>
  )
}

export default function ProcessosTab() {
  const [itens, setItens] = useState<ProcessoTipoResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [novoNome, setNovoNome] = useState('')
  const [etapas, setEtapas] = useState<EtapaForm[]>([])
  const [novaEtapa, setNovaEtapa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})

  const recarregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await listarProcessoTipos()
    if (error) setErro(error)
    else { setItens(data); setErro(null) }
    setCarregando(false)
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  function addEtapa() {
    setEtapas(prev => adicionarEtapa(prev, novaEtapa))
    setNovaEtapa('')
  }

  async function handleCriar() {
    if (!novoNome.trim() || etapas.length === 0) return
    setSalvando(true)
    const { error } = await criarProcessoTipo(novoNome, etapas)
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

  function toggleExpandido(id: string) {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }))
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
        <div className="mt-2 mb-3">
          {etapas.map((etapa, i) => (
            <EtapaBloco
              key={i}
              etapa={etapa}
              onRemoverEtapa={() => setEtapas(prev => removerEtapa(prev, i))}
              onAdicionarSubetapa={(nome, tipoResposta) => setEtapas(prev => adicionarSubetapa(prev, i, nome, tipoResposta))}
              onRemoverSubetapa={subetapaIndex => setEtapas(prev => removerSubetapa(prev, i, subetapaIndex))}
            />
          ))}
        </div>
        <div className="flex gap-2 mb-4">
          <input value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEtapa())}
            placeholder="Digitar nome da etapa e pressionar Enter..."
            className={inputCls + ' flex-1 text-xs'} />
          <button type="button" onClick={addEtapa}
            className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 text-xs font-semibold transition-colors whitespace-nowrap">
            + Adicionar etapa
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
            <li key={item.id} className="px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => toggleExpandido(item.id)} className="flex-1 text-left">
                  <span className="block text-sm text-[var(--fg)]">{item.nome}</span>
                  <span className="block text-xs text-[var(--fg)]/40">
                    {item.etapas.length} etapa{item.etapas.length === 1 ? '' : 's'}
                  </span>
                </button>
                <button onClick={() => handleExcluir(item)} className="text-xs text-red-400/70 hover:text-red-400">
                  Excluir
                </button>
              </div>

              {expandidos[item.id] && (
                <div className="mt-3 pt-3 border-t border-[var(--fg)]/8 space-y-2">
                  {item.etapas.map((etapa, etapaIndex) => (
                    <div key={etapaIndex}>
                      <span className="block text-xs font-semibold text-[var(--fg)]/70">{etapa.nome}</span>
                      {etapa.subetapas.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-3">
                          {etapa.subetapas.map(sub => (
                            <li key={sub.id} className="flex items-center gap-2 text-xs text-[var(--fg)]/50">
                              <span className="flex-1">{sub.nome}</span>
                              <span className="px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-semibold">
                                {labelFormato(sub.tipoResposta)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
