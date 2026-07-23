'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { LinkRapido } from '@/lib/types'
import { criarLink, atualizarLink, excluirLink } from '@/app/(comum)/intranet/actions'

interface Props {
  links: LinkRapido[]
  isAdmin: boolean
}

function getDomain(url: string) {
  try { return new URL(url.startsWith('http') ? url : `https://${url}`).hostname } catch { return '' }
}

const inputCls = "w-full px-2.5 py-1.5 rounded-lg bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-xs focus:outline-none focus:border-[var(--accent)]/50"

export default function LinksRapidos({ links, isAdmin }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [editando, setEditando] = useState(false)
  const [edits, setEdits] = useState<Record<string, { titulo: string; url: string }>>({})
  const [novoTitulo, setNovoTitulo] = useState('')
  const [novoUrl, setNovoUrl] = useState('')
  const [erro, setErro] = useState('')

  const ativos = links.filter(l => l.ativo).sort((a, b) => a.ordem - b.ordem)

  function campo(link: LinkRapido) {
    return edits[link.id] ?? { titulo: link.titulo, url: link.url }
  }

  function handleSalvar(link: LinkRapido) {
    const { titulo, url } = campo(link)
    setErro('')
    startTransition(async () => {
      const result = await atualizarLink(link.id, titulo.trim(), url.trim())
      if (result.error) { setErro(result.error); return }
      setEdits(prev => {
        const { [link.id]: _removido, ...resto } = prev
        return resto
      })
      router.refresh()
    })
  }

  function handleExcluir(id: string) {
    if (!confirm('Excluir este link?')) return
    startTransition(async () => {
      await excluirLink(id)
      setEdits(prev => {
        const { [id]: _removido, ...resto } = prev
        return resto
      })
      router.refresh()
    })
  }

  function handleAdicionar() {
    setErro('')
    startTransition(async () => {
      const result = await criarLink(novoTitulo.trim(), novoUrl.trim())
      if (result.error) { setErro(result.error); return }
      setNovoTitulo('')
      setNovoUrl('')
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest">
          Links Úteis
        </h2>
        {isAdmin && (
          <button
            onClick={() => {
              setEditando(v => !v)
              setEdits({})
              setErro('')
            }}
            className="text-xs text-[var(--fg)]/40 hover:text-[var(--fg)]/70 border border-[var(--fg)]/10 hover:border-[var(--fg)]/20 px-2.5 py-1 rounded-lg transition-colors"
          >
            {editando ? 'Concluir edição' : 'Editar links'}
          </button>
        )}
      </div>

      {erro && <p className="text-red-400 text-xs mb-3">{erro}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {ativos.map(link => {
          if (editando) {
            const { titulo, url } = campo(link)
            return (
              <div key={link.id} className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--fg)]/4 border border-[var(--fg)]/8">
                <input
                  value={titulo}
                  onChange={e => setEdits(prev => ({ ...prev, [link.id]: { titulo: e.target.value, url: campo(link).url } }))}
                  placeholder="Título"
                  className={inputCls}
                />
                <input
                  value={url}
                  onChange={e => setEdits(prev => ({ ...prev, [link.id]: { titulo: campo(link).titulo, url: e.target.value } }))}
                  placeholder="URL"
                  className={inputCls}
                />
                <div className="flex gap-2">
                  <button onClick={() => handleSalvar(link)} disabled={isPending || !titulo.trim() || !url.trim()}
                    className="flex-1 py-1 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] text-xs font-semibold hover:bg-[var(--accent)]/30 transition-colors disabled:opacity-40">
                    Salvar
                  </button>
                  <button onClick={() => handleExcluir(link.id)} disabled={isPending}
                    className="px-3 py-1 rounded-lg border border-[var(--fg)]/10 text-[var(--fg)]/40 hover:text-red-400 hover:border-red-400/30 text-xs transition-colors disabled:opacity-40">
                    Excluir
                  </button>
                </div>
              </div>
            )
          }

          const domain = getDomain(link.url)
          return (
            <a
              key={link.id}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col justify-center p-4 rounded-xl bg-[var(--fg)]/4 border border-[var(--fg)]/8 hover:bg-[var(--fg)]/7 hover:border-[var(--fg)]/15 transition-all group"
            >
              <p className="text-[var(--fg)] text-sm font-medium leading-tight truncate group-hover:text-[var(--accent)] transition-colors">
                {link.titulo}
              </p>
              <p className="text-[var(--fg)]/30 text-xs truncate mt-0.5">{domain}</p>
            </a>
          )
        })}

        {editando && (
          <div className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--fg)]/2 border border-dashed border-[var(--fg)]/15">
            <input
              value={novoTitulo}
              onChange={e => setNovoTitulo(e.target.value)}
              placeholder="Título"
              className={inputCls}
            />
            <input
              value={novoUrl}
              onChange={e => setNovoUrl(e.target.value)}
              placeholder="URL"
              className={inputCls}
            />
            <button onClick={handleAdicionar} disabled={isPending || !novoTitulo.trim() || !novoUrl.trim()}
              className="py-1 rounded-lg bg-[var(--accent)]/20 border border-[var(--accent)]/40 text-[var(--accent)] text-xs font-semibold hover:bg-[var(--accent)]/30 transition-colors disabled:opacity-40">
              + Adicionar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
