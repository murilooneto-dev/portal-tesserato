'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import CamposFiscais, { type CamposFiscaisData } from '@/components/fiscal/CamposFiscais'
import SectorSection from '@/components/geral/SectorSection'
import { flattenClienteFiscal } from '@/lib/clientes-fiscal'
import { SETORES, SETOR_LABEL, type UserSetor } from '@/lib/types'

interface FormData extends CamposFiscaisData {
  nome: string
  cnpj: string
  municipio: string
  uf: string
  contato_chat: string
  setores: UserSetor[]
}

interface Props {
  clienteId: string | null
  responsaveis: string[]
  templates: Record<string, string[]>
  onClose: () => void
  readOnly?: boolean
}

const emptyForm = (): FormData => ({
  nome: '', cnpj: '', municipio: '', uf: '', contato_chat: '', setores: ['fiscal'],
  cod: '', regime: '', atividade: '', grupo: '', responsavel: '', prioridade: 3,
  declaracao_anual: false, envia_iss: false, confere_siga: false,
  login_iss: '', senha_iss: '', email_envio_iss: '',
  tarefas_personalizadas: [],
})

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function ClienteGeralModal({ clienteId, responsaveis, templates, onClose, readOnly = false }: Props) {
  const router = useRouter()
  const sb = createClient()
  const isEdit = !!clienteId

  const [form, setForm] = useState<FormData>(emptyForm())
  const [novaTarefa, setNovaTarefa] = useState('')
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [loadingCnpj, setLoadingCnpj] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!clienteId) return
    // Left join (não !inner): um cliente pode não ter setor Fiscal marcado e,
    // nesse caso, legitimamente não tem linha em clientes_fiscal.
    sb.from('clientes').select('*, clientes_fiscal(*)').eq('id', clienteId).single().then(({ data: raw }) => {
      if (!raw) return
      const data = flattenClienteFiscal(raw)
      const mitParts = (data.mit ?? '').split('/')
      setForm({
        nome: data.nome ?? '',
        cnpj: data.cnpj ?? '',
        municipio: data.municipio ?? mitParts[0] ?? '',
        uf: data.uf ?? mitParts[1] ?? '',
        contato_chat: data.contato_chat ?? '',
        setores: (data.setores ?? ['fiscal']) as UserSetor[],
        cod: data.cod ?? '',
        regime: data.regime ?? '',
        atividade: data.atividade ?? '',
        grupo: data.grupo ?? '',
        responsavel: data.responsavel ?? '',
        prioridade: data.prioridade ?? 3,
        declaracao_anual: data.declaracao_anual ?? false,
        envia_iss: data.envia_iss ?? false,
        confere_siga: data.confere_siga ?? false,
        login_iss: data.login_iss ?? '',
        senha_iss: data.senha_iss ?? '',
        email_envio_iss: data.email_envio_iss ?? '',
        tarefas_personalizadas: data.tarefas_personalizadas ?? [],
      })
      setLoading(false)
    })
  }, [clienteId])

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
    set('tarefas_personalizadas', [...form.tarefas_personalizadas, t])
    setNovaTarefa('')
  }

  async function handleSave() {
    if (!form.nome.trim()) return
    setSaving(true)
    setErro(null)

    const mit = form.municipio && form.uf
      ? `${form.municipio}/${form.uf}`
      : form.municipio || null

    const clientePayload = {
      nome:         form.nome,
      cnpj:         form.cnpj || null,
      municipio:    form.municipio || null,
      uf:           form.uf || null,
      mit,
      contato_chat: form.contato_chat || null,
      setores:      form.setores.length > 0 ? form.setores : ['fiscal'],
    }

    const fiscalPayload = {
      cod:                    form.cod || null,
      regime:                 form.regime || null,
      atividade:              form.atividade || null,
      grupo:                  form.grupo || null,
      responsavel:            form.responsavel || null,
      prioridade:             form.prioridade,
      declaracao_anual:       form.declaracao_anual,
      envia_iss:              form.envia_iss,
      confere_siga:           form.confere_siga,
      login_iss:              form.envia_iss ? form.login_iss || null : null,
      senha_iss:              form.envia_iss ? form.senha_iss || null : null,
      email_envio_iss:        form.envia_iss ? form.email_envio_iss || null : null,
      tarefas_personalizadas: form.tarefas_personalizadas,
    }

    if (isEdit) {
      // O bloco Fiscal é somente-leitura ao editar (edição fica exclusiva de
      // /fiscal/clientes) — não sobrescrevemos uma linha clientes_fiscal
      // já existente. Mas se o setor Fiscal acabou de ser marcado num
      // cliente que nunca teve linha em clientes_fiscal, provisionamos uma
      // com os valores atuais do form (defaults, já que o bloco nunca foi
      // editável aqui) — sem isso o cliente fica invisível em toda tela do
      // Fiscal, que só lista quem tem clientes_fiscal.
      const { error } = await sb.from('clientes').update(clientePayload).eq('id', clienteId)
      if (error) {
        setSaving(false)
        setErro(error.message)
        return
      }
      if (form.setores.includes('fiscal')) {
        const { data: existente } = await sb.from('clientes_fiscal').select('cliente_id').eq('cliente_id', clienteId).maybeSingle()
        if (!existente) {
          const { error: errFiscal } = await sb.from('clientes_fiscal').insert({ cliente_id: clienteId, ...fiscalPayload })
          if (errFiscal) {
            setSaving(false)
            setErro(errFiscal.message)
            return
          }
        }
      }
      setSaving(false)
    } else {
      const { data: novoCliente, error: errCliente } = await sb.from('clientes').insert(clientePayload).select('id').single()
      if (errCliente || !novoCliente) {
        setSaving(false)
        setErro(errCliente?.message ?? 'Falha ao criar cliente')
        return
      }
      if (form.setores.includes('fiscal')) {
        const { error: errFiscal } = await sb.from('clientes_fiscal').insert({ cliente_id: novoCliente.id, ...fiscalPayload })
        if (errFiscal) {
          setSaving(false)
          setErro(errFiscal.message)
          return
        }
      }
      setSaving(false)
    }

    router.refresh()
    onClose()
  }

  const mostraFiscal = form.setores.includes('fiscal')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">{readOnly ? 'Visualizar Cliente' : isEdit ? 'Editar Cliente' : 'Novo Cliente'}</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-[var(--fg)]/30 text-sm text-center py-8">Carregando...</p>
          ) : (<>

            <div>
              <label className={labelCls}>CNPJ {loadingCnpj && <span className="text-[var(--accent)] normal-case tracking-normal">Buscando...</span>}</label>
              <input className={inputCls + ' font-mono'} value={form.cnpj}
                onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }}
                placeholder="00.000.000/0000-00" disabled={readOnly} />
            </div>

            <div>
              <label className={labelCls}>Razão Social *</label>
              <input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} required disabled={readOnly} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Município</label>
                <input className={inputCls} value={form.municipio} onChange={e => set('municipio', e.target.value)} disabled={readOnly} />
              </div>
              <div>
                <label className={labelCls}>UF</label>
                <input className={inputCls + ' uppercase'} value={form.uf}
                  onChange={e => set('uf', e.target.value.toUpperCase().slice(0, 2))} maxLength={2} disabled={readOnly} />
              </div>
            </div>

            <div>
              <label className={labelCls}>Contato</label>
              <input className={inputCls} value={form.contato_chat} onChange={e => set('contato_chat', e.target.value)} disabled={readOnly} />
            </div>

            <div>
              <label className={labelCls}>Setores</label>
              <div className="grid grid-cols-2 gap-2">
                {SETORES.map(setor => (
                  <label key={setor} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="checkbox" checked={form.setores.includes(setor)} onChange={() => toggleSetor(setor)}
                      className="w-3.5 h-3.5 accent-[var(--accent)]" disabled={readOnly} />
                    <span className="text-[var(--fg)]/60 text-xs">{SETOR_LABEL[setor]}</span>
                  </label>
                ))}
              </div>
            </div>

            {mostraFiscal && isEdit && (
              <SectorSection title="Dados do Fiscal" note="Somente leitura — edite em Fiscal → Clientes" defaultOpen={false}>
                <CamposFiscais
                  form={form}
                  set={set as <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void}
                  responsaveis={responsaveis}
                  templates={templates}
                  isEdit={isEdit}
                  readOnly={true}
                  novaTarefa={novaTarefa}
                  setNovaTarefa={setNovaTarefa}
                  addTarefa={addTarefa}
                />
              </SectorSection>
            )}

            {mostraFiscal && !isEdit && (
              <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/3 p-4 space-y-5">
                <p className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-widest">Dados do Fiscal</p>
                <CamposFiscais
                  form={form}
                  set={set as <K extends keyof CamposFiscaisData>(k: K, v: CamposFiscaisData[K]) => void}
                  responsaveis={responsaveis}
                  templates={templates}
                  isEdit={isEdit}
                  readOnly={readOnly}
                  novaTarefa={novaTarefa}
                  setNovaTarefa={setNovaTarefa}
                  addTarefa={addTarefa}
                />
              </div>
            )}

          </>)}
        </div>

        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--fg)]/8 shrink-0">
          {readOnly ? (
            <button onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-[var(--fg)]/8 border border-[var(--fg)]/12 text-[var(--fg)]/70 hover:text-[var(--fg)] text-sm transition-colors">
              Fechar
            </button>
          ) : (<>
            <button onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-[var(--fg)]/12 text-[var(--fg)]/50 hover:text-[var(--fg)] text-sm transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving || !form.nome.trim()}
              className="px-6 py-2.5 rounded-xl bg-[var(--accent)] text-[var(--fg)] text-sm font-semibold hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50">
              {saving ? 'Salvando...' : 'Salvar cliente'}
            </button>
          </>)}
        </div>
      </div>
    </div>
  )
}
