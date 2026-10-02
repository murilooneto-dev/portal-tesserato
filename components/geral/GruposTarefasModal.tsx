'use client'

import { useEffect, useState } from 'react'
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  listarGruposCliente,
  criarGrupoTarefas,
  atualizarGrupoTarefas,
  excluirGrupoTarefas,
} from '@/lib/tarefa-grupos-actions'
import type { UserSetor, TarefaGrupo } from '@/lib/types'
import { Modal } from '@/components/ui/Modal'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Checkbox } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { cn } from '@/components/ui/cn'

interface Props {
  clienteId: string
  setor: UserSetor
  tarefasDisponiveis: string[]
  onClose: () => void
}

export default function GruposTarefasModal({ clienteId, setor, tarefasDisponiveis, onClose }: Props) {
  const confirmar = useConfirmar()
  const [grupos, setGrupos] = useState<TarefaGrupo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erroLista, setErroLista] = useState<string | null>(null)

  const [editando, setEditando] = useState<TarefaGrupo | null | 'novo'>(null)
  const [nome, setNome] = useState('')
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState<string | null>(null)

  // Carga inicial: o estado já começa em "carregando", então o efeito só
  // grava estado quando a promessa resolve (nunca de forma síncrona).
  useEffect(() => {
    let ativo = true
    listarGruposCliente(clienteId, setor).then(({ data, error }) => {
      if (!ativo) return
      if (error) setErroLista(error)
      else setGrupos(data)
      setCarregando(false)
    })
    return () => { ativo = false }
  }, [clienteId, setor])

  async function carregar() {
    setCarregando(true)
    const { data, error } = await listarGruposCliente(clienteId, setor)
    if (error) setErroLista(error)
    else setGrupos(data)
    setCarregando(false)
  }

  function abrirNovo() {
    setEditando('novo')
    setNome('')
    setSelecionadas(new Set())
    setErroForm(null)
  }

  function abrirEdicao(grupo: TarefaGrupo) {
    setEditando(grupo)
    setNome(grupo.nome)
    setSelecionadas(new Set(grupo.tarefas))
    setErroForm(null)
  }

  function toggleTarefa(tipo: string) {
    setSelecionadas(prev => {
      const next = new Set(prev)
      if (next.has(tipo)) next.delete(tipo)
      else next.add(tipo)
      return next
    })
  }

  // Tarefa já usada em outro grupo (não o que está sendo editado) não pode
  // ser selecionada de novo — evita uma tarefa em dois grupos ao mesmo tempo.
  function grupoDeOutraTarefa(tipo: string): TarefaGrupo | undefined {
    return grupos.find(g => g.tarefas.includes(tipo) && g !== editando)
  }

  async function confirmarForm() {
    if (!nome.trim() || selecionadas.size === 0) return
    setSalvando(true)
    setErroForm(null)
    const tarefas = Array.from(selecionadas)
    const { error } = editando === 'novo'
      ? await criarGrupoTarefas(clienteId, setor, nome, tarefas)
      : await atualizarGrupoTarefas((editando as TarefaGrupo).id, clienteId, setor, nome, tarefas)
    setSalvando(false)
    if (error) { setErroForm(error); return }
    setEditando(null)
    await carregar()
  }

  async function excluir(grupo: TarefaGrupo) {
    const ok = await confirmar({
      titulo: 'Excluir grupo de tarefas?',
      descricao: `Excluir o grupo "${grupo.nome}"? As tarefas voltam a ficar soltas na checklist.`,
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    const { error } = await excluirGrupoTarefas(grupo.id, clienteId, setor)
    if (error) { setErroLista(error); return }
    await carregar()
  }

  const emForm = editando !== null

  return (
    <Modal
      aberto
      onFechar={onClose}
      bloqueado={salvando}
      largura="m"
      titulo={emForm ? (editando === 'novo' ? 'Novo grupo de tarefas' : 'Editar grupo') : 'Grupos de tarefas'}
      subtitulo="Agrupa tarefas na ficha do cliente"
      rodape={
        emForm ? (
          <div className="ml-auto flex gap-2.5">
            <Button variante="fantasma" onClick={() => setEditando(null)} disabled={salvando}>Voltar</Button>
            <Button variante="primario" onClick={confirmarForm} carregando={salvando} disabled={!nome.trim() || selecionadas.size === 0}>
              {salvando ? 'Salvando…' : 'Confirmar'}
            </Button>
          </div>
        ) : (
          <>
            {tarefasDisponiveis.length > 0 && (
              <Button icone={<Plus size={16} aria-hidden="true" />} onClick={abrirNovo}>Novo grupo</Button>
            )}
            <div className="ml-auto">
              <Button variante="fantasma" onClick={onClose}>Fechar</Button>
            </div>
          </>
        )
      }
    >
      <Aviso tom="info">As alterações aqui são salvas na hora.</Aviso>

      {!emForm && (
        <>
          {erroLista && <div role="alert"><Aviso tom="dng">{erroLista}</Aviso></div>}
          {carregando && <p role="status" className="text-sm text-fg-3">Carregando…</p>}
          {!carregando && grupos.length === 0 && (
            <p className="text-sm text-fg-3">Nenhum grupo criado ainda.</p>
          )}
          {grupos.length > 0 && (
            <ul className="overflow-hidden rounded-[10px] border border-line-soft">
              {grupos.map((g, i) => (
                <li key={g.id} className={cn('flex items-center gap-3 px-3.5 py-3', i > 0 && 'border-t border-line-soft')}>
                  <Layers size={18} aria-hidden="true" className="flex-none text-fg-3" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{g.nome}</p>
                    <p className="text-[13px] text-fg-3">{g.tarefas.length} tarefa{g.tarefas.length === 1 ? '' : 's'}</p>
                  </div>
                  <Button tamanho="p" icone={<Pencil size={14} aria-hidden="true" />} onClick={() => abrirEdicao(g)}>Editar</Button>
                  <IconButton rotulo={`Excluir grupo ${g.nome}`} icone={<Trash2 size={16} aria-hidden="true" />} onClick={() => excluir(g)} />
                </li>
              ))}
            </ul>
          )}
          {tarefasDisponiveis.length === 0 && (
            <p className="text-[13px] text-fg-3">Adicione tarefas ao cliente antes de criar um grupo.</p>
          )}
        </>
      )}

      {emForm && (
        <>
          <Field rotulo="Nome do grupo">
            {c => <Input id={c.id} data-autofocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Movimento mensal" />}
          </Field>

          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-medium text-fg-2">
              Tarefas ({selecionadas.size} selecionada{selecionadas.size === 1 ? '' : 's'})
            </legend>
            {tarefasDisponiveis.map(tipo => {
              const outroGrupo = grupoDeOutraTarefa(tipo)
              return (
                <div key={tipo}
                  className={cn('flex items-center gap-3 rounded-lg border border-line-soft px-3 py-2', outroGrupo && 'opacity-50')}>
                  <Checkbox
                    className="flex-1 text-fg"
                    checked={selecionadas.has(tipo)}
                    disabled={!!outroGrupo}
                    onChange={() => toggleTarefa(tipo)}
                    rotulo={tipo}
                  />
                  {outroGrupo && <span className="text-xs text-fg-3">em &quot;{outroGrupo.nome}&quot;</span>}
                </div>
              )
            })}
          </fieldset>

          {erroForm && <div role="alert"><Aviso tom="dng">{erroForm}</Aviso></div>}
        </>
      )}
    </Modal>
  )
}
