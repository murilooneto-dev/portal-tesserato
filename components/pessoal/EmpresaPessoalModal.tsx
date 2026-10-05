'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Layers, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import { SELECT_CLIENTE_PESSOAL, flattenClientePessoal } from '@/lib/clientes-pessoal'
import { tarefaExisteNoCatalogo } from '@/lib/tarefa-tipos'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'
import SeletorAtividades from '@/components/geral/SeletorAtividades'
import TarefasAutomaticasCampo from '@/components/geral/TarefasAutomaticasCampo'
import GruposTarefasModal from '@/components/geral/GruposTarefasModal'
import { Secao } from '@/components/fiscal/CamposFiscais'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import { salvarClientePessoal } from '@/app/pessoal/clientes/actions'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { useConfirmar } from '@/components/ui/ConfirmDialog'

interface FormData {
  cnpj: string
  nome: string
  atividade: string[]
  regime: string
  municipio: string
  uf: string
  responsavel: string
  contato_chat: string
  prioridade: number
  tarefas_personalizadas: string[]
  tarefas_excluidas: string[]
}

interface Props {
  clienteId: string | null
  responsaveis: string[]
  tarefasPadrao: string[]
  catalogo: CatalogoCliente
  onClose: () => void
  readOnly?: boolean
}

const emptyForm = (tarefasPadrao: string[]): FormData => ({
  cnpj: '', nome: '', atividade: [], regime: '', municipio: '', uf: '', responsavel: '', contato_chat: '',
  prioridade: 3, tarefas_personalizadas: tarefasPadrao, tarefas_excluidas: [],
})

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export default function EmpresaPessoalModal({ clienteId, responsaveis, tarefasPadrao, catalogo, onClose, readOnly = false }: Props) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = !!clienteId
  const confirmar = useConfirmar()
  const identificacaoRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState<FormData>(emptyForm(tarefasPadrao))
  const [personalizadasOriginais, setPersonalizadasOriginais] = useState<string[]>([])
  const [novaTarefa, setNovaTarefa] = useState('')
  const [catalogoNomes, setCatalogoNomes] = useState<string[]>(tarefasPadrao)
  const [nomeParaCriar, setNomeParaCriar] = useState<string | null>(null)
  const [gruposAberto, setGruposAberto] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!clienteId) return
    sb.from('clientes').select(SELECT_CLIENTE_PESSOAL).eq('id', clienteId).single().then(({ data: raw }) => {
      if (!raw) return
      const data = flattenClientePessoal(raw)
      setForm({
        cnpj: data.cnpj ?? '',
        nome: data.nome ?? '',
        atividade: data.atividade ?? [],
        regime: data.regime ?? '',
        municipio: data.municipio ?? '',
        uf: data.uf ?? '',
        responsavel: data.responsavel ?? '',
        contato_chat: data.contato_chat ?? '',
        prioridade: data.prioridade ?? 3,
        tarefas_personalizadas: data.tarefas_personalizadas ?? [],
        tarefas_excluidas: data.tarefas_excluidas ?? [],
      })
      setPersonalizadasOriginais(data.tarefas_personalizadas ?? [])
      setLoading(false)
      // O foco inicial do Modal rodou com o formulário ainda carregando: foca a Razão social agora.
      if (!readOnly) {
        requestAnimationFrame(() => requestAnimationFrame(() => identificacaoRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()))
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  useEffect(() => {
    sb.from('tarefa_tipos').select('nome').eq('setor', 'pessoal').then(({ data }) => {
      setCatalogoNomes((data ?? []).map(t => t.nome as string))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const removidas = personalizadasOriginais.filter(t => !form.tarefas_personalizadas.includes(t))
    if (removidas.length > 0 && !(await confirmar({
      titulo: 'Remover tarefas deste cliente?',
      descricao: `Remover ${removidas.map(t => `"${t}"`).join(', ')} deste cliente apaga o histórico dessa tarefa nele (concluída, respostas, anexos). Outros clientes não são afetados. Continuar?`,
      textoConfirmar: 'Continuar',
      perigo: true,
    }))) return
    setSaving(true)
    setErro(null)

    const clientePayload = {
      nome: form.nome,
      cnpj: form.cnpj || null,
      municipio: form.municipio || null,
      uf: form.uf || null,
      contato_chat: form.contato_chat || null,
    }
    const pessoalPayload = {
      atividade: form.atividade,
      regime: form.regime || null,
      responsavel: form.responsavel || null,
      prioridade: form.prioridade,
      tarefas_personalizadas: form.tarefas_personalizadas,
      tarefas_excluidas: form.tarefas_excluidas,
    }

    const { error } = await salvarClientePessoal(clienteId, clientePayload, pessoalPayload)
    if (error) { setSaving(false); setErro(error); return }

    setSaving(false)
    router.refresh()
    onClose()
  }

  const titulo = readOnly ? 'Visualizar empresa' : isEdit ? 'Editar empresa' : 'Nova empresa'
  // UF já gravada que não está na lista continua selecionável.
  const ufForaDaLista = form.uf && !UFS.includes(form.uf)

  return (
    <>
      <Modal
        aberto
        onFechar={onClose}
        bloqueado={saving}
        largura="g"
        titulo={titulo}
        subtitulo={isEdit && form.nome ? form.nome : undefined}
        rodape={
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
            {erro && <div role="alert" className="min-w-0 flex-1 basis-60"><Aviso tom="dng">{erro}</Aviso></div>}
            <div className="ml-auto flex gap-2.5">
              {readOnly ? (
                <Button onClick={onClose}>Fechar</Button>
              ) : (
                <>
                  <Button variante="fantasma" onClick={onClose} disabled={saving}>Cancelar</Button>
                  <Button variante="primario" onClick={handleSave} carregando={saving} disabled={loading || !form.nome.trim()}>
                    {saving ? 'Salvando…' : 'Salvar empresa'}
                  </Button>
                </>
              )}
            </div>
          </div>
        }
      >
        {loading ? (
          <p role="status" className="py-8 text-center text-sm text-fg-3">Carregando…</p>
        ) : (
          <>
            <Secao titulo="Identificação">
              <div ref={identificacaoRef} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <Field rotulo="CNPJ" ajuda={loadingCnpj ? 'Buscando dados do CNPJ…' : 'Buscamos os dados quando o CNPJ estiver completo'} className="sm:col-span-3">
                  {c => <Input id={c.id} aria-describedby={c.describedBy} className="font-mono" placeholder="00.000.000/0000-00" disabled={readOnly}
                    value={form.cnpj} onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }} />}
                </Field>
                <Field rotulo="UF">
                  {c => (
                    <Select id={c.id} disabled={readOnly} value={form.uf} onChange={e => set('uf', e.target.value)}>
                      <option value="">Selecionar…</option>
                      {ufForaDaLista && <option value={form.uf}>{form.uf} (atual)</option>}
                      {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                    </Select>
                  )}
                </Field>
                <Field rotulo="Razão social" obrigatorio className="sm:col-span-3">
                  {c => <Input id={c.id} data-autofocus disabled={readOnly} value={form.nome} onChange={e => set('nome', e.target.value)} />}
                </Field>
                <Field rotulo="Município">
                  {c => <Input id={c.id} disabled={readOnly} value={form.municipio} onChange={e => set('municipio', e.target.value)} />}
                </Field>
                <Field rotulo="Contato" className="sm:col-span-4">
                  {c => <Input id={c.id} placeholder="Nome ou telefone" disabled={readOnly} value={form.contato_chat} onChange={e => set('contato_chat', e.target.value)} />}
                </Field>
              </div>
            </Secao>

            <Secao titulo="Enquadramento">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* O catálogo de Regimes deste setor (/admin/configuracoes) precisa
                    conter exatamente 'normal', 'simples', 'mei', 'isento' (minúsculo,
                    sem acento) — o filtro por Regime e a cor do badge na listagem
                    (ClientesListaContabil.tsx / ClientesListaPessoal.tsx, via
                    labelRegime()/CORES_REGIME) comparam contra esses 4 textos
                    literais. Um regime com outro nome não quebra o formulário, mas
                    perde o filtro e a cor no badge da listagem. */}
                <Field rotulo="Regime">
                  {c => (
                    <Select id={c.id} value={form.regime} onChange={e => set('regime', e.target.value)} disabled={readOnly}>
                      <option value="">Selecionar…</option>
                      {form.regime && !catalogo.regimes.includes(form.regime) && (
                        <option value={form.regime}>{form.regime} (atual)</option>
                      )}
                      {catalogo.regimes.map(r => <option key={r} value={r}>{r}</option>)}
                    </Select>
                  )}
                </Field>
                <Field rotulo="Responsável">
                  {c => (
                    <Select id={c.id} value={form.responsavel} onChange={e => set('responsavel', e.target.value)} disabled={readOnly}>
                      <option value="">Selecionar…</option>
                      {responsaveis.map(r => <option key={r} value={r}>{r}</option>)}
                    </Select>
                  )}
                </Field>
                <Field rotulo="Prioridade (0 a 5)">
                  {c => <Input id={c.id} type="number" min={0} max={5} disabled={readOnly} value={form.prioridade}
                    onChange={e => set('prioridade', Number(e.target.value))} />}
                </Field>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-fg-2">Atividades</span>
                <SeletorAtividades
                  valores={form.atividade}
                  opcoes={catalogo.atividades}
                  onChange={v => set('atividade', v)}
                  readOnly={readOnly}
                />
              </div>
            </Secao>

            <Secao titulo="Tarefas do cliente">
              <div>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="text-[13px] font-medium text-fg-2">Tarefas ({form.tarefas_personalizadas.length})</span>
                  {isEdit && clienteId && !readOnly && (
                    <Button className="ml-auto" tamanho="p" icone={<Layers size={14} aria-hidden="true" />} onClick={() => setGruposAberto(true)}>
                      Agrupar tarefas
                    </Button>
                  )}
                </div>

                <div className="mb-3 flex min-h-[34px] flex-wrap gap-2">
                  {form.tarefas_personalizadas.length === 0 && (
                    <p className="text-xs text-fg-3">Nenhuma tarefa adicionada.</p>
                  )}
                  {form.tarefas_personalizadas.map((t, i) => (
                    <span key={i}
                      className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--acc)_55%,transparent)] bg-acc-soft px-3 text-[13px] text-fg">
                      {t}
                      {!readOnly && (
                        <button type="button"
                          aria-label={`Remover ${t}`}
                          onClick={() => set('tarefas_personalizadas', form.tarefas_personalizadas.filter((_, idx) => idx !== i))}
                          className="-mr-1.5 inline-grid h-6 w-6 max-sm:h-11 max-sm:w-11 place-items-center rounded-full text-fg-3 transition-colors hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                          <X size={13} aria-hidden="true" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                {!readOnly && (
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      aria-label="Nome da nova tarefa"
                      value={novaTarefa}
                      onChange={e => setNovaTarefa(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTarefa())}
                      placeholder="Digite o nome da tarefa e pressione Enter"
                    />
                    <Button icone={<Plus size={16} aria-hidden="true" />} onClick={addTarefa}>Adicionar</Button>
                  </div>
                )}
              </div>

              <TarefasAutomaticasCampo
                setor="pessoal"
                regime={form.regime}
                atividade={form.atividade}
                personalizadas={form.tarefas_personalizadas}
                excluidas={form.tarefas_excluidas}
                onChangeExcluidas={v => set('tarefas_excluidas', v)}
                readOnly={readOnly}
              />
            </Secao>
          </>
        )}
      </Modal>
      {nomeParaCriar && (
        <NovoTipoTarefaModal
          nome={nomeParaCriar}
          setor="pessoal"
          onCancel={() => setNomeParaCriar(null)}
          onCriado={handleTipoCriado}
        />
      )}
      {gruposAberto && clienteId && (
        <GruposTarefasModal
          clienteId={clienteId}
          setor="pessoal"
          tarefasDisponiveis={form.tarefas_personalizadas}
          onClose={() => setGruposAberto(false)}
        />
      )}
    </>
  )
}
