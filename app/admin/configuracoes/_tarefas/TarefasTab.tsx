// app/admin/configuracoes/_tarefas/TarefasTab.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import type { UserSetor } from '@/lib/types'
import {
  listarTarefaTiposDoSetor,
  excluirTarefaTipo,
  listarUsuariosDoSetor,
  atualizarResponsavelTarefaTipo,
  type TarefaTipoResumo,
  type UsuarioDoSetor,
} from '@/lib/tarefa-tipo-vinculos-actions'
import { Card } from '@/components/ui/Card'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { EmptyState } from '@/components/ui/EmptyState'
import { EsqueletoLinhas } from '@/components/ui/Esqueleto'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'
import EditarTipoTarefaModal from '@/components/geral/EditarTipoTarefaModal'

interface Props {
  setor: UserSetor
}

// Mesma regra de formatoInicial() em EditarTipoTarefaModal: tipo "data" com
// etapas é o formato "Opções".
function rotuloFormato(item: TarefaTipoResumo): string {
  if (item.tipoResposta === 'checklist') return 'Checkbox com opções'
  if (item.etapas && item.etapas.length > 0) return 'Opções'
  return item.tipoResposta === 'texto' ? 'Texto e anexo' : 'Data'
}

export default function TarefasTab({ setor }: Props) {
  const confirmar = useConfirmar()
  const avisar = useToast()
  const [itens, setItens] = useState<TarefaTipoResumo[]>([])
  const [usuarios, setUsuarios] = useState<UsuarioDoSetor[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [mostrarModal, setMostrarModal] = useState(false)
  const [salvandoResponsavel, setSalvandoResponsavel] = useState<string | null>(null)
  const [editando, setEditando] = useState<TarefaTipoResumo | null>(null)

  const recarregar = useCallback(async () => {
    const [{ data, error }, { data: usuariosData }] = await Promise.all([
      listarTarefaTiposDoSetor(setor),
      listarUsuariosDoSetor(setor),
    ])
    if (error) setErro(error)
    else { setItens(data); setErro(null) }
    setUsuarios(usuariosData)
    setCarregando(false)
  }, [setor])

  useEffect(() => {
    async function iniciar() { await recarregar() }
    iniciar()
  }, [recarregar])

  async function handleResponsavelChange(item: TarefaTipoResumo, responsavelId: string) {
    setSalvandoResponsavel(item.id)
    const valor = responsavelId === '' ? null : responsavelId
    const { error } = await atualizarResponsavelTarefaTipo(item.id, valor)
    if (error) setErro(error)
    else {
      setErro(null)
      setItens(prev => prev.map(i => i.id === item.id ? { ...i, responsavelId: valor } : i))
      avisar('Salvo', 'ok')
    }
    setSalvandoResponsavel(null)
  }

  async function handleExcluir(item: TarefaTipoResumo) {
    const ok = await confirmar({
      titulo: `Excluir a tarefa "${item.nome}"?`,
      descricao: 'Essa ação não pode ser desfeita e remove também os vínculos dela com regimes/grupos/atividades.',
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    const { error } = await excluirTarefaTipo(item.id)
    if (error) { setErro(error); return }
    setErro(null)
    avisar('Tarefa excluída.', 'ok')
    await recarregar()
  }

  function abrirCriacao() {
    if (novoNome.trim()) setMostrarModal(true)
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field rotulo="Nome" className="min-w-[14rem] flex-1">
          {c => (
            <Input
              id={c.id}
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') abrirCriacao() }}
              placeholder="Nome da nova tarefa"
            />
          )}
        </Field>
        <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={abrirCriacao} disabled={!novoNome.trim()}>
          Criar tarefa
        </Button>
      </div>

      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

      <Card semPadding className="overflow-hidden">
        {carregando && itens.length === 0 ? (
          <EsqueletoLinhas linhas={4} className="px-[18px] py-5" />
        ) : itens.length === 0 ? (
          <EmptyState compacto icone={<ListChecks size={24} />} titulo="Nenhuma tarefa cadastrada nesse setor ainda" descricao="Crie pelo campo acima." />
        ) : (
          <div className="relative overflow-x-auto xl:overflow-visible">
            <Tabela className="min-w-[860px]">
              <thead>
                <tr>
                  <Th>Tarefa</Th>
                  <Th largura={170}>Formato</Th>
                  <Th largura={300}>Responsável exclusivo</Th>
                  <Th largura={120}><span className="sr-only">Editar</span></Th>
                  <Th largura={56}><span className="sr-only">Excluir</span></Th>
                </tr>
              </thead>
              <tbody>
                {itens.map(item => (
                  <tr key={item.id}>
                    <Td>
                      <span className={cn('block truncate font-semibold', item.ativo ? 'text-fg' : 'text-fg-3 line-through')} title={item.nome}>
                        {item.nome}
                      </span>
                    </Td>
                    <Td><Badge tom="neu">{rotuloFormato(item)}</Badge></Td>
                    <Td>
                      <Select
                        aria-label={`Responsável exclusivo de ${item.nome}`}
                        value={item.responsavelId ?? ''}
                        onChange={e => handleResponsavelChange(item, e.target.value)}
                        disabled={salvandoResponsavel === item.id}
                        className="h-[34px]"
                        title="Responsável exclusivo por esse tipo de tarefa, em todos os clientes"
                      >
                        <option value="">Ninguém (regra normal)</option>
                        {usuarios.map(u => (
                          <option key={u.id} value={u.id}>{u.nome}</option>
                        ))}
                      </Select>
                    </Td>
                    <Td alinhar="dir">
                      <Button tamanho="p" icone={<Pencil size={15} aria-hidden="true" />} onClick={() => setEditando(item)}>Editar</Button>
                    </Td>
                    <Td alinhar="dir">
                      <IconButton rotulo={`Excluir ${item.nome}`} icone={<Trash2 size={16} aria-hidden="true" />} onClick={() => handleExcluir(item)} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>

      <p className="text-[13px] text-fg-3">
        &quot;Responsável exclusivo&quot; leva a tarefa para Minhas tarefas daquela pessoa em todos os clientes. A troca salva na hora e mostra &quot;Salvo&quot;.
      </p>

      {mostrarModal && (
        <NovoTipoTarefaModal
          nome={novoNome}
          setor={setor}
          padrao={true}
          onCancel={() => setMostrarModal(false)}
          onCriado={() => { setMostrarModal(false); setNovoNome(''); recarregar() }}
        />
      )}

      {editando && (
        <EditarTipoTarefaModal
          id={editando.id}
          nome={editando.nome}
          setor={setor}
          tipoResposta={editando.tipoResposta}
          etapas={editando.etapas}
          mesesVisiveis={editando.mesesVisiveis}
          onCancel={() => setEditando(null)}
          onSalvo={() => { setEditando(null); recarregar() }}
        />
      )}
    </div>
  )
}
