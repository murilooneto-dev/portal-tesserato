'use client'

import { useState } from 'react'

interface Props {
  clienteNome: string
  onClose: () => void
  onConfirm: (senha: string) => Promise<{ error?: string }>
  onConfirmado: () => void
}

export default function DesabilitarClienteModal({ clienteNome, onClose, onConfirm, onConfirmado }: Props) {
  const [nomeDigitado, setNomeDigitado] = useState('')
  const [senha, setSenha] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const confirmacaoValida = nomeDigitado.trim() === clienteNome && senha.length > 0

  async function handleConfirmar() {
    if (!confirmacaoValida) return
    setEnviando(true)
    setErro(null)
    try {
      const resultado = await onConfirm(senha)
      if (resultado.error) {
        setErro(resultado.error)
        return
      }
      onConfirmado()
      onClose()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-amber-500/30 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-[var(--fg)] font-bold text-base mb-1">Desabilitar cliente</h2>
        <p className="text-[var(--fg)]/50 text-sm mb-4">
          Dali pra frente esse cliente sai das listas ativas e das contagens de tarefas/empresas do mês. O histórico já salvo continua intacto e você pode reabilitar quando quiser. Pra confirmar, digite o nome do cliente e sua senha de login abaixo.
        </p>

        <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">
          Nome do cliente: <span className="text-[var(--fg)]/60 normal-case">{clienteNome}</span>
        </label>
        <input
          type="text"
          value={nomeDigitado}
          onChange={e => setNomeDigitado(e.target.value)}
          placeholder="Digite o nome exatamente como acima"
          className="w-full mb-3 px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-amber-500/50"
        />

        <label className="block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5">
          Sua senha de login
        </label>
        <input
          type="password"
          value={senha}
          onChange={e => setSenha(e.target.value)}
          placeholder="Senha"
          className="w-full mb-2 px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-amber-500/50"
        />

        {erro && <p className="text-red-400 text-xs mb-3">{erro}</p>}

        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={onClose}
            className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)] px-4 py-2 rounded-lg border border-[var(--fg)]/10 transition-all">
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={!confirmacaoValida || enviando}
            className="text-xs bg-amber-500/20 border border-amber-500/40 text-amber-300 px-4 py-2 rounded-lg hover:bg-amber-500/30 transition-all disabled:opacity-40">
            {enviando ? 'Desabilitando...' : 'Desabilitar'}
          </button>
        </div>
      </div>
    </div>
  )
}
