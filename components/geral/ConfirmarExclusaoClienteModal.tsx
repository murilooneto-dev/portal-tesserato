'use client'

import { useState } from 'react'
import { confirmacaoExclusaoValida, type ImpactoExclusao } from '@/lib/exclusao-cliente'

interface Props {
  nomeCliente: string
  impacto: ImpactoExclusao
  // Executa a exclusão. Erro esperado volta em `error`; sucesso é `error: null`
  // (quem chama navega/fecha depois, então o modal não se fecha sozinho).
  onConfirmar: () => Promise<{ error: string | null }>
  onCancelar: () => void
}

// Modal único de confirmação de exclusão de cliente (Fiscal, Contábil,
// Pessoal e tela Geral). As regras (o que exigir, o que avisar) vêm de
// lib/exclusao-cliente.ts; aqui só há interface.
export default function ConfirmarExclusaoClienteModal({ nomeCliente, impacto, onConfirmar, onCancelar }: Props) {
  const [nomeDigitado, setNomeDigitado] = useState('')
  const [palavraDigitada, setPalavraDigitada] = useState('')
  const [executando, setExecutando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const valido = confirmacaoExclusaoValida(impacto.nivel, nomeCliente, nomeDigitado, palavraDigitada)

  async function confirmar() {
    if (!valido || executando) return
    setExecutando(true)
    setErro(null)
    try {
      const { error } = await onConfirmar()
      if (error) { setErro(error); setExecutando(false) }
    } catch {
      setErro('Não foi possível concluir a exclusão. Tente novamente.')
      setExecutando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && !executando && onCancelar()}>
      <div role="dialog" aria-modal="true" aria-label={impacto.titulo}
        className="bg-[var(--bg-surface)] border border-red-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-[var(--fg)] font-bold text-base mb-1">{impacto.titulo}</h2>
        <p className="text-[var(--fg)]/60 text-sm mb-3">{impacto.descricao}</p>

        <ul className="mb-4 space-y-1 text-xs text-[var(--fg)]/50 list-disc pl-5">
          {impacto.detalhes.map(d => <li key={d}>{d}</li>)}
        </ul>

        <p className="text-[var(--fg)]/50 text-sm mb-4">
          Esta ação não pode ser desfeita.{' '}
          {impacto.exigeDeletar
            ? <>Pra confirmar, digite o nome do cliente e a palavra <span className="text-red-400 font-semibold">DELETAR</span> abaixo.</>
            : <>Pra confirmar, digite o nome do cliente abaixo.</>}
        </p>

        <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">
          Nome do cliente: <span className="text-[var(--fg)]/60 normal-case">{nomeCliente}</span>
        </label>
        <input
          type="text"
          value={nomeDigitado}
          onChange={e => setNomeDigitado(e.target.value)}
          placeholder="Digite o nome exatamente como acima"
          autoComplete="off"
          className="w-full mb-3 px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-red-500/50"
        />

        {impacto.exigeDeletar && (
          <>
            <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">
              Digite DELETAR
            </label>
            <input
              type="text"
              value={palavraDigitada}
              onChange={e => setPalavraDigitada(e.target.value)}
              placeholder="DELETAR"
              autoComplete="off"
              className="w-full mb-3 px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-red-500/50"
            />
          </>
        )}

        {erro && <p className="text-red-400 text-xs mb-3">{erro}</p>}

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onCancelar}
            disabled={executando}
            className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)] px-4 py-2 rounded-lg border border-[var(--fg)]/10 transition-all disabled:opacity-40">
            Cancelar
          </button>
          <button
            onClick={confirmar}
            disabled={!valido || executando}
            className="text-xs bg-red-500/20 border border-red-500/40 text-red-300 px-4 py-2 rounded-lg hover:bg-red-500/30 transition-all disabled:opacity-40">
            {executando ? 'Excluindo...' : impacto.rotuloBotao}
          </button>
        </div>
      </div>
    </div>
  )
}
