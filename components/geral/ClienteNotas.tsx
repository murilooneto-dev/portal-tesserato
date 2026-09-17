'use client'

import { useState, useTransition } from 'react'
import type { ClienteNota } from '@/lib/cliente-notas'

interface Props {
  clienteId: string
  setor: 'contabil' | 'pessoal'
  notas: ClienteNota[]
  podeEditar: boolean
  adicionarNota: (clienteId: string, texto: string) => Promise<{ error?: string }>
  editarNota: (notaId: string, clienteId: string, texto: string) => Promise<{ error?: string }>
  excluirNota: (notaId: string, clienteId: string) => Promise<{ error?: string }>
}

function formatarDataHora(iso: string): string {
  const data = new Date(iso)
  const dd = String(data.getDate()).padStart(2, '0')
  const mm = String(data.getMonth() + 1).padStart(2, '0')
  const yyyy = data.getFullYear()
  const hh = String(data.getHours()).padStart(2, '0')
  const min = String(data.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`
}

export default function ClienteNotas({ clienteId, notas, podeEditar, adicionarNota, editarNota, excluirNota }: Props) {
  const [novoTexto, setNovoTexto] = useState('')
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [textoEdicao, setTextoEdicao] = useState('')
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAdicionar() {
    if (!novoTexto.trim()) return
    startTransition(async () => {
      const result = await adicionarNota(clienteId, novoTexto)
      if (result.error) {
        setErro(result.error)
        return
      }
      setErro(null)
      setNovoTexto('')
    })
  }

  function iniciarEdicao(nota: ClienteNota) {
    setEditandoId(nota.id)
    setTextoEdicao(nota.texto)
    setErro(null)
  }

  function handleSalvarEdicao(notaId: string) {
    if (!textoEdicao.trim()) return
    startTransition(async () => {
      const result = await editarNota(notaId, clienteId, textoEdicao)
      if (result.error) {
        setErro(result.error)
        return
      }
      setErro(null)
      setEditandoId(null)
    })
  }

  function handleExcluir(notaId: string) {
    startTransition(() => { excluirNota(notaId, clienteId) })
    setExcluindoId(null)
  }

  return (
    <div className="mt-6 pt-5 border-t border-[var(--fg)]/8">
      <label className="text-xs font-semibold text-[var(--fg)]/40 uppercase tracking-widest">
        Observações
      </label>

      {podeEditar && (
        <div className="flex flex-col gap-2 mt-2">
          <textarea
            value={novoTexto}
            onChange={e => setNovoTexto(e.target.value)}
            rows={2}
            placeholder="Adicionar observação..."
            className="w-full bg-[var(--fg)]/5 border border-[var(--fg)]/10 rounded-xl px-4 py-2.5 text-sm text-[var(--fg)] placeholder-[var(--fg)]/20 resize-none focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
          />
          <div className="flex justify-end">
            <button
              onClick={handleAdicionar}
              disabled={isPending || !novoTexto.trim()}
              className="text-xs bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] px-3 py-1.5 rounded-lg hover:bg-[var(--accent)]/30 transition-all disabled:opacity-50"
            >
              Adicionar
            </button>
          </div>
        </div>
      )}

      {erro && <p className="text-red-400 text-xs mt-2">{erro}</p>}

      <div className="flex flex-col gap-2 mt-3">
        {notas.length === 0 && (
          <p className="text-sm text-[var(--fg)]/20">Nenhuma observação.</p>
        )}
        {notas.map(nota => (
          <div key={nota.id} className="px-3 py-2.5 rounded-xl border bg-[var(--fg)]/3 border-[var(--fg)]/8">
            {editandoId === nota.id ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={textoEdicao}
                  onChange={e => setTextoEdicao(e.target.value)}
                  rows={2}
                  className="w-full bg-[var(--fg)]/5 border border-[var(--fg)]/10 rounded-xl px-3 py-2 text-sm text-[var(--fg)] resize-none focus:outline-none focus:border-[var(--accent)]/50 transition-colors"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditandoId(null)}
                    className="text-[10px] text-[var(--fg)]/40 hover:text-[var(--fg)] px-2 py-1 rounded-md border border-[var(--fg)]/10 transition-all">
                    Cancelar
                  </button>
                  <button onClick={() => handleSalvarEdicao(nota.id)} disabled={isPending || !textoEdicao.trim()}
                    className="text-[10px] bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] px-2 py-1 rounded-md hover:bg-[var(--accent)]/30 transition-all disabled:opacity-50">
                    Salvar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-yellow-400/80 whitespace-pre-wrap">{nota.texto}</p>
                  <p className="text-[10px] text-[var(--fg)]/25 mt-1">
                    {formatarDataHora(nota.created_at)} · {nota.usuario_nome}
                    {nota.updated_at && ' (editado)'}
                  </p>
                </div>
                {podeEditar && (
                  excluindoId === nota.id ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => handleExcluir(nota.id)}
                        className="text-[10px] bg-red-500/20 border border-red-500/40 text-red-400 px-2 py-1 rounded-md">Confirmar</button>
                      <button onClick={() => setExcluindoId(null)}
                        className="text-[10px] text-[var(--fg)]/40 px-1">Cancelar</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => iniciarEdicao(nota)}
                        className="text-[10px] text-[var(--fg)]/30 hover:text-[var(--fg)]/70 transition-colors">Editar</button>
                      <button onClick={() => setExcluindoId(nota.id)}
                        className="text-[var(--fg)]/25 hover:text-red-400 text-xs transition-colors">×</button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
