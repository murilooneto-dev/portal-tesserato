'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { criarMovimento, listarFinanceiroTiposAtivos, listarFinanceiroCentrosCustoAtivos } from '@/lib/financeiro-actions'
import type { FinanceiroNatureza, FinanceiroTipo, FinanceiroCentroCusto } from '@/lib/types'

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

  useEffect(() => {
    (async () => {
      const [tiposResult, centrosResult] = await Promise.all([
        listarFinanceiroTiposAtivos(natureza),
        listarFinanceiroCentrosCustoAtivos(),
      ])
      setTipos(tiposResult.data)
      setCentrosCusto(centrosResult.data)
      setCarregando(false)
    })()
  }, [natureza])

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">{titulo}</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div>
            <label className={labelCls}>Tipo *</label>
            <select className={inputCls} value={tipoId} onChange={e => setTipoId(e.target.value)} disabled={carregando}>
              <option value="" className="bg-[var(--bg-surface)]">Selecione...</option>
              {tipos.map(t => (
                <option key={t.id} value={t.id} className="bg-[var(--bg-surface)]">{t.nome}</option>
              ))}
            </select>
            {!carregando && tipos.length === 0 && (
              <p className="text-[10px] text-[var(--fg)]/40 mt-1.5">
                Nenhum tipo cadastrado ainda. Cadastre em Configurações → Financeiro.
              </p>
            )}
          </div>

          <div>
            <label className={labelCls}>Valor *</label>
            <input className={inputCls} type="number" step="0.01" min="0.01" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
          </div>

          <div>
            <label className={labelCls}>Data *</label>
            <input className={inputCls} type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Centro de custo</label>
            <select className={inputCls} value={centroCustoId} onChange={e => setCentroCustoId(e.target.value)} disabled={carregando}>
              <option value="" className="bg-[var(--bg-surface)]">Nenhum</option>
              {centrosCusto.map(c => (
                <option key={c.id} value={c.id} className="bg-[var(--bg-surface)]">{c.nome}</option>
              ))}
            </select>
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
