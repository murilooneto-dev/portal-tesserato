'use client'

import { useId, useRef, useState } from 'react'
import { FileText, Paperclip, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { uploadArquivoProcedimento, excluirArquivoProcedimento } from '@/lib/procedimento-arquivos-actions'
import { STATUS_PROCEDIMENTO_OPCOES as STATUS_OPCOES, type StatusProcedimento } from '@/lib/status-procedimento'
import type { ProcessoTipoResumo, SubetapaTipoResposta } from '@/lib/processo-tipos'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select, Switch, Checkbox } from '@/components/ui/Input'
import { Segmentado, type OpcaoSegmentada } from '@/components/ui/Segmentado'
import { Aviso } from '@/components/ui/Aviso'
import { useToast } from '@/components/ui/Toast'

export type SubetapaValor = string | boolean | null

export interface ProcessoTipo {
  id: string
  nome: string
  etapas: string[] | null
}

export interface DocumentacaoModelo {
  id: string
  nome: string
}

export interface ClienteResumo {
  id: string
  nome: string
}

export interface ProcedimentoArquivoResumo {
  id: string
  name: string
  size: number
}

export interface Procedimento {
  id: string
  processo_tipo_id: string
  cliente_id: string | null
  empresa: string
  status: StatusProcedimento
  campos: Record<string, string>
  subetapas: Record<string, SubetapaValor>
  documentacao_modelo_id: string | null
  responsavel: string | null
  processo_tipos: { nome: string } | null
  documentacao_modelos: { nome: string } | null
  procedimento_arquivos: ProcedimentoArquivoResumo[]
}

export function defaultValorSubetapa(tipo: SubetapaTipoResposta): SubetapaValor {
  if (tipo === 'checklist') return null
  if (tipo === 'data') return null
  return ''
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

// Chip de anexo: altura 30, fundo raised, nome com reticências e tamanho.
export const CHIP_ANEXO = 'inline-flex h-[30px] max-w-[260px] min-w-0 items-center gap-2 rounded-[7px] border border-line-soft bg-raised px-2.5 text-[13px] text-fg-2'

interface FormState {
  processo_tipo_id: string
  clienteCadastrado: boolean
  cliente_id: string
  empresa: string
  responsavel: string
  status: StatusProcedimento
  campos: Record<string, string>
  subetapasValores: Record<string, SubetapaValor>
  preencherDocumento: boolean
  documentacao_modelo_id: string
}

const EMPTY_FORM: FormState = {
  processo_tipo_id: '',
  clienteCadastrado: false,
  cliente_id: '',
  empresa: '',
  responsavel: '',
  status: 'ABERTO',
  campos: {},
  subetapasValores: {},
  preencherDocumento: false,
  documentacao_modelo_id: '',
}

type SimNao = 'sim' | 'nao' | ''
const OPCOES_SIM_NAO: OpcaoSegmentada<SimNao>[] = [
  { valor: 'sim', rotulo: 'Sim' },
  { valor: 'nao', rotulo: 'Não' },
]

function formInicial(editItem: Procedimento | null, tiposResumoPorId: Map<string, ProcessoTipoResumo>): FormState {
  if (!editItem) return EMPTY_FORM
  const subetapasValores: Record<string, SubetapaValor> = {}
  for (const etapa of tiposResumoPorId.get(editItem.processo_tipo_id)?.etapas ?? []) {
    for (const sub of etapa.subetapas) {
      subetapasValores[sub.id] = editItem.subetapas?.[sub.id] ?? defaultValorSubetapa(sub.tipoResposta)
    }
  }
  return {
    processo_tipo_id: editItem.processo_tipo_id,
    clienteCadastrado: !!editItem.cliente_id,
    cliente_id: editItem.cliente_id ?? '',
    empresa: editItem.empresa,
    responsavel: editItem.responsavel?.trim() ?? '',
    status: editItem.status,
    campos: { ...editItem.campos },
    subetapasValores,
    preencherDocumento: !!editItem.documentacao_modelo_id,
    documentacao_modelo_id: editItem.documentacao_modelo_id ?? '',
  }
}

function TituloSecao({ children }: { children: string }) {
  return <h3 className="mb-3 text-xs font-semibold uppercase tracking-[.06em] text-fg-3">{children}</h3>
}

export default function ProcedimentoModal({
  editItem, tipos, tiposResumoPorId, modelos, clientes, responsaveis, onFechar, onSalvo,
}: {
  editItem: Procedimento | null
  tipos: ProcessoTipo[]
  tiposResumoPorId: Map<string, ProcessoTipoResumo>
  modelos: DocumentacaoModelo[]
  clientes: ClienteResumo[]
  responsaveis: string[]
  onFechar: () => void
  onSalvo: () => Promise<void>
}) {
  const [sb] = useState(createClient)
  const toast = useToast()
  const [form, setForm] = useState<FormState>(() => formInicial(editItem, tiposResumoPorId))
  const [arquivosNovos, setArquivosNovos] = useState<File[]>([])
  const [arquivosExistentes, setArquivosExistentes] = useState<ProcedimentoArquivoResumo[]>(editItem?.procedimento_arquivos ?? [])
  const [saving, setSaving] = useState(false)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const inputArquivos = useRef<HTMLInputElement>(null)
  const idEmpresa = useId()

  // Responsável: os perfis, e o valor atual como opção extra se não bater com nenhum.
  // A comparação é exata: o valor do campo precisa ser o de uma das opções.
  const responsavelForaDaLista = form.responsavel !== '' && !responsaveis.includes(form.responsavel)

  function selecionarCliente(clienteId: string) {
    const cliente = clientes.find(c => c.id === clienteId)
    setForm(prev => ({ ...prev, cliente_id: clienteId, empresa: cliente?.nome ?? '' }))
  }

  function toggleClienteCadastrado(cadastrado: boolean) {
    setForm(prev => ({ ...prev, clienteCadastrado: cadastrado, cliente_id: '', empresa: '' }))
  }

  function handleSelecionarArquivos(files: FileList | null) {
    if (!files) return
    // Copia antes de limpar o input (a FileList esvazia junto com ele).
    const novos = Array.from(files)
    setArquivosNovos(prev => [...prev, ...novos])
  }

  function handleRemoverArquivoNovo(idx: number) {
    setArquivosNovos(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleExcluirArquivoExistente(arquivoId: string) {
    const { error } = await excluirArquivoProcedimento(arquivoId)
    if (error) { setErro(error); return }
    setArquivosExistentes(prev => prev.filter(a => a.id !== arquivoId))
    // O anexo já foi apagado: atualiza a lista mesmo que a janela seja cancelada.
    void onSalvo()
  }

  function selecionarTipo(tipoId: string) {
    const tipo = tipos.find(t => t.id === tipoId)
    const campos: Record<string, string> = {}
    for (const etapa of tipo?.etapas ?? []) {
      campos[etapa] = form.campos[etapa] ?? ''
    }
    const subetapasValores: Record<string, SubetapaValor> = {}
    for (const etapa of tiposResumoPorId.get(tipoId)?.etapas ?? []) {
      for (const sub of etapa.subetapas) {
        subetapasValores[sub.id] = form.subetapasValores[sub.id] ?? defaultValorSubetapa(sub.tipoResposta)
      }
    }
    setForm(prev => ({ ...prev, processo_tipo_id: tipoId, campos, subetapasValores }))
  }

  function setCampo(etapa: string, valor: string) {
    setForm(prev => ({ ...prev, campos: { ...prev.campos, [etapa]: valor } }))
  }

  function setSubetapaValor(subetapaId: string, valor: SubetapaValor) {
    setForm(prev => ({ ...prev, subetapasValores: { ...prev.subetapasValores, [subetapaId]: valor } }))
  }

  async function handleSave() {
    if (!form.processo_tipo_id || !form.empresa.trim()) return
    setSaving(true)
    setErro(null)

    const payload = {
      processo_tipo_id: form.processo_tipo_id,
      cliente_id: form.clienteCadastrado ? (form.cliente_id || null) : null,
      empresa: form.empresa.trim(),
      responsavel: form.responsavel.trim() || null,
      status: form.status,
      campos: form.campos,
      subetapas: form.subetapasValores,
      documentacao_modelo_id: form.preencherDocumento ? (form.documentacao_modelo_id || null) : null,
      updated_at: new Date().toISOString(),
    }

    const { data: salvo, error } = editItem
      ? await sb.from('procedimentos_societario').update(payload).eq('id', editItem.id).select('id').single()
      : await sb.from('procedimentos_societario').insert(payload).select('id').single()

    if (error || !salvo) {
      setSaving(false)
      setErro(error?.message ?? 'Falha ao salvar o procedimento.')
      return
    }

    for (const arquivo of arquivosNovos) {
      const formData = new FormData()
      formData.append('arquivo', arquivo)
      const uploadResult = await uploadArquivoProcedimento(salvo.id, formData)
      // O procedimento já foi salvo e a janela fecha: o erro do anexo vai em aviso.
      if (uploadResult.error) toast(`Anexo "${arquivo.name}" não enviado: ${uploadResult.error}`, 'dng')
    }

    setSaving(false)
    await onSalvo()
    onFechar()
  }

  async function handleGerar() {
    if (!form.documentacao_modelo_id) return
    setGerando(true)
    setErro(null)
    try {
      const tipo = tipos.find(t => t.id === form.processo_tipo_id)
      const modelo = modelos.find(m => m.id === form.documentacao_modelo_id)
      const res = await fetch('/api/societario/gerar-documento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modeloNome: modelo?.nome ?? 'Documento',
          empresa: form.empresa.trim(),
          processoNome: tipo?.nome ?? '',
          responsavel: form.responsavel.trim() || null,
          campos: Object.entries(form.campos).map(([etapa, valor]) => ({ etapa, valor })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErro(body.error ?? 'Falha ao gerar o documento.')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${modelo?.nome ?? 'documento'}-${form.empresa}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGerando(false)
    }
  }

  const tipoSelecionado = tipos.find(t => t.id === form.processo_tipo_id)
  const tipoResumoSelecionado = tiposResumoPorId.get(form.processo_tipo_id)
  const temAnexos = arquivosExistentes.length > 0 || arquivosNovos.length > 0

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={editItem ? 'Editar procedimento' : 'Novo procedimento'}
      subtitulo="Societário"
      largura="g"
      bloqueado={saving}
      rodape={
        <>
          <div className="flex-1" />
          <Button variante="fantasma" onClick={onFechar} disabled={saving}>Cancelar</Button>
          <Button
            variante="primario"
            onClick={handleSave}
            carregando={saving}
            disabled={!form.processo_tipo_id || !form.empresa.trim()}
          >
            {saving ? 'Salvando…' : 'Salvar procedimento'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Field
          rotulo="Tipo de processo"
          obrigatorio
          ajuda={tipos.length === 0 ? 'Nenhum tipo de processo cadastrado — cadastre em Configurações → Societário.' : undefined}
        >
          {c => (
            <Select id={c.id} aria-describedby={c.describedBy} value={form.processo_tipo_id} onChange={e => selecionarTipo(e.target.value)}>
              <option value="">Selecionar…</option>
              {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </Select>
          )}
        </Field>
        <Field rotulo="Responsável">
          {c => (
            <Select id={c.id} value={form.responsavel} onChange={e => setForm(p => ({ ...p, responsavel: e.target.value }))}>
              <option value="">Sem responsável</option>
              {responsavelForaDaLista && <option value={form.responsavel}>{`${form.responsavel} (atual)`}</option>}
              {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
            </Select>
          )}
        </Field>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={idEmpresa} className="text-[13px] font-medium text-fg-2">
            Empresa<span aria-hidden="true" className="ml-0.5 text-danger">*</span>
          </label>
          <span className="ml-auto">
            <Switch ligado={form.clienteCadastrado} onMudar={toggleClienteCadastrado} rotulo="Cliente cadastrado" />
          </span>
        </div>
        {form.clienteCadastrado ? (
          <Select id={idEmpresa} value={form.cliente_id} onChange={e => selecionarCliente(e.target.value)}>
            <option value="">Selecionar…</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        ) : (
          <Input id={idEmpresa} value={form.empresa} onChange={e => setForm(p => ({ ...p, empresa: e.target.value }))} placeholder="Nome da empresa" />
        )}
      </div>

      {editItem && (
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field rotulo="Status">
            {c => (
              <Select id={c.id} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as StatusProcedimento }))}>
                {STATUS_OPCOES.map(s => <option key={s.valor} value={s.valor}>{s.label}</option>)}
              </Select>
            )}
          </Field>
        </div>
      )}

      {tipoSelecionado && (tipoSelecionado.etapas ?? []).length > 0 && (
        <section>
          <TituloSecao>Campos do processo</TituloSecao>
          <div className="flex flex-col gap-3">
            {(tipoSelecionado.etapas ?? []).map(etapa => {
              const subetapasDaEtapa = tipoResumoSelecionado?.etapas.find(e => e.nome === etapa)?.subetapas ?? []
              return (
                <div key={etapa} className="flex flex-col gap-3 rounded-xl border border-line-soft bg-page px-4 py-3.5">
                  <Field rotulo={etapa}>
                    {c => <Input id={c.id} placeholder="Resposta da etapa" value={form.campos[etapa] ?? ''} onChange={e => setCampo(etapa, e.target.value)} />}
                  </Field>
                  {subetapasDaEtapa.length > 0 && (
                    <div className="flex flex-col gap-2.5 border-l-2 border-line pl-3.5">
                      {subetapasDaEtapa.map(sub => {
                        const valor = form.subetapasValores[sub.id]
                        return (
                          <div key={sub.id} className="flex flex-wrap items-center gap-3">
                            <span className="min-w-0 flex-1 text-sm text-fg-2">{sub.nome}</span>
                            {sub.tipoResposta === 'checklist' && (
                              <Segmentado<SimNao>
                                rotulo={sub.nome}
                                opcoes={OPCOES_SIM_NAO}
                                valor={valor === true ? 'sim' : valor === false ? 'nao' : ''}
                                onMudar={v => {
                                  // Clicar na opção já ativa limpa a resposta (aceita vazio).
                                  const atual: SimNao = valor === true ? 'sim' : valor === false ? 'nao' : ''
                                  setSubetapaValor(sub.id, v === atual ? null : v === 'sim')
                                }}
                              />
                            )}
                            {sub.tipoResposta === 'data' && (
                              <div className="flex items-center gap-3">
                                <Checkbox
                                  rotulo="Hoje"
                                  title="Marcar com a data de hoje"
                                  className="text-[13px] text-fg-3"
                                  checked={valor != null}
                                  onChange={e => setSubetapaValor(sub.id, e.target.checked ? new Date().toISOString().slice(0, 10) : null)}
                                />
                                <Input
                                  type="date"
                                  aria-label={sub.nome}
                                  className="w-[170px]"
                                  value={(valor as string) ?? ''}
                                  onChange={e => setSubetapaValor(sub.id, e.target.value || null)}
                                />
                              </div>
                            )}
                            {sub.tipoResposta === 'texto' && (
                              <Input
                                aria-label={sub.nome}
                                className="w-[260px] max-w-full"
                                value={(valor as string) ?? ''}
                                onChange={e => setSubetapaValor(sub.id, e.target.value)}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <TituloSecao>Documento</TituloSecao>
        <div className="flex flex-wrap items-end gap-3.5">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg-2">Preencher documento?</span>
            <Segmentado<'sim' | 'nao'>
              rotulo="Preencher documento?"
              opcoes={[{ valor: 'sim', rotulo: 'Sim' }, { valor: 'nao', rotulo: 'Não' }]}
              valor={form.preencherDocumento ? 'sim' : 'nao'}
              onMudar={v => setForm(p => v === 'sim'
                ? { ...p, preencherDocumento: true }
                : { ...p, preencherDocumento: false, documentacao_modelo_id: '' })}
            />
          </div>
          <Field rotulo="Modelo" className="min-w-[200px] flex-1">
            {c => (
              <Select
                id={c.id}
                value={form.documentacao_modelo_id}
                disabled={!form.preencherDocumento}
                onChange={e => setForm(p => ({ ...p, documentacao_modelo_id: e.target.value }))}
              >
                <option value="">Selecionar modelo…</option>
                {modelos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </Select>
            )}
          </Field>
          <Button
            icone={<FileText size={16} aria-hidden="true" />}
            onClick={handleGerar}
            carregando={gerando}
            disabled={!form.preencherDocumento || !form.documentacao_modelo_id}
          >
            {gerando ? 'Gerando…' : 'Gerar PDF'}
          </Button>
        </div>
      </section>

      <section>
        <TituloSecao>Anexos</TituloSecao>
        <div className="flex flex-wrap items-center gap-2">
          <Button tamanho="p" icone={<Upload size={15} aria-hidden="true" />} onClick={() => inputArquivos.current?.click()}>
            Escolher arquivos
          </Button>
          <input
            ref={inputArquivos}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx"
            multiple
            className="hidden"
            onChange={e => { handleSelecionarArquivos(e.target.files); e.target.value = '' }}
          />
          {temAnexos && (
            <>
              {arquivosExistentes.map(arq => (
                <span key={arq.id} className={CHIP_ANEXO}>
                  <Paperclip size={14} aria-hidden="true" className="flex-none" />
                  <a href={`/api/arquivos/procedimento/${arq.id}`} target="_blank" rel="noopener noreferrer" className="truncate hover:underline" title={arq.name}>
                    {arq.name}
                  </a>
                  <span className="flex-none whitespace-nowrap text-fg-3">{formatBytes(arq.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remover ${arq.name}`}
                    title={`Remover ${arq.name}`}
                    onClick={() => handleExcluirArquivoExistente(arq.id)}
                    className="grid flex-none place-items-center rounded text-fg-3 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              ))}
              {arquivosNovos.map((arq, idx) => (
                <span key={idx} className={CHIP_ANEXO}>
                  <Paperclip size={14} aria-hidden="true" className="flex-none" />
                  <span className="truncate" title={arq.name}>{arq.name}</span>
                  <span className="flex-none whitespace-nowrap text-fg-3">{formatBytes(arq.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remover ${arq.name}`}
                    title={`Remover ${arq.name}`}
                    onClick={() => handleRemoverArquivoNovo(idx)}
                    className="grid flex-none place-items-center rounded text-fg-3 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </>
          )}
        </div>
      </section>

      {erro && <Aviso tom="dng">{erro}</Aviso>}
    </Modal>
  )
}
