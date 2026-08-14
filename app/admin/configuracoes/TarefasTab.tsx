// app/admin/configuracoes/TarefasTab.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import type { UserSetor } from '@/lib/types'
import { listarTarefaTiposDoSetor, type TarefaTipoResumo } from '@/lib/tarefa-tipo-vinculos-actions'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'

interface Props {
  setor: UserSetor
}

const inputCls = "px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"

export default function TarefasTab({ setor }: Props) {
  const [itens, setItens] = useState<TarefaTipoResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [mostrarModal, setMostrarModal] = useState(false)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await listarTarefaTiposDoSetor(setor)
    if (error) setErro(error)
    else { setItens(data); setErro(null) }
    setCarregando(false)
  }, [setor])

  useEffect(() => { recarregar() }, [recarregar])

  return (
    <div>
      <div className="flex gap-2 mb-6">
        <input
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && novoNome.trim() && setMostrarModal(true)}
          placeholder="Nova tarefa..."
          className={inputCls + ' flex-1'}
        />
        <button
          onClick={() => novoNome.trim() && setMostrarModal(true)}
          disabled={!novoNome.trim()}
          className="px-5 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          + Criar
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
        <p className="text-[var(--fg)]/40 text-sm">Nenhuma tarefa cadastrada nesse setor ainda.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map(item => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8">
              <span className={`flex-1 text-sm ${item.ativo ? 'text-[var(--fg)]' : 'text-[var(--fg)]/30 line-through'}`}>
                {item.nome}
              </span>
            </li>
          ))}
        </ul>
      )}

      {mostrarModal && (
        <NovoTipoTarefaModal
          nome={novoNome}
          setor={setor}
          padrao={true}
          onCancel={() => setMostrarModal(false)}
          onCriado={() => { setMostrarModal(false); setNovoNome(''); recarregar() }}
        />
      )}
    </div>
  )
}
