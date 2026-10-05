'use client'

import { useState, useTransition } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { ClienteNota } from '@/lib/cliente-notas'
import { Card } from '@/components/ui/Card'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Textarea } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'

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
  const [adicionando, setAdicionando] = useState(false)
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
      setAdicionando(false)
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

  const botaoAdicionar = podeEditar && !adicionando ? (
    <Button variante="fantasma" tamanho="p" icone={<Plus size={15} aria-hidden="true" />} onClick={() => { setAdicionando(true); setErro(null) }} className="max-sm:h-11">
      Adicionar
    </Button>
  ) : undefined

  return (
    <Card titulo="Observações" acoes={botaoAdicionar}>
      <div className="flex flex-col gap-3">
        {podeEditar && adicionando && (
          <div className="flex flex-col gap-2.5">
            <Field rotulo="Nova observação">
              {({ id }) => (
                <Textarea
                  id={id}
                  autoFocus
                  value={novoTexto}
                  onChange={e => setNovoTexto(e.target.value)}
                  rows={3}
                  placeholder="Escreva a observação…"
                />
              )}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variante="fantasma" tamanho="p" onClick={() => { setAdicionando(false); setNovoTexto('') }} disabled={isPending} className="max-sm:h-11">Cancelar</Button>
              <Button variante="primario" tamanho="p" onClick={handleAdicionar} disabled={!novoTexto.trim()} carregando={isPending} className="max-sm:h-11">Salvar</Button>
            </div>
          </div>
        )}

        {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

        {notas.length === 0 && !adicionando && (
          <p className="text-[13px] text-fg-3">Nenhuma observação. As notas ficam com data e autor.</p>
        )}

        {notas.length > 0 && (
          <ul className="flex flex-col">
            {notas.map(nota => (
              <li key={nota.id} className="border-b border-line-soft py-3 first:pt-0 last:border-b-0 last:pb-0">
                {editandoId === nota.id ? (
                  <div className="flex flex-col gap-2.5">
                    <Field rotulo="Editar observação">
                      {({ id }) => (
                        <Textarea id={id} autoFocus value={textoEdicao} onChange={e => setTextoEdicao(e.target.value)} rows={3} />
                      )}
                    </Field>
                    <div className="flex justify-end gap-2">
                      <Button variante="fantasma" tamanho="p" onClick={() => setEditandoId(null)} className="max-sm:h-11">Cancelar</Button>
                      <Button variante="primario" tamanho="p" onClick={() => handleSalvarEdicao(nota.id)} disabled={!textoEdicao.trim()} carregando={isPending} className="max-sm:h-11">Salvar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-wrap break-words text-sm text-fg">{nota.texto}</p>
                      <p className="mt-1 text-xs text-fg-3">
                        {formatarDataHora(nota.created_at)} · {nota.usuario_nome}
                        {nota.updated_at && ' (editado)'}
                      </p>
                    </div>
                    {podeEditar && (
                      excluindoId === nota.id ? (
                        <div className="flex flex-none items-center gap-1.5">
                          <Button variante="perigo-solido" tamanho="p" onClick={() => handleExcluir(nota.id)} className="max-sm:h-11">Excluir</Button>
                          <Button variante="fantasma" tamanho="p" onClick={() => setExcluindoId(null)} className="max-sm:h-11">Cancelar</Button>
                        </div>
                      ) : (
                        <div className="flex flex-none items-center">
                          <IconButton rotulo="Editar observação" icone={<Pencil size={15} aria-hidden="true" />} onClick={() => iniciarEdicao(nota)} className="h-8 w-8 max-sm:h-11 max-sm:w-11" />
                          <IconButton rotulo="Excluir observação" icone={<Trash2 size={15} aria-hidden="true" />} onClick={() => setExcluindoId(nota.id)} className="h-8 w-8 hover:text-danger max-sm:h-11 max-sm:w-11" />
                        </div>
                      )
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
