'use client'

import { useState } from 'react'
import { criarTipoTarefa } from '@/lib/tarefa-tipos-actions'
import { mesesVisiveisDaPeriodicidade, type Periodicidade } from '@/lib/tarefas-societario-periodicidade'
import type { UserSetor, TipoResposta } from '@/lib/types'

type Formato = 'data' | 'texto' | 'opcoes' | 'checklist'

interface Props {
  nome: string
  setor: UserSetor
  // Só true quando chamado a partir do catálogo global de admin
  // (app/admin/configuracoes/TarefasTab.tsx), onde um tipo criado deve
  // virar padrão (ClienteGeralModal.tsx filtra .eq('padrao', true) ao
  // provisionar cliente novo). Nos demais call sites (criação ad-hoc a
  // partir do cadastro de um cliente específico) permanece false.
  padrao?: boolean
  onCancel: () => void
  onCriado: (nome: string) => void
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

const FORMATOS_BASE: { value: Formato; label: string; desc: string }[] = [
  { value: 'data', label: 'Data', desc: 'Checkbox simples com data de conclusão' },
  { value: 'texto', label: 'Texto + anexo', desc: 'Campo de texto livre e/ou upload de arquivos' },
  { value: 'opcoes', label: 'Opções', desc: 'Lista de etapas nomeadas, cada uma com seu checkbox' },
]

const FORMATO_CHECKLIST: { value: Formato; label: string; desc: string } =
  { value: 'checklist', label: 'Checkbox com Opções', desc: 'Lista de opções; marcando todas, conclui a tarefa automaticamente' }

const PERIODICIDADES: { value: Periodicidade; label: string }[] = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'bimestral', label: 'Bimestral (Jan/Mar/Mai/Jul/Set/Nov)' },
  { value: 'trimestral', label: 'Trimestral (Jan/Abr/Jul/Out)' },
  { value: 'semestral', label: 'Semestral (Jan/Jul)' },
  { value: 'anual', label: 'Anual (Jan)' },
]

export default function NovoTipoTarefaModal({ nome, setor, padrao = false, onCancel, onCriado }: Props) {
  const FORMATOS = setor === 'contabil' ? [...FORMATOS_BASE, FORMATO_CHECKLIST] : FORMATOS_BASE
  const [formato, setFormato] = useState<Formato>('data')
  const [etapas, setEtapas] = useState<string[]>([])
  const [novaEtapa, setNovaEtapa] = useState('')
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>('mensal')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const temEtapas = formato === 'opcoes' || formato === 'checklist'

  function addEtapa() {
    const e = novaEtapa.trim()
    if (!e) return
    setEtapas(prev => [...prev, e])
    setNovaEtapa('')
  }

  async function handleCriar() {
    if (temEtapas && etapas.length === 0) return
    setSalvando(true)
    setErro(null)
    const tipoResposta: TipoResposta = formato === 'checklist' ? 'checklist' : formato === 'texto' ? 'texto' : 'data'
    const etapasFinal = temEtapas ? etapas : null
    const mesesVisiveis = setor === 'societario' ? mesesVisiveisDaPeriodicidade(periodicidade) : null
    try {
      const { error } = await criarTipoTarefa(setor, nome, tipoResposta, etapasFinal, padrao, mesesVisiveis)
      if (error) { setErro(error); return }
      onCriado(nome)
    } catch {
      setErro('Não foi possível criar o tipo. Tente novamente.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">Novo tipo de tarefa</h2>
          <button onClick={onCancel} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <p className="text-[var(--fg)]/60 text-sm">
            &quot;<span className="font-semibold text-[var(--fg)]">{nome}</span>&quot; ainda não existe no catálogo. Escolha o formato de resposta:
          </p>

          {setor === 'societario' && (
            <div>
              <label className={labelCls}>Periodicidade</label>
              <select value={periodicidade} onChange={e => setPeriodicidade(e.target.value as Periodicidade)} className={inputCls}>
                {PERIODICIDADES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-2">
            {FORMATOS.map(f => (
              <label key={f.value}
                className={`flex items-start gap-3 cursor-pointer px-4 py-3 rounded-xl border transition-all ${
                  formato === f.value ? 'border-[var(--accent)]/50 bg-[var(--accent)]/8' : 'border-[var(--fg)]/8 bg-[var(--fg)]/2'
                }`}>
                <input type="radio" name="formato" checked={formato === f.value}
                  onChange={() => setFormato(f.value)} className="mt-0.5 accent-[var(--accent)]" />
                <span>
                  <span className="block text-sm font-semibold text-[var(--fg)]">{f.label}</span>
                  <span className="block text-xs text-[var(--fg)]/40">{f.desc}</span>
                </span>
              </label>
            ))}
          </div>

          {temEtapas && (
            <div className="rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-4">
              <label className={labelCls}>{formato === 'checklist' ? 'Opções' : 'Etapas'} ({etapas.length})</label>
              <div className="flex flex-wrap gap-1.5 mb-3 mt-2 min-h-[32px]">
                {etapas.map((e, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-xs bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--fg)] px-2.5 py-1 rounded-lg">
                    {e}
                    <button type="button" onClick={() => setEtapas(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-[var(--fg)]/40 hover:text-red-400 transition-colors font-bold">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={novaEtapa} onChange={e => setNovaEtapa(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addEtapa())}
                  placeholder="Digitar nome da etapa e pressionar Enter..."
                  className={inputCls + ' flex-1 text-xs'} />
                <button type="button" onClick={addEtapa}
                  className="px-4 py-2 rounded-xl bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/30 text-xs font-semibold transition-colors whitespace-nowrap">
                  + Adicionar
                </button>
              </div>
            </div>
          )}
        </div>

        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
            Cancelar
          </button>
          <button onClick={handleCriar} disabled={salvando || (temEtapas && etapas.length === 0)}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
            {salvando ? 'Criando...' : 'Criar tipo'}
          </button>
        </div>
      </div>
    </div>
  )
}
