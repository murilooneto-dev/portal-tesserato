// app/admin/configuracoes/societario/DocumentacoesTab.tsx
'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { FileText, Plus, Trash2, Upload } from 'lucide-react'
import {
  listarDocumentacaoModelos,
  criarDocumentacaoModelo,
  excluirDocumentacaoModelo,
  type DocumentacaoModeloResumo,
} from '@/lib/documentacao-modelos-actions'
import { Card } from '@/components/ui/Card'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentacoesTab() {
  const confirmar = useConfirmar()
  const avisar = useToast()
  const [itens, setItens] = useState<DocumentacaoModeloResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [novoNome, setNovoNome] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const seletor = useRef<HTMLInputElement>(null)

  // O estado já começa em "carregando": só grava estado depois que a consulta
  // volta (a tabela fica na tela enquanto atualiza).
  const aplicar = useCallback(({ data, error }: Awaited<ReturnType<typeof listarDocumentacaoModelos>>) => {
    if (error) setErro(error)
    else { setItens(data); setErro(null) }
    setCarregando(false)
  }, [])

  const recarregar = useCallback(async () => aplicar(await listarDocumentacaoModelos()), [aplicar])

  useEffect(() => {
    let ativo = true
    listarDocumentacaoModelos().then(r => { if (ativo) aplicar(r) })
    return () => { ativo = false }
  }, [aplicar])

  async function handleCriar() {
    if (!novoNome.trim() || !arquivo || salvando) return
    setSalvando(true)
    const formData = new FormData()
    formData.append('arquivo', arquivo)
    const { error } = await criarDocumentacaoModelo(novoNome, formData)
    setSalvando(false)
    if (error) { setErro(error); return }
    setErro(null)
    setNovoNome('')
    setArquivo(null)
    if (seletor.current) seletor.current.value = ''
    avisar('Modelo criado.', 'ok')
    await recarregar()
  }

  async function handleExcluir(item: DocumentacaoModeloResumo) {
    const ok = await confirmar({
      titulo: `Excluir o modelo de documentação "${item.nome}"?`,
      descricao: 'Essa ação não pode ser desfeita.',
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    setExcluindoId(item.id)
    const { error } = await excluirDocumentacaoModelo(item.id)
    setExcluindoId(null)
    if (error) { setErro(error); return }
    setErro(null)
    avisar('Modelo excluído.', 'ok')
    await recarregar()
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Card titulo="Novo modelo de documentação">
        <div className="flex flex-wrap items-end gap-3.5">
          <Field rotulo="Nome do modelo" obrigatorio className="min-w-[14rem] flex-1">
            {c => (
              <Input
                id={c.id}
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCriar() }}
                placeholder="Ex.: Contrato social padrão"
              />
            )}
          </Field>
          <Field rotulo="Arquivo" className="max-w-full">
            {c => (
              <div className="flex min-h-9 flex-wrap items-center gap-2.5">
                <input
                  ref={seletor}
                  id={c.id}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={e => setArquivo(e.target.files?.[0] ?? null)}
                />
                <Button icone={<Upload size={16} aria-hidden="true" />} onClick={() => seletor.current?.click()}>
                  Escolher arquivo
                </Button>
                {arquivo ? (
                  <span className="min-w-0 max-w-[16rem] truncate text-[13px] text-fg-2" title={arquivo.name}>
                    {arquivo.name} ({formatarTamanho(arquivo.size)})
                  </span>
                ) : (
                  <span className="text-[13px] text-fg-3">.pdf, .docx, .xls, .xlsx, .png ou .jpg</span>
                )}
              </div>
            )}
          </Field>
          <Button
            variante="primario"
            icone={<Plus size={16} aria-hidden="true" />}
            onClick={handleCriar}
            carregando={salvando}
            disabled={!novoNome.trim() || !arquivo}
          >
            {salvando ? 'Enviando…' : 'Criar modelo'}
          </Button>
        </div>
      </Card>

      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

      <Card semPadding className="overflow-hidden">
        {carregando ? (
          <p className="px-[18px] py-4 text-sm text-fg-3">Carregando…</p>
        ) : itens.length === 0 ? (
          <EmptyState icone={<FileText size={24} />} titulo="Nenhum modelo de documentação cadastrado ainda." />
        ) : (
          <div className="relative overflow-x-auto xl:overflow-visible">
            <Tabela className="min-w-[440px]">
              <thead>
                <tr>
                  <Th>Modelo</Th>
                  <Th largura={140}>Tamanho</Th>
                  <Th largura={56}><span className="sr-only">Ações</span></Th>
                </tr>
              </thead>
              <tbody>
                {itens.map(item => (
                  <tr key={item.id}>
                    <Td>
                      <a
                        href={`/api/arquivos/documentacao/${item.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-2.5 font-semibold text-fg transition-colors hover:text-acc-text"
                      >
                        <FileText size={16} aria-hidden="true" className="flex-none text-fg-3" />
                        <span className="truncate">{item.nome}</span>
                      </a>
                    </Td>
                    <Td><span className="tabular-nums text-fg-2">{formatarTamanho(item.size)}</span></Td>
                    <Td alinhar="dir" className="px-2">
                      <IconButton
                        rotulo={`Excluir modelo ${item.nome}`}
                        icone={<Trash2 size={16} aria-hidden="true" />}
                        onClick={() => handleExcluir(item)}
                        disabled={excluindoId === item.id}
                      />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>
    </div>
  )
}
