'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import { SELECT_CLIENTE_FISCAL, flattenClienteFiscal } from '@/lib/clientes-fiscal'
import CamposFiscais, { Secao, type CamposFiscaisData } from './CamposFiscais'
import { tarefaExisteNoCatalogo } from '@/lib/tarefa-tipos'
import { listarNomesDeTiposSemUso } from '@/lib/tarefa-tipos-actions'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'
import type { CatalogoCliente } from '@/lib/catalogo-cliente'
import { salvarCliente } from '@/app/fiscal/clientes/actions'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'
import { EsqueletoLinhas } from '@/components/ui/Esqueleto'
import { useConfirmar } from '@/components/ui/ConfirmDialog'

interface FormData {
  cod: string
  cnpj: string
  nome: string
  regime: string
  atividade: string[]
  municipio: string
  uf: string
  responsavel: string
  contato_chat: string
  prioridade: number
  declaracao_anual: boolean
  envia_iss: boolean
  confere_siga: boolean
  faz_dossie: boolean
  login_iss: string
  senha_iss: string
  email_envio_iss: string
  tarefas_personalizadas: string[]
  tarefas_excluidas: string[]
}

interface Props {
  clienteId: string | null  // null = novo
  responsaveis: string[]
  onClose: () => void
  readOnly?: boolean
  catalogo: CatalogoCliente
}

const emptyForm = (): FormData => ({
  cod: '', cnpj: '', nome: '', regime: '', atividade: [],
  municipio: '', uf: '', responsavel: '', contato_chat: '', prioridade: 3,
  declaracao_anual: false, envia_iss: false, confere_siga: false, faz_dossie: false,
  login_iss: '', senha_iss: '', email_envio_iss: '',
  tarefas_personalizadas: [], tarefas_excluidas: [],
})

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export default function EmpresaModal({ clienteId, responsaveis, onClose, readOnly = false, catalogo }: Props) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = !!clienteId
  const confirmar = useConfirmar()
  const identificacaoRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState<FormData>(emptyForm())
  const [personalizadasOriginais, setPersonalizadasOriginais] = useState<string[]>([])
  const [novaTarefa, setNovaTarefa] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [catalogoNomes, setCatalogoNomes] = useState<string[]>([])
  const [nomeParaCriar, setNomeParaCriar] = useState<string | null>(null)

  useEffect(() => {
    if (!clienteId) return
    sb.from('clientes').select(SELECT_CLIENTE_FISCAL).eq('id', clienteId).single().then(({ data: raw }) => {
      if (!raw) return
      const data = flattenClienteFiscal(raw)
      const mitParts = (data.mit ?? '').split('/')
      setForm({
        cod: data.cod ?? '',
        cnpj: data.cnpj ?? '',
        nome: data.nome ?? '',
        regime: data.regime ?? '',
        atividade: data.atividade ?? [],
        municipio: mitParts[0] ?? '',
        uf: mitParts[1] ?? '',
        responsavel: data.responsavel ?? '',
        contato_chat: data.contato_chat ?? '',
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
    // Tipo que ninguém usa não conta como existente: digitar o nome dele abre a criação.
    Promise.all([sb.from('tarefa_tipos').select('nome').eq('setor', 'fiscal'), listarNomesDeTiposSemUso('fiscal')]).then(([{ data }, semUso]) => {
      setCatalogoNomes((data ?? []).map(t => t.nome as string).filter(n => !semUso.includes(n)))
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
    const mit = form.municipio && form.uf
      ? `${form.municipio}/${form.uf}`
      : form.municipio || null

    const clientePayload = {
      nome:         form.nome,
      cnpj:         form.cnpj || null,
      mit,
      contato_chat: form.contato_chat || null,
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

    const { error } = await salvarCliente(clienteId, clientePayload, fiscalPayload)
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
          <EsqueletoLinhas linhas={6} className="py-4" />
        ) : (
          <>
            <Secao titulo="Identificação">
              <div ref={identificacaoRef} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <Field rotulo="CNPJ" ajuda={loadingCnpj ? 'Buscando dados do CNPJ…' : 'Buscamos os dados quando o CNPJ estiver completo'} className="sm:col-span-2">
                  {c => <Input id={c.id} aria-describedby={c.describedBy} className="font-mono" placeholder="00.000.000/0000-00" disabled={readOnly}
                    value={form.cnpj} onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }} />}
                </Field>
                <Field rotulo="Código">
                  {c => <Input id={c.id} placeholder="00000" disabled={readOnly} value={form.cod} onChange={e => set('cod', e.target.value)} />}
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
                <Field rotulo="Contato" className="sm:col-span-2">
                  {c => <Input id={c.id} placeholder="Nome ou telefone" disabled={readOnly} value={form.contato_chat} onChange={e => set('contato_chat', e.target.value)} />}
                </Field>
              </div>
            </Secao>

            <CamposFiscais
              form={form}
              set={set as <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void}
              responsaveis={responsaveis}
              catalogo={catalogo}
              isEdit={isEdit}
              clienteId={clienteId}
              readOnly={readOnly}
              novaTarefa={novaTarefa}
              setNovaTarefa={setNovaTarefa}
              addTarefa={addTarefa}
            />

          </>
        )}
      </Modal>
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
