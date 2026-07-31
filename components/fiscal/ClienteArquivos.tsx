'use client'

import { useState, useTransition, useRef } from 'react'
import { uploadArquivo, excluirArquivo } from '@/app/fiscal/clientes/actions'

interface Arquivo {
  id: string
  name: string
  size: number
  uploaded_at: string
}

interface Props {
  clienteId: string
  arquivosIniciais: Arquivo[]
  podeEditar: boolean
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ClienteArquivos({ clienteId, arquivosIniciais, podeEditar }: Props) {
  const [arquivos, setArquivos] = useState<Arquivo[]>(arquivosIniciais)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setErro('')

    startTransition(async () => {
      const novos: typeof arquivos = []
      const erros: string[] = []

      for (const file of files) {
        const formData = new FormData()
        formData.append('arquivo', file)
        const result = await uploadArquivo(clienteId, formData)
        if (result.error || !result.id) {
          erros.push(`${file.name}: ${result.error ?? 'Falha ao enviar'}`)
        } else {
          novos.push({
            id: result.id,
            name: file.name,
            size: file.size,
            uploaded_at: result.uploaded_at ?? new Date().toISOString(),
          })
        }
      }

      if (novos.length) setArquivos(prev => [...prev, ...novos])
      if (erros.length) setErro(erros.join('\n'))
      if (inputRef.current) inputRef.current.value = ''
    })
  }

  async function handleExcluir(id: string) {
    if (!confirm('Remover este arquivo?')) return
    startTransition(async () => {
      const result = await excluirArquivo(id)
      if (result?.error) {
        setErro(result.error)
        return
      }
      setArquivos(prev => prev.filter(a => a.id !== id))
    })
  }

  return (
    <div className="mt-8 pt-6 border-t border-[var(--fg)]/8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-[var(--fg)]/40 uppercase tracking-widest">
          Planilhas Anexadas
        </h3>
        {podeEditar && (
          <label className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
            isPending
              ? 'opacity-50 pointer-events-none'
              : 'bg-[var(--accent)]/15 border-[var(--accent)]/40 text-[var(--accent)] hover:bg-[var(--accent)]/25'
          }`}>
            {isPending ? 'Enviando...' : '+ Anexar'}
            <input
              ref={inputRef}
              type="file"
              accept=".xls,.xlsx,.csv"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={isPending}
            />
          </label>
        )}
      </div>

      {erro && <p className="text-red-400 text-xs mb-3">{erro}</p>}

      {arquivos.length === 0 ? (
        <p className="text-[var(--fg)]/20 text-sm">Nenhuma planilha anexada.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {arquivos.map(arq => (
            <div key={arq.id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--fg)]/3 border border-[var(--fg)]/8 group">
              <span className="text-green-400 text-lg flex-shrink-0">📊</span>
              <div className="flex-1 min-w-0">
                <a href={`/api/arquivos/client/${arq.id}`} target="_blank" rel="noopener noreferrer"
                  className="text-[var(--fg)] text-sm truncate block hover:underline">
                  {arq.name}
                </a>
                <p className="text-[var(--fg)]/30 text-xs">
                  {formatBytes(arq.size)} · {new Date(arq.uploaded_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              {podeEditar && (
                <button
                  onClick={() => handleExcluir(arq.id)}
                  disabled={isPending}
                  className="text-[var(--fg)]/20 hover:text-red-400 text-sm px-2 py-1 rounded-lg border border-[var(--fg)]/10 hover:border-red-400/30 transition-all opacity-0 group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
