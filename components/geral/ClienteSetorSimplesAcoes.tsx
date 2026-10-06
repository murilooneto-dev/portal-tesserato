'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus } from 'lucide-react'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import { salvarClienteSetorSimples, type SetorSimples } from '@/lib/cliente-setor-simples-actions'
import NovoTipoTarefaModal from '@/components/geral/NovoTipoTarefaModal'
import { Secao } from '@/components/fiscal/CamposFiscais'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Chip'
import { Field } from '@/components/ui/Field'
import { Input, Select } from '@/components/ui/Input'
import { Aviso } from '@/components/ui/Aviso'

interface ClienteBase {
  id: string
  nome: string
  cnpj: string | null
  municipio: string | null
  uf: string | null
  contato_chat: string | null
}

interface Props {
  setor: SetorSimples
  cliente: ClienteBase
  // Tipos de tarefa ativos do setor (catálogo) e os que este cliente já tem.
  catalogoTarefas: string[]
  tarefasDoCliente: string[]
}

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

// Botão "Editar dados" da ficha do cliente no Societário e no Financeiro. Estes
// setores não têm enquadramento próprio (regime, responsável…): edita-se a
// identificação do cliente e quais tarefas do setor ele tem.
export default function ClienteSetorSimplesAcoes(props: Props) {
  const [editando, setEditando] = useState(false)
  return (
    <>
      <Button icone={<Pencil size={16} aria-hidden="true" />} onClick={() => setEditando(true)} className="max-sm:h-11">Editar dados</Button>
      {editando && <ClienteSetorSimplesModal {...props} onClose={() => setEditando(false)} />}
    </>
  )
}

function ClienteSetorSimplesModal({ setor, cliente, catalogoTarefas, tarefasDoCliente, onClose }: Props & { onClose: () => void }) {
  const router = useRouter()
  const [form, setForm] = useState({
    cnpj: cliente.cnpj ?? '',
    nome: cliente.nome ?? '',
    municipio: cliente.municipio ?? '',
    uf: cliente.uf ?? '',
    contato_chat: cliente.contato_chat ?? '',
  })
  const [catalogo, setCatalogo] = useState<string[]>(catalogoTarefas)
  const [tarefas, setTarefas] = useState<string[]>(tarefasDoCliente)
  const [novaTarefa, setNovaTarefa] = useState('')
  const [nomeParaCriar, setNomeParaCriar] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm(p => ({ ...p, [k]: v }))
  }

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

  function toggleTarefa(nome: string) {
    setTarefas(prev => prev.includes(nome) ? prev.filter(t => t !== nome) : [...prev, nome])
  }

  function addTarefa() {
    const t = novaTarefa.trim()
    if (!t) return
    // Nome que já existe no catálogo só é marcado; nome novo abre a criação do tipo.
    const existente = catalogo.find(c => c.trim().toLowerCase() === t.toLowerCase())
    if (existente) {
      setTarefas(prev => prev.includes(existente) ? prev : [...prev, existente])
      setNovaTarefa('')
    } else {
      setNomeParaCriar(t)
    }
  }

  function handleTipoCriado(nome: string) {
    setCatalogo(prev => [...prev, nome])
    setTarefas(prev => [...prev, nome])
    setNovaTarefa('')
    setNomeParaCriar(null)
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    setErro(null)
    const { error } = await salvarClienteSetorSimples(setor, cliente.id, {
      nome: form.nome,
      cnpj: form.cnpj || null,
      municipio: form.municipio || null,
      uf: form.uf || null,
      contato_chat: form.contato_chat || null,
    }, tarefas)
    setSaving(false)
    if (error) { setErro(error); return }
    router.refresh()
    onClose()
  }

  // UF já gravada que não está na lista continua selecionável.
  const ufForaDaLista = form.uf && !UFS.includes(form.uf)

  return (
    <>
      <Modal
        aberto
        onFechar={onClose}
        bloqueado={saving}
        largura="g"
        titulo="Editar empresa"
        subtitulo={cliente.nome}
        rodape={
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
            {erro && <div role="alert" className="min-w-0 flex-1 basis-60"><Aviso tom="dng">{erro}</Aviso></div>}
            <div className="ml-auto flex gap-2.5">
              <Button variante="fantasma" onClick={onClose} disabled={saving}>Cancelar</Button>
              <Button variante="primario" onClick={handleSave} carregando={saving} disabled={!form.nome.trim()}>
                {saving ? 'Salvando…' : 'Salvar empresa'}
              </Button>
            </div>
          </div>
        }
      >
        <Secao titulo="Identificação">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <Field rotulo="CNPJ" ajuda={loadingCnpj ? 'Buscando dados do CNPJ…' : 'Buscamos os dados quando o CNPJ estiver completo'} className="sm:col-span-3">
              {c => <Input id={c.id} aria-describedby={c.describedBy} className="font-mono" placeholder="00.000.000/0000-00"
                value={form.cnpj} onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }} />}
            </Field>
            <Field rotulo="UF">
              {c => (
                <Select id={c.id} value={form.uf} onChange={e => set('uf', e.target.value)}>
                  <option value="">Selecionar…</option>
                  {ufForaDaLista && <option value={form.uf}>{form.uf} (atual)</option>}
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </Select>
              )}
            </Field>
            <Field rotulo="Razão social" obrigatorio className="sm:col-span-3">
              {c => <Input id={c.id} data-autofocus value={form.nome} onChange={e => set('nome', e.target.value)} />}
            </Field>
            <Field rotulo="Município">
              {c => <Input id={c.id} value={form.municipio} onChange={e => set('municipio', e.target.value)} />}
            </Field>
            <Field rotulo="Contato" className="sm:col-span-4">
              {c => <Input id={c.id} placeholder="Nome ou telefone" value={form.contato_chat} onChange={e => set('contato_chat', e.target.value)} />}
            </Field>
          </div>
        </Secao>

        <Secao titulo="Tarefas do cliente">
          <div>
            <span id="rotulo-tarefas-cliente-setor" className="mb-2 block text-[13px] font-medium text-fg-2">
              Tarefas ({tarefas.length} de {catalogo.length})
            </span>
            <div role="group" aria-labelledby="rotulo-tarefas-cliente-setor" className="mb-3 flex min-h-[34px] flex-wrap gap-2">
              {catalogo.length === 0 && (
                <p className="text-xs text-fg-3">Nenhuma tarefa no catálogo do setor. Crie a primeira abaixo.</p>
              )}
              {catalogo.map(t => (
                <Chip key={t} ativo={tarefas.includes(t)} onClick={() => toggleTarefa(t)} className="max-sm:h-11">{t}</Chip>
              ))}
            </div>
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
            <p className="mt-2 text-xs text-fg-3">
              Marque as tarefas que este cliente tem no setor. Uma tarefa marcada agora passa a valer a partir deste mês.
            </p>
          </div>
        </Secao>
      </Modal>
      {nomeParaCriar && (
        <NovoTipoTarefaModal
          nome={nomeParaCriar}
          setor={setor}
          onCancel={() => setNomeParaCriar(null)}
          onCriado={handleTipoCriado}
        />
      )}
    </>
  )
}
