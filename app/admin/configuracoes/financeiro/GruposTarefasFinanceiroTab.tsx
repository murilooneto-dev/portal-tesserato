// app/admin/configuracoes/financeiro/GruposTarefasFinanceiroTab.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Layers, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import {
  listarGruposDoSetorFinanceiro,
  criarGrupoSetorFinanceiro,
  atualizarGrupoSetorFinanceiro,
  excluirGrupoSetorFinanceiro,
} from '@/lib/tarefa-grupos-setor-actions'
import { listarTarefaTiposDoSetor, type TarefaTipoResumo } from '@/lib/tarefa-tipo-vinculos-actions'
import type { GrupoSetor } from '@/lib/types'
import MenuMaisAcoes from '@/components/geral/MenuMaisAcoes'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Checkbox } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Aviso } from '@/components/ui/Aviso'
import { EmptyState } from '@/components/ui/EmptyState'
import { EsqueletoLinhas } from '@/components/ui/Esqueleto'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'

function buscar() {
  return Promise.all([listarGruposDoSetorFinanceiro(), listarTarefaTiposDoSetor('financeiro')])
}

// Mais tarefas que isso: aparece o campo de busca na janela.
const LIMITE_BUSCA = 8

interface Props {
  /** Conta quantas vezes a aba foi aberta: ao mudar, as listas são relidas (tarefas novas aparecem). */
  mostrada?: number
}

export default function GruposTarefasFinanceiroTab({ mostrada = 0 }: Props) {
  const confirmar = useConfirmar()
  const avisar = useToast()
  const [grupos, setGrupos] = useState<GrupoSetor[]>([])
  const [tarefas, setTarefas] = useState<TarefaTipoResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  // 'novo' abre a janela de criação; um grupo abre a edição dele.
  const [janela, setJanela] = useState<'novo' | GrupoSetor | null>(null)

  // O estado já começa em "carregando": só grava estado depois que a consulta volta.
  const aplicar = useCallback(([gruposRes, tarefasRes]: Awaited<ReturnType<typeof buscar>>) => {
    const erroCarga = gruposRes.error ?? tarefasRes.error
    if (erroCarga) setErro(erroCarga)
    else { setGrupos(gruposRes.data); setTarefas(tarefasRes.data); setErro(null) }
    setCarregando(false)
  }, [])

  const recarregar = useCallback(async () => aplicar(await buscar()), [aplicar])

  useEffect(() => {
    let ativo = true
    buscar().then(r => { if (ativo) aplicar(r) })
    return () => { ativo = false }
  }, [aplicar, mostrada])

  async function handleExcluir(grupo: GrupoSetor) {
    const ok = await confirmar({
      titulo: `Excluir o grupo "${grupo.nome}"?`,
      descricao: 'As tarefas do grupo não são excluídas: elas voltam a aparecer soltas na ficha dos clientes.',
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    const { error } = await excluirGrupoSetorFinanceiro(grupo.id)
    if (error) { setErro(error); return }
    setErro(null)
    avisar('Grupo excluído.', 'ok')
    await recarregar()
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-[14rem] flex-1 text-[13px] text-fg-3">
          Um grupo reúne várias tarefas numa linha só na ficha do cliente. Vale para todos os clientes do Financeiro.
        </p>
        <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={() => setJanela('novo')} disabled={carregando}>
          Criar grupo
        </Button>
      </div>

      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

      <Card semPadding className="overflow-hidden">
        {carregando ? (
          <EsqueletoLinhas linhas={3} className="px-[18px] py-5" />
        ) : grupos.length === 0 ? (
          <EmptyState compacto icone={<Layers size={24} />} titulo="Nenhum grupo de tarefas ainda" descricao='Use "Criar grupo" para reunir tarefas do Financeiro.' />
        ) : (
          <ul>
            {grupos.map((g, i) => (
              <li key={g.id} className={cn('flex min-h-14 items-center gap-3 px-[18px] py-3', i > 0 && 'border-t border-line-soft')}>
                <Layers size={16} aria-hidden="true" className="flex-none text-fg-3" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 break-words font-semibold text-fg">{g.nome}</span>
                    <Badge tom="neu">{g.tarefas.length} {g.tarefas.length === 1 ? 'tarefa' : 'tarefas'}</Badge>
                  </div>
                  <p className="mt-0.5 break-words text-[13px] text-fg-3">{g.tarefas.join(' · ')}</p>
                </div>
                <MenuMaisAcoes
                  rotulo={`Editar ou excluir ${g.nome}`}
                  itens={[
                    { rotulo: 'Editar', icone: <Pencil size={16} aria-hidden="true" />, onSelecionar: () => setJanela(g) },
                    { rotulo: 'Excluir', icone: <Trash2 size={16} aria-hidden="true" />, perigo: true, onSelecionar: () => handleExcluir(g) },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {janela && (
        <GrupoModal
          grupo={janela === 'novo' ? null : janela}
          grupos={grupos}
          tarefas={tarefas}
          onClose={() => setJanela(null)}
          onSalvo={() => { setJanela(null); avisar('Grupo salvo.', 'ok'); recarregar() }}
        />
      )}
    </div>
  )
}

interface ModalProps {
  grupo: GrupoSetor | null
  grupos: GrupoSetor[]
  tarefas: TarefaTipoResumo[]
  onClose: () => void
  onSalvo: () => void
}

function GrupoModal({ grupo, grupos, tarefas, onClose, onSalvo }: ModalProps) {
  const [nome, setNome] = useState(grupo?.nome ?? '')
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set(grupo?.tarefas ?? []))
  const [busca, setBusca] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Tarefa que já está em outro grupo fica desativada, com o nome desse grupo.
  function outroGrupoDe(nomeTarefa: string): GrupoSetor | undefined {
    return grupos.find(g => g.id !== grupo?.id && g.tarefas.includes(nomeTarefa))
  }

  function alternar(nomeTarefa: string) {
    setMarcadas(prev => {
      const novo = new Set(prev)
      if (novo.has(nomeTarefa)) novo.delete(nomeTarefa)
      else novo.add(nomeTarefa)
      return novo
    })
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    const lista = [...marcadas]
    const { error } = grupo
      ? await atualizarGrupoSetorFinanceiro(grupo.id, nome, lista)
      : await criarGrupoSetorFinanceiro(nome, lista)
    if (error) { setErro(error); setSalvando(false); return }
    setSalvando(false)
    onSalvo()
  }

  const filtradas = tarefas.filter(t => t.nome.toLowerCase().includes(busca.trim().toLowerCase()))

  return (
    <Modal
      aberto
      onFechar={onClose}
      titulo={grupo ? `Editar grupo "${grupo.nome}"` : 'Novo grupo de tarefas'}
      subtitulo="Financeiro"
      largura="p"
      fecharAoClicarFora={false}
      bloqueado={salvando}
      rodape={
        <>
          <div className="flex-1" />
          <Button variante="fantasma" onClick={onClose} disabled={salvando}>Cancelar</Button>
          <Button variante="primario" onClick={salvar} carregando={salvando} disabled={!nome.trim() || marcadas.size === 0}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      <Field rotulo="Nome do grupo" obrigatorio>
        {c => (
          <Input
            id={c.id}
            value={nome}
            onChange={e => setNome(e.target.value)}
            maxLength={100}
            placeholder="Ex.: Fechamento do mês"
            disabled={salvando}
          />
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-fg">Tarefas do grupo</p>
        {tarefas.length === 0 ? (
          <Aviso tom="info">O catálogo do Financeiro ainda não tem tarefas. Crie as tarefas na aba Tarefas e volte aqui.</Aviso>
        ) : (
          <>
            {tarefas.length > LIMITE_BUSCA && (
              <Input
                aria-label="Buscar tarefa"
                placeholder="Buscar tarefa"
                value={busca}
                onChange={e => setBusca(e.target.value)}
                iconeEsquerda={<Search size={16} />}
              />
            )}
            {filtradas.length === 0 ? (
              <EmptyState compacto icone={<Search size={20} />} titulo="Nenhuma tarefa com essa busca" />
            ) : (
              <ul className="max-h-[40vh] overflow-y-auto rounded-[10px] border border-line-soft">
                {filtradas.map((t, i) => {
                  const outro = outroGrupoDe(t.nome)
                  return (
                    <li key={t.id} className={cn('flex min-h-11 items-center px-3.5', i > 0 && 'border-t border-line-soft')}>
                      <Checkbox
                        rotulo={
                          <span className={cn('text-sm', outro ? 'text-fg-3' : 'text-fg')}>
                            {t.nome}
                            {outro && <span className="block text-[13px]">já está no grupo {outro.nome}</span>}
                          </span>
                        }
                        checked={marcadas.has(t.nome)}
                        disabled={!!outro || salvando}
                        onChange={() => alternar(t.nome)}
                        className="w-full py-2"
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
    </Modal>
  )
}
