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
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function ClienteArquivos({ clienteId, arquivosIniciais }: Props) {
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
        if (result.error) {
          erros.push(`${file.name}: ${result.error}`)
        } else {
          novos.push({
            id: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            uploaded_at: new Date().toISOString(),
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
      await excluirArquivo(id)
      setArquivos(prev => prev.filter(a => a.id !== id))
    })
  }

  return (
    <div className="mt-8 pt-6 border-t border-white/8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
          Planilhas Anexadas
        </h3>
        <label className={`text-xs px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
          isPending
            ? 'opacity-50 pointer-events-none'
            : 'bg-[#00B8D4]/15 border-[#00B8D4]/40 text-[#00B8D4] hover:bg-[#00B8D4]/25'
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
      </div>

      {erro && <p className="text-red-400 text-xs mb-3">{erro}</p>}

      {arquivos.length === 0 ? (
        <p className="text-white/20 text-sm">Nenhuma planilha anexada.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {arquivos.map(arq => (
            <div key={arq.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/8 group">
              <span className="text-green-400 text-lg flex-shrink-0">📊</span>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{arq.name}</p>
                <p className="text-white/30 text-xs">
                  {formatBytes(arq.size)} · {new Date(arq.uploaded_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <button
                onClick={() => handleExcluir(arq.id)}
                disabled={isPending}
                className="text-white/20 hover:text-red-400 text-sm px-2 py-1 rounded-lg border border-white/10 hover:border-red-400/30 transition-all opacity-0 group-hover:opacity-100"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
