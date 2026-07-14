'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { buscarCnpj } from '@/lib/buscar-cnpj'
import CamposFiscais, { type CamposFiscaisData } from './CamposFiscais'

interface FormData {
  cod: string
  cnpj: string
  nome: string
  regime: string
  atividade: string
  grupo: string
  municipio: string
  uf: string
  responsavel: string
  contato_chat: string
  prioridade: number
  declaracao_anual: boolean
  envia_iss: boolean
  confere_siga: boolean
  login_iss: string
  senha_iss: string
  email_envio_iss: string
  tarefas_personalizadas: string[]
}

interface Props {
  clienteId: string | null  // null = novo
  responsaveis: string[]
  onClose: () => void
  readOnly?: boolean
  templates: Record<string, string[]>
}

const emptyForm = (): FormData => ({
  cod: '', cnpj: '', nome: '', regime: '', atividade: '', grupo: '',
  municipio: '', uf: '', responsavel: '', contato_chat: '', prioridade: 3,
  declaracao_anual: false, envia_iss: false, confere_siga: false,
  login_iss: '', senha_iss: '', email_envio_iss: '',
  tarefas_personalizadas: [],
})

const inputCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--fg)]/5 border border-[var(--fg)]/10 text-[var(--fg)] text-sm focus:outline-none focus:border-[var(--accent)]/50 transition-colors disabled:opacity-50 disabled:cursor-default"
const labelCls = "block text-[10px] font-bold text-[var(--fg)]/40 uppercase tracking-widest mb-1.5"

export default function EmpresaModal({ clienteId, responsaveis, onClose, readOnly = false, templates }: Props) {
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
    Promise.all([
      sb.from('clientes').select('*').eq('id', clienteId).single(),
      sb.from('tarefas').select('tipo').eq('cliente_id', clienteId),
    ]).then(([{ data }, { data: tarefasDB }]) => {
      if (!data) return
      const mitParts = (data.mit ?? '').split('/')
      // Tipos únicos já existentes no banco para esse cliente (da tabela tarefas)
      const tiposExistentes = Array.from(new Set(
        (tarefasDB ?? []).map((t: { tipo: string }) => t.tipo).filter(Boolean)
      )).sort() as string[]
      // Se já tem tarefas_personalizadas salvas usa elas, senão usa os tipos do banco
      const personalizadas: string[] =
        (data.tarefas_personalizadas && data.tarefas_personalizadas.length > 0)
          ? data.tarefas_personalizadas
          : tiposExistentes
      setForm({
        cod: data.cod ?? '',
        cnpj: data.cnpj ?? '',
        nome: data.nome ?? '',
        regime: data.regime ?? '',
        atividade: data.atividade ?? '',
        grupo: data.grupo ?? '',
        municipio: mitParts[0] ?? '',
        uf: mitParts[1] ?? '',
        responsavel: data.responsavel ?? '',
        contato_chat: data.contato_chat ?? '',
        prioridade: data.prioridade ?? 3,
        declaracao_anual: data.declaracao_anual ?? false,
        envia_iss: data.envia_iss ?? false,
        confere_siga: data.confere_siga ?? false,
        login_iss: data.login_iss ?? '',
        senha_iss: data.senha_iss ?? '',
        email_envio_iss: data.email_envio_iss ?? '',
        tarefas_personalizadas: personalizadas,
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

    const payload = {
      cod:                    form.cod || null,
      nome:                   form.nome,
      cnpj:                   form.cnpj || null,
      regime:                 form.regime || null,
      atividade:              form.atividade || null,
      grupo:                  form.grupo || null,
      mit,
      responsavel:            form.responsavel || null,
      contato_chat:           form.contato_chat || null,
      prioridade:             form.prioridade,
      declaracao_anual:       form.declaracao_anual,
      envia_iss:              form.envia_iss,
      confere_siga:           form.confere_siga,
      login_iss:              form.envia_iss ? form.login_iss || null : null,
      senha_iss:              form.envia_iss ? form.senha_iss || null : null,
      email_envio_iss:        form.envia_iss ? form.email_envio_iss || null : null,
      tarefas_personalizadas: form.tarefas_personalizadas,
    }

    const { error } = isEdit
      ? await sb.from('clientes').update(payload).eq('id', clienteId)
      : await sb.from('clientes').insert(payload)

    setSaving(false)
    if (error) {
      setErro(error.message)
      return
    }
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[var(--bg-surface)] border border-[var(--fg)]/12 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--fg)]/8 shrink-0">
          <h2 className="text-[var(--fg)] font-bold text-base">{readOnly ? 'Visualizar Empresa' : isEdit ? 'Editar Empresa' : 'Nova Empresa'}</h2>
          <button onClick={onClose} className="text-[var(--fg)]/30 hover:text-[var(--fg)] transition-colors text-xl px-1">×</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {loading ? (
            <p className="text-[var(--fg)]/30 text-sm text-center py-8">Carregando...</p>
          ) : (<>

            {/* CNPJ */}
            <div>
              <label className={labelCls}>CNPJ {loadingCnpj && <span className="text-[var(--accent)] normal-case tracking-normal">Buscando...</span>}</label>
              <input className={inputCls + ' font-mono'} value={form.cnpj}
                onChange={e => { set('cnpj', e.target.value); fetchCnpj(e.target.value) }}
                placeholder="00.000.000/0000-00" disabled={readOnly} />
            </div>

            {/* Razão Social */}
            <div>
              <label className={labelCls}>Razão Social *</label>
              <input className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} required disabled={readOnly} />
            </div>

            {/* Município + UF */}
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

            {/* Contato Chat */}
            <div>
              <label className={labelCls}>Contato Chat</label>
              <input className={inputCls} value={form.contato_chat}
                onChange={e => set('contato_chat', e.target.value)} disabled={readOnly} />
            </div>

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

          </>)}
        </div>

        {/* Erro */}
        {erro && (
          <div className="mx-6 mb-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            ⚠ {erro}
          </div>
        )}

        {/* Footer */}
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
              {saving ? 'Salvando...' : 'Salvar empresa'}
            </button>
          </>)}
        </div>
      </div>
    </div>
  )
}
