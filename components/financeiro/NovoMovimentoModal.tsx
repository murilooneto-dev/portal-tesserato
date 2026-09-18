'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  criarMovimento, listarFinanceiroTiposAtivos, listarFinanceiroCentrosCustoAtivos,
  criarFinanceiroTipo, criarFinanceiroCentroCusto,
} from '@/lib/financeiro-actions'
import { normalizarNome } from '@/lib/config-entidades'
import type { FinanceiroNatureza, FinanceiroTipo, FinanceiroCentroCusto } from '@/lib/types'
import SeletorComBusca from './SeletorComBusca'

interface Props {
  natureza: FinanceiroNatureza
  onClose: () => void
}

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function NovoMovimentoModal({ natureza, onClose }: Props) {
  const router = useRouter()
  const [tipos, setTipos] = useState<FinanceiroTipo[]>([])
  const [centrosCusto, setCentrosCusto] = useState<FinanceiroCentroCusto[]>([])
  const [carregando, setCarregando] = useState(true)

  const [tipoId, setTipoId] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState('')
  const [centroCustoId, setCentroCustoId] = useState('')
  const [observacao, setObservacao] = useState('')

  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [criandoTipo, setCriandoTipo] = useState(false)
  const [novoTipoNome, setNovoTipoNome] = useState('')
  const [salvandoTipo, setSalvandoTipo] = useState(false)
  const [erroTipo, setErroTipo] = useState<string | null>(null)

  const [criandoCentro, setCriandoCentro] = useState(false)
  const [novoCentroNome, setNovoCentroNome] = useState('')
  const [salvandoCentro, setSalvandoCentro] = useState(false)
  const [erroCentro, setErroCentro] = useState<string | null>(null)

  const recarregarTipos = useCallback(async () => {
    const resultado = await listarFinanceiroTiposAtivos(natureza)
    setTipos(resultado.data)
    return resultado.data
  }, [natureza])

  const recarregarCentros = useCallback(async () => {
    const resultado = await listarFinanceiroCentrosCustoAtivos(natureza)
    setCentrosCusto(resultado.data)
    return resultado.data
  }, [natureza])

  useEffect(() => {
    (async () => {
      await Promise.all([recarregarTipos(), recarregarCentros()])
      setCarregando(false)
    })()
  }, [recarregarTipos, recarregarCentros])

  async function handleCriarTipo() {
    if (!novoTipoNome.trim()) return
    setSalvandoTipo(true)
    setErroTipo(null)
    const { error } = await criarFinanceiroTipo(natureza, novoTipoNome)
    if (error) {
      setErroTipo(error)
      setSalvandoTipo(false)
      return
    }
    const nomeCriado = novoTipoNome.trim()
    const atualizados = await recarregarTipos()
    const criado = atualizados.find(t => normalizarNome(t.nome) === normalizarNome(nomeCriado))
    if (criado) setTipoId(criado.id)
    setNovoTipoNome('')
    setCriandoTipo(false)
    setSalvandoTipo(false)
  }

  async function handleCriarCentro() {
    if (!novoCentroNome.trim()) return
    setSalvandoCentro(true)
    setErroCentro(null)
    const { error } = await criarFinanceiroCentroCusto(natureza, novoCentroNome)
    if (error) {
      setErroCentro(error)
      setSalvandoCentro(false)
      return
    }
    const nomeCriado = novoCentroNome.trim()
    const atualizados = await recarregarCentros()
    const criado = atualizados.find(c => normalizarNome(c.nome) === normalizarNome(nomeCriado))
    if (criado) setCentroCustoId(criado.id)
    setNovoCentroNome('')
    setCriandoCentro(false)
    setSalvandoCentro(false)
  }

  async function handleSave() {
    const valorNumerico = Number(valor.replace(',', '.'))
    if (!tipoId) { setErro('Selecione o tipo.'); return }
    if (!data) { setErro('Selecione a data.'); return }
    if (!Number.isFinite(valorNumerico) || valorNumerico <= 0) { setErro('Informe um valor válido.'); return }

    setSaving(true)
    setErro(null)

    const resultado = await criarMovimento({
      natureza,
      tipoId,
      centroCustoId: centroCustoId || null,
      valor: valorNumerico,
      data,
      observacao: observacao.trim() || null,
    })

    if ('error' in resultado) {
      setSaving(false)
      setErro(resultado.error)
      return
    }

    setSaving(false)
    router.refresh()
    onClose()
  }

  const titulo = natureza === 'entrada' ? 'Novo recebimento' : 'Novo pagamento'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">{titulo}</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div>
            <label className={labelCls}>Data *</label>
            <input className={inputCls} type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelCls + ' mb-0'}>Tipo *</label>
              <button type="button" onClick={() => setCriandoTipo(v => !v)} className="text-[10px] font-semibold text-[var(--accent)] hover:underline">
                {criandoTipo ? 'Cancelar' : '+ Novo tipo'}
              </button>
            </div>
            {criandoTipo ? (
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={novoTipoNome}
                  onChange={e => setNovoTipoNome(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCriarTipo()}
                  placeholder="Nome do novo tipo"
                  autoFocus
                />
                <button type="button" onClick={handleCriarTipo} disabled={salvandoTipo || !novoTipoNome.trim()}
                  className="px-4 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50 shrink-0">
                  Criar
                </button>
              </div>
            ) : (
              <SeletorComBusca value={tipoId} onChange={setTipoId} opcoes={tipos} placeholder="Selecione..." disabled={carregando} />
            )}
            {erroTipo && <p className="text-[10px] text-red-400 mt-1.5">{erroTipo}</p>}
            {!criandoTipo && !carregando && tipos.length === 0 && (
              <p className="text-[10px] text-[var(--fg)]/40 mt-1.5">Nenhum tipo cadastrado ainda.</p>
            )}
          </div>

          <div>
            <label className={labelCls}>Valor *</label>
            <input className={inputCls} type="number" step="0.01" min="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={labelCls + ' mb-0'}>Centro de custo</label>
              <button type="button" onClick={() => setCriandoCentro(v => !v)} className="text-[10px] font-semibold text-[var(--accent)] hover:underline">
                {criandoCentro ? 'Cancelar' : '+ Novo centro de custo'}
              </button>
            </div>
            {criandoCentro ? (
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  value={novoCentroNome}
                  onChange={e => setNovoCentroNome(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCriarCentro()}
                  placeholder="Nome do novo centro de custo"
                  autoFocus
                />
                <button type="button" onClick={handleCriarCentro} disabled={salvandoCentro || !novoCentroNome.trim()}
                  className="px-4 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50 shrink-0">
                  Criar
                </button>
              </div>
            ) : (
              <SeletorComBusca value={centroCustoId} onChange={setCentroCustoId} opcoes={centrosCusto} placeholder="Nenhum" disabled={carregando} />
            )}
            {erroCentro && <p className="text-[10px] text-red-400 mt-1.5">{erroCentro}</p>}
          </div>

          <div>
            <label className={labelCls}>Observação</label>
            <textarea className={inputCls} rows={2} value={observacao} onChange={e => setObservacao(e.target.value)} />
          </div>
        </div>

        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          <button onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving || !tipoId || !data || !valor}
            className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
