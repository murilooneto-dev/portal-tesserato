// app/admin/configuracoes/_tarefas/EntidadeListaTab.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Link2, List, Pencil, Plus, Power, Trash2 } from 'lucide-react'
import type { UserSetor } from '@/lib/types'
import {
  listarEntidades,
  criarEntidade,
  renomearEntidade,
  alternarAtivoEntidade,
  excluirEntidade,
  type TipoEntidade,
  type EntidadeConfig,
} from '@/lib/config-entidades-actions'
import { ordenarPorNome } from '@/lib/config-entidades'
import type { TipoEntidadeVinculo } from '@/lib/tarefa-tipo-vinculos-actions'
import { Card } from '@/components/ui/Card'
import { Tabela, Th, Td } from '@/components/ui/Tabela'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'
import MenuMaisAcoes from '@/components/geral/MenuMaisAcoes'
import VincularTarefasModal from './VincularTarefasModal'

interface Props {
  tabela: TipoEntidade
  entidadeTipoVinculo: TipoEntidadeVinculo
  setor: UserSetor
  label: string
}

export default function EntidadeListaTab({ tabela, entidadeTipoVinculo, setor, label }: Props) {
  const confirmar = useConfirmar()
  const avisar = useToast()
  const [itens, setItens] = useState<EntidadeConfig[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEditado, setNomeEditado] = useState('')
  const [vinculandoItem, setVinculandoItem] = useState<EntidadeConfig | null>(null)

  // "regime" é masculino, "atividade" é feminino.
  const feminino = tabela === 'atividades'
  const nomeMinusculo = label.toLowerCase()

  const recarregar = useCallback(async () => {
    const { data, error } = await listarEntidades(tabela, setor)
    if (error) setErro(error)
    else { setItens(ordenarPorNome(data)); setErro(null) }
    setCarregando(false)
  }, [tabela, setor])

  useEffect(() => {
    async function iniciar() { await recarregar() }
    iniciar()
  }, [recarregar])

  async function handleCriar() {
    if (!novoNome.trim() || salvandoNovo) return
    setSalvandoNovo(true)
    const { error } = await criarEntidade(tabela, setor, novoNome)
    if (error) setErro(error)
    else { setNovoNome(''); setErro(null); avisar(feminino ? `${label} criada.` : `${label} criado.`, 'ok'); await recarregar() }
    setSalvandoNovo(false)
  }

  async function handleRenomear(id: string) {
    if (!nomeEditado.trim()) return
    const { error } = await renomearEntidade(tabela, id, nomeEditado)
    if (error) { setErro(error); return }
    setEditandoId(null)
    setErro(null)
    avisar('Salvo', 'ok')
    await recarregar()
  }

  async function handleAlternarAtivo(item: EntidadeConfig) {
    const { error } = await alternarAtivoEntidade(tabela, item.id, !item.ativo)
    if (error) { setErro(error); return }
    setErro(null)
    await recarregar()
  }

  async function handleExcluir(item: EntidadeConfig) {
    const ok = await confirmar({
      titulo: `Excluir "${item.nome}"?`,
      descricao: 'Essa ação não pode ser desfeita.',
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    const { error } = await excluirEntidade(tabela, item.id)
    if (error) { setErro(error); return }
    setErro(null)
    avisar(feminino ? `${label} excluída.` : `${label} excluído.`, 'ok')
    await recarregar()
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
              onKeyDown={e => { if (e.key === 'Enter') handleCriar() }}
              placeholder={feminino ? `Nome da nova ${nomeMinusculo}` : `Nome do novo ${nomeMinusculo}`}
            />
          )}
        </Field>
        <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={handleCriar} disabled={!novoNome.trim()} carregando={salvandoNovo}>
          Criar {nomeMinusculo}
        </Button>
      </div>

      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

      <Card semPadding className="overflow-hidden">
        {carregando && itens.length === 0 ? (
          <p className="px-[18px] py-6 text-sm text-fg-3">Carregando…</p>
        ) : itens.length === 0 ? (
          <EmptyState
            icone={<List size={24} />}
            titulo={feminino ? `Nenhuma ${nomeMinusculo} cadastrada ainda` : `Nenhum ${nomeMinusculo} cadastrado ainda`}
            descricao="Crie pelo campo acima."
          />
        ) : (
          <div className="relative overflow-x-auto xl:overflow-visible">
            <Tabela className="min-w-[680px]">
              <thead>
                <tr>
                  <Th>{label}</Th>
                  <Th largura={160}>Situação</Th>
                  <Th largura={220}><span className="sr-only">Vincular tarefas</span></Th>
                  <Th largura={56}><span className="sr-only">Mais ações</span></Th>
                </tr>
              </thead>
              <tbody>
                {itens.map(item => (
                  <tr key={item.id}>
                    <Td>
                      {editandoId === item.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`Novo nome de ${item.nome}`}
                            value={nomeEditado}
                            onChange={e => setNomeEditado(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenomear(item.id)
                              if (e.key === 'Escape') setEditandoId(null)
                            }}
                            autoFocus
                          />
                          <Button tamanho="p" onClick={() => handleRenomear(item.id)} disabled={!nomeEditado.trim()}>Salvar</Button>
                          <Button tamanho="p" variante="fantasma" onClick={() => setEditandoId(null)}>Cancelar</Button>
                        </div>
                      ) : (
                        <span className={cn('block truncate font-semibold', item.ativo ? 'text-fg' : 'text-fg-3 line-through')} title={item.nome}>
                          {item.nome}
                        </span>
                      )}
                    </Td>
                    <Td>{item.ativo ? <Badge tom="ok">Ativo</Badge> : <Badge tom="neu">Desativado</Badge>}</Td>
                    <Td alinhar="dir">
                      <Button tamanho="p" icone={<Link2 size={15} aria-hidden="true" />} onClick={() => setVinculandoItem(item)}>
                        Vincular tarefas
                      </Button>
                    </Td>
                    <Td alinhar="dir">
                      <div className="flex justify-end">
                        <MenuMaisAcoes
                          rotulo={`Renomear, desativar ou excluir ${item.nome}`}
                          itens={[
                            { rotulo: 'Renomear', icone: <Pencil size={16} aria-hidden="true" />, onSelecionar: () => { setEditandoId(item.id); setNomeEditado(item.nome) } },
                            { rotulo: item.ativo ? 'Desativar' : 'Ativar', icone: <Power size={16} aria-hidden="true" />, onSelecionar: () => handleAlternarAtivo(item) },
                            { rotulo: 'Excluir', icone: <Trash2 size={16} aria-hidden="true" />, perigo: true, onSelecionar: () => handleExcluir(item) },
                          ]}
                        />
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        )}
      </Card>

      {vinculandoItem && (
        <VincularTarefasModal
          entidadeTipo={entidadeTipoVinculo}
          entidadeId={vinculandoItem.id}
          entidadeNome={vinculandoItem.nome}
          setor={setor}
          onClose={() => setVinculandoItem(null)}
        />
      )}
    </div>
  )
}
