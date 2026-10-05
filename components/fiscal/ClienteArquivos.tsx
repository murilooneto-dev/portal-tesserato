'use client'

import { useState, useTransition, useRef } from 'react'
import { FileSpreadsheet, Paperclip, X } from 'lucide-react'
import { uploadArquivo, excluirArquivo } from '@/app/fiscal/clientes/actions'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConfirmar } from '@/components/ui/ConfirmDialog'

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
  const confirmar = useConfirmar()

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
    const ok = await confirmar({ titulo: 'Remover este arquivo?', descricao: 'A planilha deixa de estar anexada ao cliente.', textoConfirmar: 'Remover', perigo: true })
    if (!ok) return
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
    <Card
      titulo="Planilhas anexadas"
      acoes={podeEditar ? (
        <label className={`inline-flex h-[30px] cursor-pointer items-center gap-2 rounded-[7px] border border-line bg-raised px-2.5 text-[13px] font-medium text-fg transition-colors hover:border-fg-3 focus-within:ring-2 focus-within:ring-acc ${isPending ? 'pointer-events-none opacity-45' : ''}`}>
          <Paperclip size={14} aria-hidden="true" />
          {isPending ? 'Enviando...' : 'Anexar'}
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx,.csv"
            multiple
            className="sr-only"
            onChange={handleUpload}
            disabled={isPending}
          />
        </label>
      ) : undefined}
    >
      {erro && <p role="alert" className="mb-3 whitespace-pre-line text-[13px] text-danger">{erro}</p>}

      {arquivos.length === 0 ? (
        <EmptyState
          compacto
          icone={<FileSpreadsheet size={20} />}
          titulo="Nenhuma planilha anexada"
          descricao="Anexe a planilha de DTE (.xls, .xlsx ou .csv) para liberar a conferência de chaves."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {arquivos.map(arq => (
            <li key={arq.id} className="flex items-center gap-3 rounded-[10px] border border-line-soft p-3">
              <span className="flex-none text-ok" aria-hidden="true"><FileSpreadsheet size={20} /></span>
              <div className="min-w-0 flex-1">
                <a href={`/api/arquivos/client/${arq.id}`} target="_blank" rel="noopener noreferrer"
                  className="block truncate text-sm text-fg hover:underline">
                  {arq.name}
                </a>
                <p className="text-xs text-fg-3">
                  {formatBytes(arq.size)} · {new Date(arq.uploaded_at).toLocaleDateString('pt-BR')}
                </p>
              </div>
              {podeEditar && (
                <IconButton
                  rotulo={`Remover ${arq.name}`}
                  icone={<X size={16} aria-hidden="true" />}
                  onClick={() => handleExcluir(arq.id)}
                  disabled={isPending}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
