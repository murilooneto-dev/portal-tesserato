// app/admin/configuracoes/societario/ProcessosTab.tsx
'use client'

import { useEffect, useRef, useState, useCallback, type Dispatch, type SetStateAction } from 'react'
import { ChevronDown, ChevronRight, ChevronUp, GitBranch, Pencil, Plus, Trash2, X } from 'lucide-react'
import {
  listarProcessoTipos,
  criarProcessoTipo,
  excluirProcessoTipo,
  moverSubetapaOrdem,
  atualizarProcessoTipo,
} from '@/lib/processo-tipos-actions'
import {
  adicionarEtapa,
  removerEtapa,
  adicionarSubetapa,
  removerSubetapa,
  moverSubetapa,
  renomearEtapa,
  editarSubetapa,
  paraEtapaForm,
  type EtapaForm,
  type SubetapaTipoResposta,
  type ProcessoTipoResumo,
} from '@/lib/processo-tipos'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Segmentado } from '@/components/ui/Segmentado'
import { Aviso } from '@/components/ui/Aviso'
import { EmptyState } from '@/components/ui/EmptyState'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/components/ui/cn'

// "Sim ou não" é só o rótulo: o valor gravado continua sendo `checklist`.
const FORMATOS_SUBETAPA: { valor: SubetapaTipoResposta; rotulo: string }[] = [
  { valor: 'texto', rotulo: 'Texto e anexo' },
  { valor: 'checklist', rotulo: 'Sim ou não' },
  { valor: 'data', rotulo: 'Data' },
]

function labelFormato(tipo: SubetapaTipoResposta): string {
  return FORMATOS_SUBETAPA.find(f => f.valor === tipo)?.rotulo ?? tipo
}

function SetasOrdem({ nome, onSubir, onDescer, desabilitarSubir, desabilitarDescer }: {
  nome: string
  onSubir: () => void
  onDescer: () => void
  desabilitarSubir: boolean
  desabilitarDescer: boolean
}) {
  const cls = 'grid h-[18px] w-7 place-items-center rounded text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:cursor-not-allowed disabled:opacity-35'
  return (
    <span className="flex flex-none flex-col">
      <button type="button" onClick={onSubir} disabled={desabilitarSubir} aria-label={`Subir subetapa ${nome}`} title="Subir" className={cls}>
        <ChevronUp size={14} aria-hidden="true" />
      </button>
      <button type="button" onClick={onDescer} disabled={desabilitarDescer} aria-label={`Descer subetapa ${nome}`} title="Descer" className={cls}>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
    </span>
  )
}

function EtapaBloco({ etapa, onRemoverEtapa, onRenomearEtapa, onAdicionarSubetapa, onRemoverSubetapa, onMoverSubetapa, onEditarSubetapa }: {
  etapa: EtapaForm
  onRemoverEtapa: () => void
  onRenomearEtapa: (novoNome: string) => void
  onAdicionarSubetapa: (nome: string, tipoResposta: SubetapaTipoResposta) => void
  onRemoverSubetapa: (subetapaIndex: number) => void
  onMoverSubetapa: (subetapaIndex: number, direcao: 'up' | 'down') => void
  onEditarSubetapa: (subetapaIndex: number, nome: string, tipoResposta: SubetapaTipoResposta) => void
}) {
  const [novaSubetapa, setNovaSubetapa] = useState('')

  // A subetapa nasce como "Texto e anexo"; o formato é trocado na própria linha.
  function adicionar() {
    if (!novaSubetapa.trim()) return
    onAdicionarSubetapa(novaSubetapa, 'texto')
    setNovaSubetapa('')
  }

  return (
    <div className="rounded-xl border border-line-soft bg-page px-4 py-3.5">
      <div className="mb-2.5 flex items-center gap-2.5">
        <Input aria-label="Nome da etapa" value={etapa.nome} onChange={e => onRenomearEtapa(e.target.value)} className="min-w-0 flex-1" />
        <IconButton rotulo="Remover etapa" icone={<X size={18} aria-hidden="true" />} onClick={onRemoverEtapa} />
      </div>

      <div className="@container flex flex-col gap-2 border-l-2 border-line pl-3.5">
        {etapa.subetapas.map((sub, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2.5 rounded-lg border border-line-soft bg-page px-2.5 py-2">
            <SetasOrdem
              nome={sub.nome}
              onSubir={() => onMoverSubetapa(i, 'up')}
              onDescer={() => onMoverSubetapa(i, 'down')}
              desabilitarSubir={i === 0}
              desabilitarDescer={i === etapa.subetapas.length - 1}
            />
            <div className="min-w-0 flex-1 basis-[7rem]">
              <Input aria-label="Nome da subetapa" value={sub.nome} onChange={e => onEditarSubetapa(i, e.target.value, sub.tipoResposta)} />
            </div>
            {/* Largo: botões lado a lado. Estreito (celular, coluna apertada): lista. */}
            <Segmentado
              rotulo={`Formato da subetapa ${sub.nome}`}
              opcoes={FORMATOS_SUBETAPA}
              valor={sub.tipoResposta}
              onMudar={v => onEditarSubetapa(i, sub.nome, v)}
              className="order-last hidden @sm:inline-flex @xl:order-none"
            />
            <div className="order-last w-full @sm:hidden">
              <Select
                aria-label={`Formato da subetapa ${sub.nome}`}
                value={sub.tipoResposta}
                onChange={e => onEditarSubetapa(i, sub.nome, e.target.value as SubetapaTipoResposta)}
              >
                {FORMATOS_SUBETAPA.map(f => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
              </Select>
            </div>
            <IconButton rotulo={`Remover subetapa ${sub.nome}`} icone={<X size={18} aria-hidden="true" />} onClick={() => onRemoverSubetapa(i)} />
          </div>
        ))}

        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Input
              aria-label={`Nova subetapa de ${etapa.nome}`}
              value={novaSubetapa}
              onChange={e => setNovaSubetapa(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); adicionar() } }}
              placeholder="Nome da subetapa"
              className="h-[30px] text-[13px]"
            />
          </div>
          <Button tamanho="p" icone={<Plus size={14} aria-hidden="true" />} onClick={adicionar}>Subetapa</Button>
        </div>
      </div>
    </div>
  )
}

export default function ProcessosTab() {
  const confirmar = useConfirmar()
  const avisar = useToast()
  const [itens, setItens] = useState<ProcessoTipoResumo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [novoNome, setNovoNome] = useState('')
  const [etapas, setEtapas] = useState<EtapaForm[]>([])
  const [novaEtapa, setNovaEtapa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({})
  const [movendo, setMovendo] = useState<Record<string, boolean>>({})

  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nomeEdicao, setNomeEdicao] = useState('')
  const [etapasEdicao, setEtapasEdicao] = useState<EtapaForm[]>([])
  const [novaEtapaEdicao, setNovaEtapaEdicao] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)

  const formulario = useRef<HTMLDivElement>(null)

  // O estado já começa em "carregando": só grava estado depois que a consulta
  // volta (a lista fica na tela enquanto atualiza).
  const aplicar = useCallback(({ data, error }: Awaited<ReturnType<typeof listarProcessoTipos>>) => {
    if (error) setErro(error)
    else { setItens(data); setErro(null) }
    setCarregando(false)
  }, [])

  const recarregar = useCallback(async () => aplicar(await listarProcessoTipos()), [aplicar])

  useEffect(() => {
    let ativo = true
    listarProcessoTipos().then(r => { if (ativo) aplicar(r) })
    return () => { ativo = false }
  }, [aplicar])

  function addEtapa() {
    setEtapas(prev => adicionarEtapa(prev, novaEtapa))
    setNovaEtapa('')
  }

  async function handleCriar() {
    if (!novoNome.trim() || etapas.length === 0) return
    setSalvando(true)
    const { error } = await criarProcessoTipo(novoNome, etapas)
    if (error) { setErro(error); setSalvando(false); return }
    setErro(null)
    setNovoNome('')
    setEtapas([])
    setSalvando(false)
    avisar('Tipo de processo criado.', 'ok')
    await recarregar()
  }

  async function handleExcluir(item: ProcessoTipoResumo) {
    const ok = await confirmar({
      titulo: `Excluir o tipo de processo "${item.nome}"?`,
      descricao: 'Essa ação não pode ser desfeita.',
      textoConfirmar: 'Excluir',
      perigo: true,
    })
    if (!ok) return
    const { error } = await excluirProcessoTipo(item.id)
    if (error) { setErro(error); return }
    setErro(null)
    avisar('Tipo de processo excluído.', 'ok')
    await recarregar()
  }

  function toggleExpandido(id: string) {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }))
  }

  async function moverPersistida(subetapaId: string, direcao: 'up' | 'down') {
    setMovendo(prev => ({ ...prev, [subetapaId]: true }))
    const { error } = await moverSubetapaOrdem(subetapaId, direcao)
    if (error) setErro(error)
    else { setErro(null); await recarregar() }
    setMovendo(prev => ({ ...prev, [subetapaId]: false }))
  }

  function handleEditar(item: ProcessoTipoResumo) {
    setNomeEdicao(item.nome)
    setEtapasEdicao(paraEtapaForm(item))
    setNovaEtapaEdicao('')
    setEditandoId(item.id)
    // No celular o formulário fica acima da lista: leva a tela até ele.
    formulario.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  function handleCancelarEdicao() {
    setEditandoId(null)
  }

  function addEtapaEdicao() {
    setEtapasEdicao(prev => adicionarEtapa(prev, novaEtapaEdicao))
    setNovaEtapaEdicao('')
  }

  async function handleSalvarEdicao() {
    if (!editandoId || !nomeEdicao.trim() || etapasEdicao.length === 0) return
    setSalvandoEdicao(true)
    const { error } = await atualizarProcessoTipo(editandoId, nomeEdicao, etapasEdicao)
    if (error) { setErro(error); setSalvandoEdicao(false); return }
    setErro(null)
    setSalvandoEdicao(false)
    setEditandoId(null)
    avisar('Alterações salvas.', 'ok')
    await recarregar()
  }

  // O card da esquerda serve para criar e para editar; cada modo guarda o seu
  // rascunho, então entrar numa edição não apaga o que estava sendo criado.
  const emEdicao = editandoId !== null
  const nomeAtual = emEdicao ? nomeEdicao : novoNome
  const setNomeAtual = emEdicao ? setNomeEdicao : setNovoNome
  const etapasAtuais = emEdicao ? etapasEdicao : etapas
  const setEtapasAtuais: Dispatch<SetStateAction<EtapaForm[]>> = emEdicao ? setEtapasEdicao : setEtapas
  const novaEtapaAtual = emEdicao ? novaEtapaEdicao : novaEtapa
  const setNovaEtapaAtual = emEdicao ? setNovaEtapaEdicao : setNovaEtapa
  const addEtapaAtual = emEdicao ? addEtapaEdicao : addEtapa
  const incompleto = !nomeAtual.trim() || etapasAtuais.length === 0

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div ref={formulario} className="min-w-0 scroll-mt-4">
          <Card titulo={emEdicao ? 'Editar tipo de processo' : 'Novo tipo de processo'}>
            <div className="flex flex-col gap-4">
              <Field rotulo="Nome do tipo de processo" obrigatorio>
                {c => (
                  <Input
                    id={c.id}
                    value={nomeAtual}
                    onChange={e => setNomeAtual(e.target.value)}
                    placeholder="Ex.: Abertura de empresa"
                  />
                )}
              </Field>

              <span className="text-[13px] font-medium text-fg-2">Etapas ({etapasAtuais.length})</span>

              {etapasAtuais.map((etapa, i) => (
                <EtapaBloco
                  key={`${emEdicao ? editandoId : 'novo'}-${i}`}
                  etapa={etapa}
                  onRemoverEtapa={() => setEtapasAtuais(prev => removerEtapa(prev, i))}
                  onRenomearEtapa={novoNome => setEtapasAtuais(prev => renomearEtapa(prev, i, novoNome))}
                  onAdicionarSubetapa={(nome, tipoResposta) => setEtapasAtuais(prev => adicionarSubetapa(prev, i, nome, tipoResposta))}
                  onRemoverSubetapa={subetapaIndex => setEtapasAtuais(prev => removerSubetapa(prev, i, subetapaIndex))}
                  onMoverSubetapa={(subetapaIndex, direcao) => setEtapasAtuais(prev => moverSubetapa(prev, i, subetapaIndex, direcao))}
                  onEditarSubetapa={(subetapaIndex, nome, tipoResposta) => setEtapasAtuais(prev => editarSubetapa(prev, i, subetapaIndex, nome, tipoResposta))}
                />
              ))}

              <div className="flex flex-wrap gap-2">
                <div className="min-w-[10rem] flex-1">
                  <Input
                    aria-label="Nome da nova etapa"
                    value={novaEtapaAtual}
                    onChange={e => setNovaEtapaAtual(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addEtapaAtual() } }}
                    placeholder="Nome da nova etapa"
                  />
                </div>
                <Button icone={<Plus size={16} aria-hidden="true" />} onClick={addEtapaAtual}>Adicionar etapa</Button>
              </div>

              <div className="flex flex-wrap justify-end gap-2.5 border-t border-line-soft pt-3.5">
                {emEdicao ? (
                  <>
                    <Button variante="fantasma" onClick={handleCancelarEdicao} disabled={salvandoEdicao}>Cancelar</Button>
                    <Button variante="primario" onClick={handleSalvarEdicao} carregando={salvandoEdicao} disabled={incompleto}>
                      {salvandoEdicao ? 'Salvando…' : 'Salvar'}
                    </Button>
                  </>
                ) : (
                  <Button variante="primario" icone={<Plus size={16} aria-hidden="true" />} onClick={handleCriar} carregando={salvando} disabled={incompleto}>
                    {salvando ? 'Criando…' : 'Criar tipo de processo'}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>

        <Card titulo="Tipos cadastrados" semPadding>
          {carregando ? (
            <p className="px-[18px] py-4 text-sm text-fg-3">Carregando…</p>
          ) : itens.length === 0 ? (
            <EmptyState icone={<GitBranch size={24} />} titulo="Nenhum tipo de processo cadastrado ainda." />
          ) : (
            <ul>
              {itens.map((item, indice) => {
                const aberto = Boolean(expandidos[item.id])
                const sendoEditado = editandoId === item.id
                return (
                  <li key={item.id} className={cn(indice > 0 && 'border-t border-line-soft', sendoEditado && 'bg-acc-soft')}>
                    <div className="flex items-center gap-3 px-[18px] py-3.5">
                      <button
                        type="button"
                        onClick={() => toggleExpandido(item.id)}
                        aria-expanded={aberto}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                      >
                        {aberto
                          ? <ChevronDown size={16} aria-hidden="true" className="flex-none text-fg-3" />
                          : <ChevronRight size={16} aria-hidden="true" className="flex-none text-fg-3" />}
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-fg">{item.nome}</span>
                          <span className="block text-[13px] text-fg-3">
                            {item.etapas.length} etapa{item.etapas.length === 1 ? '' : 's'}
                            {sendoEditado && ' · em edição'}
                          </span>
                        </span>
                      </button>
                      <Button tamanho="p" icone={<Pencil size={14} aria-hidden="true" />} onClick={() => handleEditar(item)} disabled={sendoEditado}>
                        Editar
                      </Button>
                      <IconButton
                        rotulo={`Excluir ${item.nome}`}
                        icone={<Trash2 size={16} aria-hidden="true" />}
                        onClick={() => handleExcluir(item)}
                        disabled={sendoEditado}
                      />
                    </div>

                    {aberto && (
                      <div className="flex flex-col gap-3 border-t border-line-soft px-[18px] py-3.5">
                        {item.etapas.map((etapa, etapaIndex) => (
                          <div key={etapaIndex}>
                            <span className="block text-[13px] font-semibold text-fg">{etapa.nome}</span>
                            {etapa.subetapas.length > 0 && (
                              <ul className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-line pl-3">
                                {etapa.subetapas.map((sub, subIndex) => (
                                  <li key={sub.id} className="flex items-center gap-2 text-[13px] text-fg-2">
                                    {/* Durante a edição a ordem é mexida no formulário, não aqui. */}
                                    {!sendoEditado && (
                                      <SetasOrdem
                                        nome={sub.nome}
                                        onSubir={() => moverPersistida(sub.id, 'up')}
                                        onDescer={() => moverPersistida(sub.id, 'down')}
                                        desabilitarSubir={movendo[sub.id] || subIndex === 0}
                                        desabilitarDescer={movendo[sub.id] || subIndex === etapa.subetapas.length - 1}
                                      />
                                    )}
                                    <span className="min-w-0 flex-1 break-words">{sub.nome}</span>
                                    <Badge tom="acc">{labelFormato(sub.tipoResposta)}</Badge>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
