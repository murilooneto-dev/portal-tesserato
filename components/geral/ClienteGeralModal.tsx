'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { ArrowRight, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import CamposFiscais, { type CamposFiscaisData } from '@/components/fiscal/CamposFiscais'
import SectorSection from '@/components/geral/SectorSection'
import { flattenClienteFiscal } from '@/lib/clientes-fiscal'
import { SETOR_LABEL, type UserSetor, type TarefaVinculo } from '@/lib/types'
import { tarefaExisteNoCatalogo } from '@/lib/tarefa-tipos'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'
import { excluirClienteGeral, salvarClienteGeral, desabilitarClienteGeral, reabilitarClienteGeral } from '@/app/(comum)/clientes/actions'
import ConfirmarExclusaoClienteModal from '@/components/geral/ConfirmarExclusaoClienteModal'
import { descreverImpactoExclusao } from '@/lib/exclusao-cliente'
import DesabilitarClienteModal from '@/components/geral/DesabilitarClienteModal'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import { SETORES_DE_CLIENTE } from '@/lib/clientes-geral'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Checkbox, Switch } from '@/components/ui/Input'
import { Chip } from '@/components/ui/Chip'
import { Aviso } from '@/components/ui/Aviso'
import { useConfirmar } from '@/components/ui/ConfirmDialog'
import { cn } from '@/components/ui/cn'

interface FormData extends CamposFiscaisData {
  nome: string
  cnpj: string
  municipio: string
  uf: string
  contato_chat: string
  setores: UserSetor[]
  vinculosAtivos: string[]
}

interface Props {
  clienteId: string | null
  responsaveis: string[]
  vinculosCatalogo: TarefaVinculo[]
  catalogoFiscal: CatalogoCliente
  onClose: () => void
  readOnly?: boolean
  podeDesabilitar?: boolean
  desabilitada?: boolean
  temSetorDesabilitavel?: boolean
}

const emptyForm = (): FormData => ({
  nome: '', cnpj: '', municipio: '', uf: '', contato_chat: '', setores: ['fiscal'],
  vinculosAtivos: [],
  cod: '', regime: '', atividade: [], responsavel: '', prioridade: 3,
  declaracao_anual: false, envia_iss: false, confere_siga: false, faz_dossie: false,
  login_iss: '', senha_iss: '', email_envio_iss: '',
  tarefas_personalizadas: [], tarefas_excluidas: [],
})


export default function ClienteGeralModal({ clienteId, responsaveis, vinculosCatalogo, catalogoFiscal, onClose, readOnly = false, podeDesabilitar = false, desabilitada = false, temSetorDesabilitavel = false }: Props) {
  const router = useRouter()
  const confirmar = useConfirmar()
  const sb = createClient()
  const isEdit = !!clienteId

  const [form, setForm] = useState<FormData>(emptyForm())
  const [novaTarefa, setNovaTarefa] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [falhaAoCarregar, setFalhaAoCarregar] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Nome e setores GRAVADOS no banco (o formulário pode estar editado e não salvo):
  // o aviso e a digitação de confirmação da exclusão usam estes.
  const [identidadeSalva, setIdentidadeSalva] = useState<{ nome: string; setores: UserSetor[] } | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [desabilitarModalOpen, setDesabilitarModalOpen] = useState(false)
  const [reabilitando, setReabilitando] = useState(false)
  const [mostrarVinculos, setMostrarVinculos] = useState(false)
  const [catalogoNomes, setCatalogoNomes] = useState<string[]>([])
  const [nomeParaCriar, setNomeParaCriar] = useState<string | null>(null)
  const identificacaoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!clienteId) return
    // Left join (não !inner): um cliente pode não ter setor Fiscal marcado e,
    // nesse caso, legitimamente não tem linha em clientes_fiscal.
    sb.from('clientes').select('*, clientes_fiscal(*)').eq('id', clienteId).single().then(({ data: raw, error: erroBusca }) => {
      if (erroBusca || !raw) {
        setFalhaAoCarregar(true)
        setLoading(false)
        return
      }
      const data = flattenClienteFiscal(raw)
      setIdentidadeSalva({ nome: data.nome ?? '', setores: (data.setores ?? ['fiscal']) as UserSetor[] })
      const mitParts = (data.mit ?? '').split('/')
      setForm({
        nome: data.nome ?? '',
        cnpj: data.cnpj ?? '',
        municipio: data.municipio ?? mitParts[0] ?? '',
        uf: data.uf ?? mitParts[1] ?? '',
        contato_chat: data.contato_chat ?? '',
        // Só setores de cliente: um 'configuracoes' antigo ficaria invisível e burlaria a validação de setor.
        setores: ((data.setores ?? ['fiscal']) as UserSetor[]).filter(s => SETORES_DE_CLIENTE.includes(s)),
        vinculosAtivos: data.tarefas_vinculadas_ativas ?? [],
        cod: data.cod ?? '',
        regime: data.regime ?? '',
        atividade: data.atividade ?? [],
        responsavel: data.responsavel ?? '',
        prioridade: data.prioridade ?? 3,
        declaracao_anual: data.declaracao_anual ?? false,
        envia_iss: data.envia_iss ?? false,
        confere_siga: data.confere_siga ?? false,
        faz_dossie: data.faz_dossie ?? false,
        login_iss: data.login_iss ?? '',
        senha_iss: data.senha_iss ?? '',
        email_envio_iss: data.email_envio_iss ?? '',
        tarefas_personalizadas: data.tarefas_personalizadas ?? [],
        tarefas_excluidas: data.tarefas_excluidas ?? [],
      })
      setMostrarVinculos((data.tarefas_vinculadas_ativas ?? []).length > 0)
      setLoading(false)
      // O foco inicial do Modal rodou com o formulário ainda carregando: foca a Razão social agora.
      if (!readOnly) {
        requestAnimationFrame(() => requestAnimationFrame(() => identificacaoRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  useEffect(() => {
    sb.from('tarefa_tipos').select('nome').eq('setor', 'fiscal').then(({ data }) => {
      setCatalogoNomes((data ?? []).map(t => t.nome as string))
    })
  }, [])

  async function fetchCnpj(raw: string) {
    setLoadingCnpj(true)
    const resultado = await buscarCnpj(raw)
    if (resultado) {
      setForm(p => ({
        ...p,
        nome: resultado.nome || p.nome,
        municipio: resultado.municipio || p.municipio,
        uf: resultado.uf || p.uf,
      }))
    }
    setLoadingCnpj(false)
  }

  function set<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm(p => ({ ...p, [k]: v }))
  }

  function toggleSetor(setor: UserSetor) {
    setForm(p => ({
      ...p,
      setores: p.setores.includes(setor) ? p.setores.filter(s => s !== setor) : [...p.setores, setor],
    }))
  }

  function addTarefa() {
    const t = novaTarefa.trim()
    if (!t) return
    if (tarefaExisteNoCatalogo(catalogoNomes, t)) {
      set('tarefas_personalizadas', [...form.tarefas_personalizadas, t])
      setNovaTarefa('')
    } else {
      setNomeParaCriar(t)
    }
  }

  function handleTipoCriado(nome: string) {
    setCatalogoNomes(prev => [...prev, nome])
    set('tarefas_personalizadas', [...form.tarefas_personalizadas, nome])
    setNovaTarefa('')
    setNomeParaCriar(null)
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    if (form.setores.length === 0) {
      setErro('Selecione ao menos um setor.')
      return
    }
    setSaving(true)
    setErro(null)

    const mit = form.municipio && form.uf
      ? `${form.municipio}/${form.uf}`
      : form.municipio || null

    // form.setores nunca chega vazio aqui (bloqueado acima). Um fallback
    // silencioso para 'fiscal' foi removido: ele reintroduzia o cliente
    // "fantasma" sempre que Fiscal era o único setor marcado (caso comum,
    // já que Fiscal é o setor padrão de clientes legados) — desmarcá-lo
    // esvaziava o array e o fallback recolocava 'fiscal' sem o usuário notar.
    const setoresEfetivos = form.setores

    const clientePayload = {
      nome:         form.nome,
      cnpj:         form.cnpj || null,
      municipio:    form.municipio || null,
      uf:           form.uf || null,
      mit,
      contato_chat: form.contato_chat || null,
      setores:      setoresEfetivos,
      tarefas_vinculadas_ativas: form.vinculosAtivos,
    }

    const fiscalPayload = {
      cod:                    form.cod || null,
      regime:                 form.regime || null,
      atividade:              form.atividade,
      responsavel:            form.responsavel || null,
      prioridade:             form.prioridade,
      declaracao_anual:       form.declaracao_anual,
      envia_iss:              form.envia_iss,
      confere_siga:           form.confere_siga,
      faz_dossie:             form.faz_dossie,
      login_iss:              form.envia_iss ? form.login_iss || null : null,
      senha_iss:              form.envia_iss ? form.senha_iss || null : null,
      email_envio_iss:        form.envia_iss ? form.email_envio_iss || null : null,
      tarefas_personalizadas: form.tarefas_personalizadas,
      tarefas_excluidas:      form.tarefas_excluidas,
    }

    // Provisionamento condicional de clientes_fiscal/contabil/pessoal
    // conforme setoresEfetivos (setor marcado ganha linha se não tiver;
    // desmarcado perde a linha) e o log de auditoria agora vivem no
    // servidor, em salvarClienteGeral — ver app/(comum)/clientes/actions.ts.
    // O bloco Fiscal continua somente-leitura na edição (edição de verdade
    // é feita em /fiscal/clientes): a action só provisiona a linha se ela
    // ainda não existir.
    const { error } = await salvarClienteGeral(clienteId, clientePayload, fiscalPayload)
    if (error) {
      setSaving(false)
      setErro(error)
      return
    }
    setSaving(false)

    router.refresh()
    onClose()
  }

  async function handleReabilitar() {
    if (!clienteId) return
    if (!(await confirmar({ titulo: 'Reabilitar cliente?', descricao: `"${form.nome}" volta a aparecer nos setores onde estava desabilitado.`, textoConfirmar: 'Reabilitar' }))) return
    setReabilitando(true)
    setErro(null)
    const { error } = await reabilitarClienteGeral(clienteId)
    setReabilitando(false)
    if (error) { setErro(error); return }
    router.refresh()
    onClose()
  }

  async function executarExclusao(): Promise<{ error: string | null }> {
    if (!clienteId) return { error: 'Cliente não identificado.' }
    const r = await excluirClienteGeral(clienteId)
    if (r.error) return r
    router.refresh()
    onClose()
    return { error: null }
  }

  const mostraFiscal = form.setores.includes('fiscal')
  const titulo = readOnly ? 'Ver cliente' : isEdit ? 'Editar cliente' : 'Novo cliente'
  const vinculosAplicaveis = vinculosCatalogo.filter(v => form.setores.includes(v.setor_origem) && form.setores.includes(v.setor_destino))

  return (
    <>
      <Modal
        aberto
        onFechar={onClose}
        bloqueado={saving || reabilitando}
        largura="g"
        titulo={titulo}
        subtitulo={isEdit ? (identidadeSalva?.nome || undefined) : 'Cadastro geral, vale para todos os setores'}
        rodape={
          falhaAoCarregar ? (
            <div className="flex w-full justify-end"><Button onClick={onClose}>Fechar</Button></div>
          ) : (
          <div className="flex w-full flex-wrap items-center gap-2.5">
            {!readOnly && isEdit && !loading && (
              <Button variante="perigo" icone={<Trash2 size={16} aria-hidden="true" />} onClick={() => setConfirmandoExclusao(true)} disabled={!identidadeSalva || saving}>Excluir cliente</Button>
            )}
            {podeDesabilitar && isEdit && !loading && temSetorDesabilitavel && (
              desabilitada
                ? <Button variante="fantasma" onClick={handleReabilitar} carregando={reabilitando}>{reabilitando ? 'Reabilitando…' : 'Reabilitar'}</Button>
                : <Button variante="fantasma" onClick={() => setDesabilitarModalOpen(true)} disabled={saving}>Desabilitar</Button>
            )}
            <div className="ml-auto flex gap-2.5">
              {readOnly ? (
                <Button onClick={onClose}>Fechar</Button>
              ) : (
                <>
                  <Button variante="fantasma" onClick={onClose} disabled={saving}>Cancelar</Button>
                  <Button variante="primario" onClick={handleSave} carregando={saving} disabled={loading || !form.nome.trim() || form.setores.length === 0}>
                    {saving ? 'Salvando…' : 'Salvar cliente'}
                  </Button>
                </>
              )}
            </div>
          </div>
          )
        }
      >
        {falhaAoCarregar ? (
          <div role="alert"><Aviso tom="dng">Não foi possível carregar o cliente. Feche a janela e tente de novo.</Aviso></div>
        ) : loading ? (
          <p role="status" className="py-8 text-center text-sm text-fg-3">Carregando…</p>
        ) : (
          <>
            <Secao titulo="Identificação">
              <div ref={identificacaoRef} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <Field rotulo="CNPJ" ajuda={loadingCnpj ? 'Buscando dados do CNPJ…' : undefined} className="sm:col-span-2">
                  {c => <Input id={c.id} aria-describedby={c.describedBy} className="font-mono" placeholder="00.000.000/0000-00" disabled={readOnly}
                    value={form.cnpj} onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }} />}
                </Field>
                <Field rotulo="Razão social" obrigatorio className="sm:col-span-2">
                  {c => <Input id={c.id} data-autofocus disabled={readOnly} value={form.nome} onChange={e => set('nome', e.target.value)} />}
                </Field>
                <Field rotulo="Município" className="sm:col-span-2">
                  {c => <Input id={c.id} disabled={readOnly} value={form.municipio} onChange={e => set('municipio', e.target.value)} />}
                </Field>
                <Field rotulo="UF">
                  {c => <Input id={c.id} className="uppercase" maxLength={2} disabled={readOnly} value={form.uf} onChange={e => set('uf', e.target.value.toUpperCase().slice(0, 2))} />}
                </Field>
                <Field rotulo="Contato">
                  {c => <Input id={c.id} placeholder="Nome ou telefone" disabled={readOnly} value={form.contato_chat} onChange={e => set('contato_chat', e.target.value)} />}
                </Field>
              </div>
            </Secao>

            <Secao titulo="Setores em que o cliente aparece">
              <div role="group" aria-label="Setores" className="flex flex-wrap gap-2">
                {SETORES_DE_CLIENTE.map(s => (
                  <Chip key={s} ativo={form.setores.includes(s)} onClick={() => toggleSetor(s)} disabled={readOnly}>{SETOR_LABEL[s]}</Chip>
                ))}
              </div>
              {!readOnly && form.setores.length === 0 && <p role="alert" className="text-xs text-danger">Selecione ao menos um setor.</p>}
            </Secao>

            <Secao titulo="Tarefas vinculadas entre setores">
              <Switch
                ligado={mostrarVinculos}
                onMudar={v => { setMostrarVinculos(v); if (!v) set('vinculosAtivos', []) }}
                rotulo="Este cliente tem tarefas que liberam outras em outro setor"
                disabled={readOnly}
              />
              {mostrarVinculos && (vinculosAplicaveis.length === 0 ? (
                <p className="text-[13px] text-fg-3">Nenhum vínculo do catálogo se aplica aos setores marcados.</p>
              ) : (
                <ul className="overflow-hidden rounded-[10px] border border-line-soft">
                  {vinculosAplicaveis.map((v, i) => (
                    <li key={v.id} className={cn('px-3.5 py-2.5', i > 0 && 'border-t border-line-soft')}>
                      <Checkbox
                        checked={form.vinculosAtivos.includes(v.id)}
                        disabled={readOnly}
                        onChange={() => set('vinculosAtivos', form.vinculosAtivos.includes(v.id)
                          ? form.vinculosAtivos.filter(id => id !== v.id)
                          : [...form.vinculosAtivos, v.id])}
                        rotulo={
                          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 text-fg">
                            {v.tipo_origem} <span className="text-fg-3">({SETOR_LABEL[v.setor_origem]})</span>
                            <ArrowRight size={14} aria-hidden="true" className="text-fg-3" /><span className="sr-only">libera</span>
                            {v.tipo_destino} <span className="text-fg-3">({SETOR_LABEL[v.setor_destino]})</span>
                          </span>
                        }
                      />
                    </li>
                  ))}
                </ul>
              ))}
            </Secao>

            {mostraFiscal && isEdit && (
              <SectorSection title="Dados do Fiscal" note="somente leitura, edite em Fiscal › Clientes">
                <CamposFiscais
                  form={form}
                  set={set as <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void}
                  responsaveis={responsaveis}
                  catalogo={catalogoFiscal}
                  isEdit={isEdit}
                  clienteId={clienteId}
                  readOnly={true}
                  novaTarefa={novaTarefa}
                  setNovaTarefa={setNovaTarefa}
                  addTarefa={addTarefa}
                />
              </SectorSection>
            )}
            {mostraFiscal && !isEdit && (
              <Secao titulo="Dados do Fiscal">
                <div className="flex flex-col gap-5">
                  <CamposFiscais
                    form={form}
                    set={set as <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void}
                    responsaveis={responsaveis}
                    catalogo={catalogoFiscal}
                    isEdit={isEdit}
                    clienteId={clienteId}
                    readOnly={readOnly}
                    novaTarefa={novaTarefa}
                    setNovaTarefa={setNovaTarefa}
                    addTarefa={addTarefa}
                  />
                </div>
              </Secao>
            )}

            {erro && <div role="alert"><Aviso tom="dng">{erro}</Aviso></div>}
          </>
        )}
      </Modal>
      {confirmandoExclusao && identidadeSalva && (
        <ConfirmarExclusaoClienteModal
          nomeCliente={identidadeSalva.nome}
          impacto={descreverImpactoExclusao({ origem: 'geral', acao: 'excluir-do-sistema', setoresDoCliente: identidadeSalva.setores })}
          onConfirmar={executarExclusao}
          onCancelar={() => setConfirmandoExclusao(false)}
        />
      )}
      {desabilitarModalOpen && clienteId && (
        <DesabilitarClienteModal
          clienteNome={form.nome}
          onClose={() => setDesabilitarModalOpen(false)}
          onConfirm={senha => desabilitarClienteGeral(clienteId, senha)}
          onConfirmado={() => { router.refresh(); onClose() }}
        />
      )}
      {nomeParaCriar && (
        <NovoTipoTarefaModal
          nome={nomeParaCriar}
          setor="fiscal"
          onCancel={() => setNomeParaCriar(null)}
          onCriado={handleTipoCriado}
        />
      )}
    </>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
      {children}
    </section>
  )
}
