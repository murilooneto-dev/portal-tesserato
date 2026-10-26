'use client'

import { useState, useTransition, useRef } from 'react'
import { FileSpreadsheet, Paperclip, X } from 'lucide-react'
import { uploadArquivo, excluirArquivo } from '@/app/fiscal/clientes/actions'
import { Card } from '@/components/ui/Card'
import { IconButton } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { MESES } from '@/lib/mes-navegacao'
import type { Competencia } from '@/lib/planilha-competencia'

interface Arquivo {
  id: string
  name: string
  size: number
  uploaded_at: string
  competencia: Competencia | null
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

interface Grupo { chave: string; titulo: string; arquivos: Arquivo[] }

// Agrupa pelo mês da planilha, do mais recente ao mais antigo; sem mês identificado vai por último.
function agruparPorMes(arquivos: Arquivo[]): Grupo[] {
  const grupos = new Map<string, Grupo>()
  for (const arq of arquivos) {
    const c = arq.competencia
    const chave = c ? `${c.ano}-${String(c.mes).padStart(2, '0')}` : 'sem-mes'
    if (!grupos.has(chave)) {
      grupos.set(chave, { chave, titulo: c ? `${MESES[c.mes - 1]}/${c.ano}` : 'Mês não identificado', arquivos: [] })
    }
    grupos.get(chave)!.arquivos.push(arq)
  }
  return [...grupos.values()].sort((a, b) =>
    a.chave === 'sem-mes' ? 1 : b.chave === 'sem-mes' ? -1 : b.chave.localeCompare(a.chave))
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
            competencia: result.competencia ?? null,
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
        <div className="flex flex-col gap-4">
          {agruparPorMes(arquivos).map(grupo => (
            <section key={grupo.chave} aria-label={grupo.titulo}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-3">
                {grupo.titulo} · {grupo.arquivos.length} {grupo.arquivos.length === 1 ? 'planilha' : 'planilhas'}
              </h3>
              <ul className="flex flex-col gap-2">
                {grupo.arquivos.map(arq => (
                  <li key={arq.id} className="flex items-center gap-3 rounded-[10px] border border-line-soft p-3">
                    {arq.competencia ? (
                      <span className="flex h-11 w-11 flex-none flex-col items-center justify-center rounded-lg bg-acc-soft text-acc-text leading-none" aria-hidden="true">
                        <span className="text-xs font-bold uppercase">{MESES[arq.competencia.mes - 1].slice(0, 3)}</span>
                        <span className="mt-0.5 text-xs">{String(arq.competencia.ano).slice(2)}</span>
                      </span>
                    ) : (
                      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-lg bg-neutral-soft text-fg-3" aria-hidden="true">
                        <FileSpreadsheet size={20} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <a href={`/api/arquivos/client/${arq.id}`} target="_blank" rel="noopener noreferrer" title={arq.name}
                        className="block truncate text-sm text-fg hover:underline">
                        {arq.name}
                      </a>
                      <p className="text-xs text-fg-3">
                        {formatBytes(arq.size)} · enviado em {new Date(arq.uploaded_at).toLocaleDateString('pt-BR')}
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
            </section>
          ))}
        </div>
      )}
    </Card>
  )
}
