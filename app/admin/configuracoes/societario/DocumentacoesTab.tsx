// app/admin/configuracoes/societario/DocumentacoesTab.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  listarDocumentacaoModelos,
  criarDocumentacaoModelo,
  excluirDocumentacaoModelo,
  type DocumentacaoModeloResumo,
} from '@/lib/documentacao-modelos-actions'

const inputCls = "px-3 py-2 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentacoesTab() {
  const [itens, setItens] = useState<DocumentacaoModeloResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [novoNome, setNovoNome] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)

  const recarregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await listarDocumentacaoModelos()
    if (error) setErro(error)
    else { setItens(data); setErro(null) }
    setCarregando(false)
  }, [])

  useEffect(() => { recarregar() }, [recarregar])

  async function handleCriar() {
    if (!novoNome.trim() || !arquivo) return
    setSalvando(true)
    const formData = new FormData()
    formData.append('arquivo', arquivo)
    const { error } = await criarDocumentacaoModelo(novoNome, formData)
    setSalvando(false)
    if (error) { setErro(error); return }
    setErro(null)
    setNovoNome('')
    setArquivo(null)
    await recarregar()
  }

  async function handleExcluir(item: DocumentacaoModeloResumo) {
    if (!confirm(`Excluir o modelo de documentação "${item.nome}"? Essa ação não pode ser desfeita.`)) return
    const { error } = await excluirDocumentacaoModelo(item.id)
    if (error) { setErro(error); return }
    setErro(null)
    await recarregar()
  }

  return (
    <div>
      <div className="rounded-xl border border-[var(--fg)]/8 bg-[var(--fg)]/2 p-4 mb-6">
        <label className={labelCls}>Nome do modelo</label>
        <input
          value={novoNome}
          onChange={e => setNovoNome(e.target.value)}
          placeholder="Ex.: Contrato social padrão"
          className={inputCls + ' w-full mb-4'}
        />

        <label className={labelCls}>Arquivo</label>
        <div className="flex items-center gap-3 mb-4 mt-2">
          <label className="inline-block text-xs px-3 py-2 rounded-lg border border-[var(--fg)]/12 text-[var(--fg)]/60 hover:text-[var(--fg)] cursor-pointer transition-colors">
            + Selecionar arquivo
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"
              className="hidden"
              onChange={e => setArquivo(e.target.files?.[0] ?? null)}
            />
          </label>
          {arquivo && (
            <span className="text-xs text-[var(--fg)]/70">{arquivo.name} ({formatarTamanho(arquivo.size)})</span>
          )}
        </div>

        <button
          onClick={handleCriar}
          disabled={salvando || !novoNome.trim() || !arquivo}
          className="px-5 py-2 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {salvando ? 'Enviando...' : '+ Criar modelo'}
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
        <p className="text-[var(--fg)]/40 text-sm">Nenhum modelo de documentação cadastrado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {itens.map(item => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8">
              <div className="flex-1">
                <a
                  href={`/api/arquivos/documentacao/${item.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--fg)] hover:text-[var(--accent)] transition-colors"
                >
                  {item.nome}
                </a>
                <span className="block text-xs text-[var(--fg)]/40">{formatarTamanho(item.size)}</span>
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
